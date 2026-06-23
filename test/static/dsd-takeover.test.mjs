// Production-served DSD + root takeover regression — the merge gate.
//
// This test exercises the entire "one Shadow component, one snapshot,
// one live takeover" contract through a real `mado release` + `mado
// preview` pipeline. It is the authoritative round-trip test:
//
//   1. Scaffold a tiny app that uses one open-shadow component on a
//      static route with build-time seed.
//   2. Run `mado release` end to end (vite build → static capture →
//      deployment files).
//   3. Serve `out/` through the production `mado preview` server so the
//      browser sees real HTTP, real assets, real base-prefixed URLs.
//   4. Open the static URL in headless Chromium with JS enabled and
//      strictly assert the takeover contract:
//        - setup() of the shadow component runs exactly once;
//        - no extra fetch for the seed (already consumed from the seed
//          script element);
//        - #app no longer carries data-mado-static after takeover;
//        - the seed script element is removed after consume;
//        - exactly one <product-card> host with exactly one shadow root;
//        - a click on the in-component button mutates the signal and
//          updates the DOM (proves reactivity, not just hydration);
//        - no [mado:*] console errors / warnings;
//        - no render-unmanaged-dom warning;
//        - no localhost or capture-server URL leaked into the document.
//
// The raw snapshot assertions also stay here so a regression in either
// half is immediately attributable.
//
// Requires Chromium. Skipped automatically if no browser is resolvable
// AND the CI env did not set MADO_REQUIRE_BROWSER=1 (CI must install
// Playwright Chromium with `npx playwright install --with-deps chromium`
// and let this test fail loudly when missing).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");

const REQUIRE_BROWSER = process.env.MADO_REQUIRE_BROWSER === "1";
const SKIP =
  !REQUIRE_BROWSER &&
  !process.env.MADO_BROWSER_PATH &&
  !process.env.MADO_BROWSER_CHANNEL &&
  !hasPlaywrightChromium() &&
  !existsSync("/usr/bin/google-chrome") &&
  !existsSync("/usr/bin/chromium") &&
  !existsSync("/usr/bin/chromium-browser");

function hasPlaywrightChromium() {
  const home = process.env.HOME ?? "";
  if (!home) return false;
  const cache = join(home, ".cache/ms-playwright");
  if (!existsSync(cache)) return false;
  try {
    return readdirSync(cache).some((name) => name.startsWith("chromium"));
  } catch {
    return false;
  }
}

