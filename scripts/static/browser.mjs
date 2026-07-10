/**
 * Snapshot capture: HTTP policy.
 *
 * Mado's static snapshot is a "strict" capture by default — any failed
 * fetch surfaces as a snapshot failure unless it falls into a small,
 * explicit allow-list. The intent is to catch broken deployments at
 * build time, not at first-paint in production.
 *
 *   FATAL (snapshot fails):
 *     - the main document
 *     - any script / module
 *     - any stylesheet
 *     - any fetch tracked by the runtime (resource(), mutation())
 *     - any custom-element definition referenced from the rendered DOM
 *     - any route module dynamic import
 *
 *   IGNORED (warning at most):
 *     - /favicon.ico, /favicon.svg, /robots.txt (often missing in
 *       development; user owns the production copy)
 *     - data: URLs (inlined, not network traffic)
 *
 *   QUALITY HINTS (timeout → diagnostic, snapshot proceeds):
 *     - document.fonts.ready  (cap: 5s)
 *     - requestAnimationFrame paint frames (cap: 1s)
 *
 * To intentionally allow an optional resource to fail without breaking
 * the snapshot, host it through one of the ignored paths or remove it
 * from the initial render. There is no per-element "this can 404" escape
 * hatch yet; if you need one, the place to add it is
 * `isIgnorableResourceUrl()` below.
 */
import { existsSync } from "node:fs";

import { logger } from "../logger.mjs";

const KNOWN_CHROMIUM_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Chromium\\Application\\chrome.exe",
];

export async function captureStaticRoutes(options) {
  const { chromium } = await importPlaywright();
  const browser = await launchBrowser(chromium, options);
  const captured = [];

  try {
    const browserVersion =
      typeof browser.version === "function" ? browser.version() : null;
    if (browserVersion) {
      logger.info("static", "browser", `browser: chromium ${browserVersion}`);
    }
    for (const record of options.records) {
      const html = await captureRoute(browser, record, options);
      captured.push({ ...record, html });
    }
  } finally {
    await browser.close();
  }

  return captured;
}

/**
 * Join a Mado-canonical base (`"/"` or `"/prefix/"`) with a route
 * pathname so the capture browser navigates to the same URL shape the
 * deployed app will serve.
 *
 *   withBase("/",       "/docs")  === "/docs"
 *   withBase("/mado/",  "/docs")  === "/mado/docs"
 *   withBase("/mado/",  "/")      === "/mado/"
 */
function withBaseLocal(base, pathname) {
  const b = base && base !== "/" ? base : "/";
  const p = pathname || "/";
  const abs = p.startsWith("/") ? p : "/" + p;
  if (b === "/") return abs;
  if (abs === "/") return b.slice(0, -1) || "/";
  return b + abs.slice(1);
}

