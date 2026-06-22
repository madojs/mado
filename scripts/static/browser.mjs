import { existsSync } from "node:fs";

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
    for (const record of options.records) {
      const html = await captureRoute(browser, record, options);
      captured.push({ ...record, html });
    }
  } finally {
    await browser.close();
  }

  return captured;
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
    await page.goto(`${options.serverOrigin}${record.pathname}`, {
      waitUntil: "domcontentloaded",
      timeout: options.timeout,
    });

    await waitForMadoStability(page, record, options.timeout);
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
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
  return page.evaluate(({ appId, serverOrigin, baseUrl }) => {
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

    normalizeDomState();
    materializeShadowStyles(document, added);

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

    return html.split(serverOrigin).join(baseUrl.replace(/\/$/, ""));

    function materializeShadowStyles(root, out) {
      const visit = (current) => {
        for (const el of current.querySelectorAll("*")) {
          if (!el.shadowRoot) continue;
          const shadow = el.shadowRoot;
          for (const sheet of shadow.adoptedStyleSheets ?? []) {
            const text = stylesheetText(sheet);
            if (!text) continue;
            const style = document.createElement("style");
            style.setAttribute("data-mado-static-style", stableHash(text));
            style.textContent = text;
            shadow.insertBefore(style, shadow.firstChild);
            out.push(style);
          }
          visit(shadow);
        }
      };
      visit(root);
    }

    function stylesheetText(sheet) {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    }

    function normalizeDomState() {
      for (const input of document.querySelectorAll("input")) {
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

      for (const textarea of document.querySelectorAll("textarea")) {
        textarea.textContent = textarea.value;
      }

      for (const select of document.querySelectorAll("select")) {
        for (const option of select.options) {
          if (option.selected) option.setAttribute("selected", "");
          else option.removeAttribute("selected");
        }
      }

      for (const details of document.querySelectorAll("details")) {
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