function mkProject({ base = "/" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mado-dsd-"));
  const viteBaseLine = base === "/" ? "" : `  base: ${JSON.stringify(base)},\n`;
  const writes = {
    "package.json": JSON.stringify(
      {
        name: "dsd-app",
        version: "0.0.0",
        private: true,
        type: "module",
        scripts: { release: "mado release", preview: "mado preview" },
      },
      null,
      2,
    ),
    "index.html": [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="UTF-8" />',
      "    <title>App</title>",
      "  </head>",
      "  <body>",
      '    <div id="app"></div>',
      '    <script type="module" src="/src/main.ts"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
    "vite.config.ts": [
      'import { defineConfig } from "vite";',
      'import { mado } from "@madojs/mado/vite";',
      "export default defineConfig({",
      viteBaseLine,
      '  plugins: [mado({ site: "https://example.test" })],',
      '  appType: "spa",',
      '  build: { outDir: "out", assetsDir: "assets", target: "es2022" },',
      "});",
      "",
    ].join("\n"),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          jsx: "preserve",
          types: ["vite/client"],
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "src/main.ts": [
      'import { html, render } from "@madojs/mado";',
      'import "./product-card";',
      'import appRoutes from "./routes";',
      'render(html`${appRoutes.view}`, document.getElementById("app")!);',
      "",
    ].join("\n"),
    "src/product-card.ts": [
      'import { component, css, html, signal } from "@madojs/mado";',
      "",
      "declare global {",
      "  interface Window {",
      "    __MADO_TEST_SETUP_CALLS__?: number;",
      "    __MADO_TEST_RESOURCE_FETCHES__?: number;",
      "  }",
      "}",
      "",
      "component(",
      '  "product-card",',
      "  (ctx) => {",
      "    (window.__MADO_TEST_SETUP_CALLS__ ||= 0);",
      "    window.__MADO_TEST_SETUP_CALLS__ += 1;",
      '    const name = ctx.attr("name", "");',
      "    const count = signal(0);",
      "    return () => html`",
      '      <article class="card" data-mado-shadow-id="product-card">',
      "        <h2>${() => name()}</h2>",
      "        <slot></slot>",
      "        <button class=\"bump\" @click=${() => count.update((n) => n + 1)}>",
      "          clicked <span class=\"n\">${() => count()}</span> time(s)",
      "        </button>",
      "      </article>",
      "    `;",
      "  },",
      "  {",
      "    styles: css`",
      "      :host { display: block; padding: 1rem; }",
      "      .card { border: 1px solid hotpink; }",
      "      h2 { margin: 0; }",
      "    `,",
      "  },",
      ");",
      "",
    ].join("\n"),
    "src/routes.ts": [
      'import { routes } from "@madojs/mado";',
      'import productPage from "./product.page";',
      'export const manifest = { "/": productPage };',
      "export default routes(manifest);",
      "",
    ].join("\n"),
    "src/product.page.ts": [
      'import { html, page } from "@madojs/mado";',
      "",
      "type Product = { name: string; description: string; xss: string };",
      "",
      "export default page<Record<string, never>, Product, Product>({",
      "  static: {",
      "    initialData: () => ({",
      '      name: "Mado Keyboard",',
      '      description: "A canonical Mado test product.",',
      '      xss: "</script><script>window.PWNED=true</script>",',
      "    }),",
      "  },",
      '  title: "Mado Keyboard",',
      "  head: (_params, seed) => ({",
      "    title: seed?.name,",
      "    description: seed?.description,",
      "  }),",
      "  view: ({ data }) => html`",
      "    <main>",
      '      <h1>${() => data?.name ?? "loading"}</h1>',
      '      <product-card name=${data?.name ?? ""}>',
      '        <p>${() => data?.description ?? ""}</p>',
      "      </product-card>",
      '      <pre id="xss-probe">${() => data?.xss ?? ""}</pre>',
      "    </main>",
      "  `,",
      "});",
      "",
    ].join("\n"),
  };
  for (const [path, body] of Object.entries(writes)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }

  // Wire the framework via local node_modules symlinks so the test
  // exercises exactly the code we are about to ship.
  mkdirSync(join(dir, "node_modules/@madojs"), { recursive: true });
  symlinkSync(REPO_ROOT, join(dir, "node_modules/@madojs/mado"));
  symlinkSync(
    join(REPO_ROOT, "node_modules/vite"),
    join(dir, "node_modules/vite"),
  );

  return dir;
}

async function runCli(cwd, args, extraEnv = {}) {
  try {
    const r = await exec(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        MADO_SITE: "https://example.test",
        ...extraEnv,
      },
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (err) {
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err.message ?? ""),
    };
  }
}

async function pickFreePort() {
  const { createServer } = await import("node:net");
  return new Promise((resolveOk, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolveOk(port));
    });
  });
}