async function captureRoute(browser, record, options) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  const failedRequests = [];
  const consoleErrors = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (request) => {
    if (isIgnorableResourceUrl(request.url())) return;
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim(),
    );
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (isIgnorableResourceUrl(response.url())) return;
    failedRequests.push(`${response.request().method()} ${response.url()} ${response.status()}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    consoleErrors.push(text);
  });

  try {
    // Navigate through the capture server using the real deployment URL
    // shape: base-prefixed pathname. The runtime sees the same
    // `location.pathname` it would see on the production CDN, so the
    // router's stripBase()/withBase() codepaths are exercised exactly
    // once per snapshot.
    const browserPath = withBaseLocal(options.base ?? "/", record.pathname);
    await page.goto(`${options.serverOrigin}${browserPath}`, {
      waitUntil: "domcontentloaded",
      timeout: options.timeout,
    });

    await waitForMadoStability(page, record, options.timeout);

    // Web fonts that never resolve must not block the snapshot. Fonts
    // are best-effort: if `document.fonts.ready` does not settle within
    // the cap, we proceed and let the missing-font warning surface
    // through the existing console-message listener.
    await runWithTimeout(
      page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      }),
      options.fontsTimeout ?? 5_000,
      `[mado:static] ${record.pathname}: document.fonts.ready did not settle in time; capturing without font metrics.`,
    );

    // Two paint frames so any rAF-driven layout/style effect can flush
    // before we serialize the DOM. Bounded to prevent a stalled tab from
    // hanging the pipeline.
    await runWithTimeout(
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      ),
      options.paintTimeout ?? 1_000,
      `[mado:static] ${record.pathname}: paint frames did not flush in time; capturing anyway.`,
    );

    const undefinedCustomElements = await collectUndefinedCustomElements(page);
    if (undefinedCustomElements.length > 0) {
      throw new Error(
        `[mado:static] ${record.pathname}: unresolved custom elements: ` +
          undefinedCustomElements.join(", "),
      );
    }

    if (pageErrors.length || consoleErrors.length || failedRequests.length) {
      const diagnostics = await runtimeDiagnostics(page);
      throw new Error(
        formatRouteFailure(record, {
          diagnostics,
          pageErrors,
          consoleErrors,
          failedRequests,
        }),
      );
    }

    return await serializeDocument(page, {
      appId: options.appId ?? "app",
      serverOrigin: options.serverOrigin,
      baseUrl: options.baseUrl,
      site: options.site ?? "",
      base: options.base ?? "/",
      pathname: record.pathname,
    });
  } finally {
    await context.close();
  }
}

async function waitForMadoStability(page, record, timeout) {
  try {
    await withTimeout(
      page.evaluate(async () => {
        const runtime = window.__MADO_STATIC__;
        if (!runtime) {
          throw new Error("window.__MADO_STATIC__ was not installed.");
        }
        // Runtime exposes phase-bounded timeouts internally
        // (routeReady, resources). The outer `timeout` here is a
        // safety net for the whole sequence.
        await runtime.whenStable();
      }),
      timeout,
    );
  } catch (err) {
    const diagnostics = await runtimeDiagnostics(page);
    throw new Error(
      formatRouteFailure(record, {
        diagnostics,
        pageErrors: [err.message],
        consoleErrors: [],
        failedRequests: [],
      }),
    );
  }
}

/**
 * Best-effort timeout wrapper that swallows timeouts (logging a
 * diagnostic) instead of failing the snapshot. Used for fonts and paint
 * frames — both are render-quality hints, not correctness checks.
 */
async function runWithTimeout(promise, timeout, swallowMessage) {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("timeout")),
          timeout,
        );
      }),
    ]);
  } catch (err) {
    if (err && err.message === "timeout") {
      logger.warn("static", "browser-resource", swallowMessage);
      return;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runtimeDiagnostics(page) {
  try {
    return await page.evaluate(() => window.__MADO_STATIC__?.diagnostics?.() ?? null);
  } catch {
    return null;
  }
}

async function collectUndefinedCustomElements(page) {
  return page.evaluate(() => {
    const names = new Set();
    const visit = (root) => {
      for (const el of root.querySelectorAll("*")) {
        const name = el.localName;
        if (name.includes("-") && !customElements.get(name)) names.add(name);
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(document);
    return [...names].sort();
  });
}

async function serializeDocument(page, options) {
  return page.evaluate((opts) => {
    const { appId, serverOrigin, baseUrl, site, base, pathname } = opts;
    const added = [];
    // Strip both the modern attribute marker and the legacy inline script
    // (older snapshots may still contain it). The seed <script> is
    // intentionally kept so the production client can consume it on boot.
    document.documentElement.removeAttribute("data-mado-static-capture");
    for (const script of document.querySelectorAll("script[data-mado-static-mode]")) {
      script.remove();
    }

    const app = document.getElementById(appId);
    if (app) app.setAttribute("data-mado-static", "");

    // ---- canonical / og:url fallback ----
    //
    // If page.head() did not produce these, derive them from `site + base
    // + pathname` so static documents always carry the production URL.
    // We only fill in absent values; explicit user-provided canonical /
    // og:url wins.
    if (site) {
      const absoluteUrl = buildAbsoluteUrl(site, base, pathname);
      ensureCanonical(absoluteUrl);
      ensureOgUrl(absoluteUrl);
    }

    // Walk every open shadow root reachable from the document and run the
    // same normalization in each. Mado canonical components live inside
    // shadow trees, so a Light-DOM-only walker would lose form state and
    // CSS for the very components DSD is meant to serialize.
    const openShadowRoots = collectShadowRoots(document);
    for (const root of [document, ...openShadowRoots]) {
      normalizeDomStateIn(root);
    }
    materializeShadowStyles(openShadowRoots, added);

    // Verification: count live open shadow roots before serialization and
    // assert the same count of <template shadowrootmode> in the output.
    // A drop indicates a host that was not opened with `serializable: true`.
    const expectedShadowRoots = openShadowRoots.length;

    let html;
    try {
      if (typeof document.documentElement.getHTML !== "function") {
        throw new Error(
          "document.documentElement.getHTML() is unavailable in this browser.",
        );
      }
      const attrs = [...document.documentElement.attributes]
        .map((attr) => `${attr.name}="${escapeAttr(attr.value)}"`)
        .join(" ");
      html =
        "<!doctype html>\n" +
        `<html${attrs ? ` ${attrs}` : ""}>` +
        document.documentElement.getHTML({
          serializableShadowRoots: true,
        }) +
        "</html>";
    } finally {
      for (const node of added) node.remove();
    }

    const serializedShadowRoots = (
      html.match(/<template[^>]+shadowrootmode\b/g) ?? []
    ).length;
    if (serializedShadowRoots < expectedShadowRoots) {
      throw new Error(
        `[mado:static] DSD count mismatch: ${expectedShadowRoots} open ` +
          `shadow roots present but ${serializedShadowRoots} serialized. ` +
          "Make sure all custom elements attach their shadow root with " +
          "{ mode: 'open', serializable: true }.",
      );
    }

    return html.split(serverOrigin).join(baseUrl.replace(/\/$/, ""));

    function buildAbsoluteUrl(origin, baseValue, route) {
      const left = origin.replace(/\/+$/, "");
      const b = baseValue && baseValue !== "/" ? baseValue : "/";
      const p = route || "/";
      const abs = p.startsWith("/") ? p : "/" + p;
      let combined;
      if (b === "/") {
        combined = left + abs;
      } else if (abs === "/") {
        // "/mado/" + "/" → "/mado" (canonical pathnames have no trailing slash
        // except for the bare root).
        combined = left + b.slice(0, -1);
      } else {
        combined = left + b + abs.slice(1);
      }
      // Strip a single trailing slash unless the whole URL is the bare
      // origin or origin + base root.
      if (
        combined.length > left.length + 1 &&
        combined.endsWith("/")
      ) {
        combined = combined.slice(0, -1);
      }
      return combined;
    }

    function ensureCanonical(absoluteUrl) {
      const existing = document.head.querySelectorAll('link[rel="canonical"]');
      // De-duplicate: keep the first, drop the rest. A second canonical
      // is always wrong and confuses search engines.
      for (let i = 1; i < existing.length; i++) existing[i].remove();
      const first = existing[0];
      if (first) {
        const href = first.getAttribute("href") || "";
        if (!isUsableAbsoluteUrl(href)) {
          first.setAttribute("href", absoluteUrl);
        }
        return;
      }
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", absoluteUrl);
      // Mark the static fallback as Mado-managed so the runtime
      // `applyHead()` (which clears every `[data-mado-head]` before
      // writing the new metadata) can remove stale canonicals after an
      // SPA navigation into a page that does not declare its own.
      link.setAttribute("data-mado-head", "static");
      document.head.appendChild(link);
    }

    function ensureOgUrl(absoluteUrl) {
      const existing = document.head.querySelectorAll('meta[property="og:url"]');
      for (let i = 1; i < existing.length; i++) existing[i].remove();
      const first = existing[0];
      if (first) {
        const content = first.getAttribute("content") || "";
        if (!isUsableAbsoluteUrl(content)) {
          first.setAttribute("content", absoluteUrl);
        }
        return;
      }
      const meta = document.createElement("meta");
      meta.setAttribute("property", "og:url");
      meta.setAttribute("content", absoluteUrl);
      // Same rationale as ensureCanonical: handing the tag to
      // applyHead()'s clean-slate selector prevents stale OG URLs from
      // surviving a navigation into a page without explicit head().
      meta.setAttribute("data-mado-head", "static");
      document.head.appendChild(meta);
    }

    function isUsableAbsoluteUrl(value) {
      if (!value) return false;
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (parsed.hostname === "localhost") return false;
      if (parsed.hostname === "127.0.0.1") return false;
      if (parsed.hostname === "::1") return false;
      // Reject the capture server's own origin: that proves head() emitted
      // a value derived from `location.origin` instead of the public site.
      if (parsed.origin === serverOrigin) return false;
      return true;
    }

    function collectShadowRoots(start) {
      const out = [];
      const stack = [start];
      while (stack.length) {
        const root = stack.pop();
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot) {
            out.push(el.shadowRoot);
            stack.push(el.shadowRoot);
          }
        }
      }
      return out;
    }

    function materializeShadowStyles(roots, out) {
      for (const shadow of roots) {
        for (const sheet of shadow.adoptedStyleSheets ?? []) {
          const text = stylesheetText(sheet);
          if (!text) continue;
          const style = document.createElement("style");
          style.setAttribute("data-mado-static-style", stableHash(text));
          style.textContent = text;
          shadow.insertBefore(style, shadow.firstChild);
          out.push(style);
        }
      }
    }

    function stylesheetText(sheet) {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    }

    function normalizeDomStateIn(root) {
      for (const input of root.querySelectorAll("input")) {
        if (input.type === "password") continue;
        if (input.type === "checkbox" || input.type === "radio") {
          if (input.checked) input.setAttribute("checked", "");
          else input.removeAttribute("checked");
          continue;
        }
        if (input.value !== input.getAttribute("value")) {
          input.setAttribute("value", input.value);
        }
      }

      for (const textarea of root.querySelectorAll("textarea")) {
        textarea.textContent = textarea.value;
      }

      for (const select of root.querySelectorAll("select")) {
        for (const option of select.options) {
          if (option.selected) option.setAttribute("selected", "");
          else option.removeAttribute("selected");
        }
      }

      for (const details of root.querySelectorAll("details")) {
        if (details.open) details.setAttribute("open", "");
        else details.removeAttribute("open");
      }
    }

    function stableHash(text) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(36);
    }

    function escapeAttr(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, options);
}