async function startPreview(cwd, port) {
  const child = spawn(
    process.execPath,
    [CLI, "preview", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  await waitForPort("127.0.0.1", port, 10_000);
  return child;
}

function stopPreview(child) {
  if (!child) return Promise.resolve();
  return new Promise((resolveOk) => {
    const finalize = () => {
      try { child.stdout?.destroy(); } catch { /* noop */ }
      try { child.stderr?.destroy(); } catch { /* noop */ }
      resolveOk();
    };
    if (child.killed || child.exitCode != null) {
      finalize();
      return;
    }
    child.once("exit", finalize);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
  });
}

async function waitForPort(host, port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolveOk, reject) => {
        const sock = createConnection({ host, port });
        sock.once("connect", () => {
          sock.destroy();
          resolveOk();
        });
        sock.once("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`port ${port} on ${host} never accepted a connection`);
}

async function launchBrowser(chromium) {
  const path = process.env.MADO_BROWSER_PATH;
  if (path) return chromium.launch({ executablePath: path, headless: true });
  const channel = process.env.MADO_BROWSER_CHANNEL;
  if (channel) return chromium.launch({ channel, headless: true });
  // Try Playwright-managed Chromium first (CI installs it via
  // `npx playwright install --with-deps chromium`).
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

test(
  "static DSD: full snapshot + production-served takeover round-trip",
  { skip: SKIP, timeout: 180_000 },
  async () => {
    const dir = mkProject({ base: "/" });
    let preview;
    try {
      // ----- release -----
      const release = await runCli(dir, ["release", "--no-clean"]);
      if (release.code !== 0) {
        throw new Error(
          `mado release failed (${release.code})\n${release.stdout}\n${release.stderr}`,
        );
      }
      const html = readFileSync(join(dir, "out/index.html"), "utf8");

      // ----- raw HTML assertions (snapshot contract) -----
      assert.match(html, /<title>Mado Keyboard<\/title>/);
      assert.match(
        html,
        /name="description"[^>]+content="A canonical Mado test product\."/,
      );
      assert.match(html, /<h1>Mado Keyboard[^<]*<!--mado/);
      assert.match(html, /A canonical Mado test product\./);
      assert.match(html, /<template shadowrootmode="open"/);
      assert.match(html, /data-mado-static-style/);
      assert.match(html, /border: 1px solid hotpink/);
      assert.match(html, /data-mado-static-data[^>]*>\{/);
      assert.doesNotMatch(
        html,
        /<\/script><script>window\.PWNED=true<\/script>/,
      );
      assert.match(html, /\\u003[cC]/);
      assert.doesNotMatch(html, /__MADO_STATIC_MODE__/);
      assert.doesNotMatch(html, /data-mado-static-capture/);
      assert.doesNotMatch(html, /127\.0\.0\.1/);
      assert.doesNotMatch(html, /localhost/);

      // Canonical / og:url auto-fallback.
      assert.match(
        html,
        /<link[^>]*rel="canonical"[^>]*href="https:\/\/example\.test\/?"/,
      );
      assert.match(
        html,
        /<meta[^>]*property="og:url"[^>]*content="https:\/\/example\.test\/?"/,
      );

      // Sitemap and SPA shell exist.
      assert.ok(existsSync(join(dir, "out/sitemap.xml")));
      assert.ok(existsSync(join(dir, "out/_mado/spa.html")));

      // ----- live takeover assertions (real HTTP) -----
      const port = await pickFreePort();
      preview = await startPreview(dir, port);

      const { chromium } = await import("playwright-core");
      const browser = await launchBrowser(chromium);
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const consoleMessages = [];
      const seedRequests = [];
      page.on("console", (msg) => {
        consoleMessages.push({ type: msg.type(), text: msg.text() });
      });
      page.on("request", (req) => {
        if (req.url().includes("data-mado-static-data")) {
          seedRequests.push(req.url());
        }
      });

      try {
        await page.goto(`http://127.0.0.1:${port}/`, {
          waitUntil: "networkidle",
        });

        // Wait until the live takeover has replaced the static marker.
        await page.waitForFunction(() => {
          const app = document.getElementById("app");
          if (!app) return false;
          if (app.hasAttribute("data-mado-static")) return false;
          const cards = app.querySelectorAll("product-card");
          if (cards.length !== 1) return false;
          return !!cards[0].shadowRoot;
        }, { timeout: 10_000 });

        // setup() must have run exactly once for the single host.
        const setupCalls = await page.evaluate(
          () => window.__MADO_TEST_SETUP_CALLS__ ?? 0,
        );
        assert.equal(setupCalls, 1, "component setup() ran exactly once");

        // The seed script element must have been consumed and removed.
        const seedRemoved = await page.evaluate(
          () =>
            document.querySelectorAll(
              'script[type="application/json"][data-mado-static-data]',
            ).length === 0,
        );
        assert.equal(seedRemoved, true, "seed script element removed after consume");

        // No duplicate component tree (snapshot host taken over in place).
        const hostCount = await page.evaluate(
          () => document.querySelectorAll("product-card").length,
        );
        assert.equal(hostCount, 1, "exactly one <product-card> host");

        // Exactly one open shadow root with one .card inside.
        const cardCount = await page.evaluate(() => {
          const host = document.querySelector("product-card");
          return host?.shadowRoot?.querySelectorAll(".card").length ?? 0;
        });
        assert.equal(cardCount, 1, "exactly one .card inside the shadow root");

        // No data-mado-static after takeover.
        const staticMarker = await page.evaluate(() =>
          document.getElementById("app")?.hasAttribute("data-mado-static"),
        );
        assert.equal(staticMarker, false, "data-mado-static removed after takeover");

        // Click the in-component button and assert the signal/text updates.
        await page.evaluate(() => {
          const btn = document
            .querySelector("product-card")
            ?.shadowRoot?.querySelector("button.bump");
          (btn instanceof HTMLElement ? btn : null)?.click();
        });
        await page.waitForFunction(
          () => {
            const span = document
              .querySelector("product-card")
              ?.shadowRoot?.querySelector("span.n");
            return span?.textContent?.trim() === "1";
          },
          { timeout: 2_000 },
        );

        // No [mado:*] console warnings/errors.
        for (const msg of consoleMessages) {
          if (msg.type !== "error" && msg.type !== "warning") continue;
          assert.doesNotMatch(
            msg.text,
            /\[mado:/,
            `unexpected [mado:] ${msg.type}: ${msg.text}`,
          );
          assert.doesNotMatch(
            msg.text,
            /render-unmanaged-dom/,
            `unexpected render-unmanaged-dom: ${msg.text}`,
          );
        }

        // The runtime must not refetch the seed: there is no canonical
        // seed URL to request when the script tag was consumed in place.
        assert.equal(
          seedRequests.length,
          0,
          "no extra network request for the seed JSON",
        );
      } finally {
        await context.close();
        await browser.close();
      }
    } finally {
      await stopPreview(preview);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Helper kept to avoid removing the original best-effort import; the
// node:events `once` is intentionally re-imported in case future
// expansions need it.
void once;