async function importPlaywright() {
  try {
    return await import("playwright-core");
  } catch {
    throw new Error(
      "[mado:static] package 'playwright-core' is required.\n" +
        "Install it as a dev dependency in this project:\n" +
        "  npm i -D playwright-core",
    );
  }
}

/**
 * The browser pulls `/favicon.ico` automatically and many user shells do
 * not provide one; a 404 there must not fail the snapshot. Likewise any
 * resource the user explicitly marked as optional (data:, devtools).
 */
function isIgnorableResourceUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:")) return true;
  try {
    const u = new URL(url);
    if (u.pathname === "/favicon.ico") return true;
    if (u.pathname === "/favicon.svg") return true;
    if (u.pathname === "/robots.txt") return true;
    return false;
  } catch {
    return false;
  }
}

function isIgnorableConsoleError(text) {
  if (!text) return false;
  // Browser-level "Failed to load resource" lines without context. The
  // matching response/requestfailed listeners already classify the URL.
  if (/Failed to load resource/i.test(text) && !/\bmado\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Browser launch order (explicit-first, Playwright-managed second):
 *
 *   1. --browser-path / MADO_BROWSER_PATH        (operator override)
 *   2. --browser-channel / MADO_BROWSER_CHANNEL  (operator override)
 *   3. chromium.launch()                         (Playwright-managed Chromium)
 *   4. channel: "chrome"                         (system Chrome stable)
 *   5. known system executable paths             (Linux/macOS/Windows)
 *
 * Playwright recommends installing browsers via its own CLI in CI
 * (`npx playwright install --with-deps chromium`) so the browser
 * revision is version-pinned against the running Playwright. We honour
 * that recommendation by trying the managed Chromium *before* any
 * branded Chrome so that pinned-environment CI is deterministic.
 */
async function launchBrowser(chromium, options) {
  const explicitPath = options.browserPath || process.env.MADO_BROWSER_PATH;
  if (explicitPath) {
    return chromium.launch({
      executablePath: explicitPath,
      headless: true,
    });
  }

  const explicitChannel = options.browserChannel || process.env.MADO_BROWSER_CHANNEL;
  if (explicitChannel) {
    return chromium.launch({ channel: explicitChannel, headless: true });
  }

  const errors = [];

  // Playwright-managed Chromium first: matches Playwright's protocol and
  // gives deterministic DSD serialization independent of any branded
  // Chrome that happens to be installed.
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    errors.push(err.message);
  }

  // System Chrome stable second: useful for "does this still work with
  // the latest branded Chrome?" smoke checks.
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (err) {
    errors.push(err.message);
  }

  for (const path of KNOWN_CHROMIUM_PATHS) {
    if (!existsSync(path)) continue;
    try {
      return await chromium.launch({ executablePath: path, headless: true });
    } catch (err) {
      errors.push(err.message);
    }
  }

  throw new Error(
    "[mado:static] No compatible Chromium browser was found.\n\n" +
      "Provide one of:\n" +
      "  npx playwright install --with-deps chromium  (preferred in CI)\n" +
      "  mado static --browser-channel chrome\n" +
      "  mado static --browser-path /path/to/chrome\n" +
      "  MADO_BROWSER_CHANNEL=chrome\n" +
      "  MADO_BROWSER_PATH=/path/to/chrome\n\n" +
      (errors.length ? `Last launch error: ${errors.at(-1)}` : ""),
  );
}

function withTimeout(promise, timeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeout}ms`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

function formatRouteFailure(record, details) {
  const lines = [
    `[mado:static] failed to capture ${record.pathname}`,
    `route: ${record.pattern}`,
  ];
  if (details.diagnostics) {
    lines.push(`router state: ${details.diagnostics.lastRouterState ?? "unknown"}`);
    lines.push(
      `pending: ${details.diagnostics.pending?.join(", ") || "none"}`,
    );
    if (details.diagnostics.errors?.length) {
      lines.push(`runtime errors: ${details.diagnostics.errors.join(" | ")}`);
    }
  }
  if (details.pageErrors.length) lines.push(`page errors: ${details.pageErrors.join(" | ")}`);
  if (details.consoleErrors.length) lines.push(`console errors: ${details.consoleErrors.join(" | ")}`);
  if (details.failedRequests.length) lines.push(`failed requests: ${details.failedRequests.join(" | ")}`);
  return lines.join("\n");
}
