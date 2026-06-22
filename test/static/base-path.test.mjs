// Base-path fixture for the static snapshot pipeline.
//
// This test proves the entire "Vite base" contract end-to-end: when the
// app builds with `base: "/mado/"`, every layer of the snapshot pipeline
// honours it without any application-level configuration.
//
//   - the Vite plugin emits the correct base into `_mado/build.json`;
//   - `mado static` derives sitemap URLs from `site + base + pathname`;
//   - the internal capture server serves base-prefixed asset URLs from
//     the same `out/assets/*` location that production would;
//   - the runtime router reports a BASE-FREE pathname to the matcher,
//     so the same static route key "/" matches both deployments;
//   - canonical and og:url are absolute and include the base;
//   - the production `mado preview` server replays the deployment URL
//     shape (redirects "/" to "/mado/", strips the prefix for asset
//     lookups, serves SPA fallback under "/mado/...").
//
// The companion test (dsd-takeover.test.mjs) covers the same takeover
// path at the root base; this one exists to lock in the cross-base
// invariants.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
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

function mkBaseProject(base) {
  const dir = mkdtempSync(join(tmpdir(), "mado-base-"));
  const writes = {
    "package.json": JSON.stringify(
      {
        name: "base-app",
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
      `  base: ${JSON.stringify(base)},`,
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
      'import { html, render, routeUrl } from "@madojs/mado";',
      'import appRoutes from "./routes";',
      "(window as any).__MADO_ROUTE_URL_DOCS__ = routeUrl(\"/docs\");",
      'render(html`${appRoutes.view}`, document.getElementById("app")!);',
      "",
    ].join("\n"),
    "src/routes.ts": [
      'import { routes } from "@madojs/mado";',
      'import homePage from "./home.page";',
      'import docsPage from "./docs.page";',
      'export const manifest = { "/": homePage, "/docs": docsPage };',
      "export default routes(manifest);",
      "",
    ].join("\n"),
    "src/home.page.ts": [
      'import { html, page, routeUrl } from "@madojs/mado";',
      "export default page({",
      "  static: true,",
      '  title: "Home",',
      "  view: () => html`",
      "    <main>",
      "      <h1>Home</h1>",
      "      <a id=\"docs-link\" data-link href=${routeUrl(\"/docs\")}>Docs</a>",
      "    </main>",
      "  `,",
      "});",
      "",
    ].join("\n"),
    "src/docs.page.ts": [
      'import { html, page } from "@madojs/mado";',
      "export default page({",
      "  static: true,",
      '  title: "Docs",',
      "  view: (ctx) => html`",
      "    <main>",
      "      <h1>Docs</h1>",
      "      <p id=\"path-probe\">${() => ctx.path()}</p>",
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
  mkdirSync(join(dir, "node_modules/@madojs"), { recursive: true });
  symlinkSync(REPO_ROOT, join(dir, "node_modules/@madojs/mado"));
  symlinkSync(
    join(REPO_ROOT, "node_modules/vite"),
    join(dir, "node_modules/vite"),
  );
  return dir;
}

async function runCli(cwd, args) {
  try {
    const r = await exec(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0", MADO_SITE: "https://example.test" },
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

async function launchBrowser(chromium) {
  const path = process.env.MADO_BROWSER_PATH;
  if (path) return chromium.launch({ executablePath: path, headless: true });
  const channel = process.env.MADO_BROWSER_CHANNEL;
  if (channel) return chromium.launch({ channel, headless: true });
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

test(
  "static base path: build, capture, preview and runtime all agree on /mado/",
  { skip: SKIP, timeout: 180_000 },
  async () => {
    const BASE = "/mado/";
    const dir = mkBaseProject(BASE);
    let preview;
    try {
      const release = await runCli(dir, ["release", "--no-clean"]);
      if (release.code !== 0) {
        throw new Error(
          `mado release failed (${release.code})\n${release.stdout}\n${release.stderr}`,
        );
      }

      // --- Build artefact layout -------------------------------------
      //
      // `base` is a URL prefix, not an output directory: HTML and assets
      // stay at the root of `out/`. Production CDNs serve them through
      // the base prefix.
      const out = join(dir, "out");
      assert.ok(existsSync(join(out, "index.html")), "out/index.html exists");
      assert.ok(existsSync(join(out, "docs/index.html")), "out/docs/index.html exists");
      assert.ok(existsSync(join(out, "assets")), "out/assets/ exists");

      // The build-time bridge (`_mado/build.json`) must NOT ship in the
      // production artifact. `mado static` reads it once during capture
      // and then drops it so the deployed tree contains no internal
      // build pipeline metadata.
      assert.equal(
        existsSync(join(out, "_mado/build.json")),
        false,
        "_mado/build.json must be dropped from the deployed artifact",
      );

      // Sitemap entries include the base.
      const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
      assert.match(sitemap, /<loc>https:\/\/example\.test\/mado<\/loc>/);
      assert.match(sitemap, /<loc>https:\/\/example\.test\/mado\/docs<\/loc>/);

      // Index HTML loads base-prefixed assets.
      const indexHtml = readFileSync(join(out, "index.html"), "utf8");
      assert.match(indexHtml, /src="\/mado\/assets\/[^"]+\.js"/);

      // Canonical / og:url are absolute and include the base.
      assert.match(
        indexHtml,
        /<link[^>]*rel="canonical"[^>]*href="https:\/\/example\.test\/mado"/,
      );
      assert.match(
        indexHtml,
        /<meta[^>]*property="og:url"[^>]*content="https:\/\/example\.test\/mado"/,
      );

      const docsHtml = readFileSync(join(out, "docs/index.html"), "utf8");
      assert.match(
        docsHtml,
        /<link[^>]*rel="canonical"[^>]*href="https:\/\/example\.test\/mado\/docs"/,
      );

      // Internal <a data-link> must be base-prefixed via routeUrl().
      assert.match(indexHtml, /id="docs-link"[^>]*href="\/mado\/docs"/);

      // --- Live preview round-trip -----------------------------------
      const port = await pickFreePort();
      preview = await startPreview(dir, port);

      // Bare `/` redirects to `/mado/`.
      const redirect = await fetch(`http://127.0.0.1:${port}/`, {
        redirect: "manual",
      });
      assert.equal(redirect.status, 302, "/ → 302");
      assert.equal(
        redirect.headers.get("location"),
        BASE,
        "/ redirects to the base",
      );

      // The base URL serves the static document.
      const root = await fetch(`http://127.0.0.1:${port}${BASE}`);
      assert.equal(root.status, 200);
      const rootBody = await root.text();
      assert.match(rootBody, /<h1>Home<\/h1>/);
      assert.match(rootBody, /\/mado\/assets\/[^"]+\.js/);

      // Foreign paths (outside the base) return 404.
      const foreign = await fetch(`http://127.0.0.1:${port}/other`);
      assert.equal(foreign.status, 404, "paths outside /mado/ return 404");

      // SPA fallback under the base prefix serves the SPA shell.
      const spaFallback = await fetch(`http://127.0.0.1:${port}${BASE}private`);
      assert.equal(spaFallback.status, 200, "SPA fallback works under base");
      const spaBody = await spaFallback.text();
      assert.match(spaBody, /noindex/, "SPA fallback shell is noindexed");

      // --- Browser round-trip ----------------------------------------
      const { chromium } = await import("playwright-core");
      const browser = await launchBrowser(chromium);
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      try {
        await page.goto(`http://127.0.0.1:${port}${BASE}docs`, {
          waitUntil: "networkidle",
        });

        // The runtime sees the BASE-FREE pathname (proves stripBase()
        // works on the matcher side).
        const probe = await page.textContent("#path-probe");
        assert.equal((probe ?? "").trim(), "/docs", "page.path() is base-free");

        // routeUrl() emits the base-prefixed link.
        const docsUrl = await page.evaluate(
          () => (window).__MADO_ROUTE_URL_DOCS__,
        );
        assert.equal(docsUrl, "/mado/docs", "routeUrl() prefixes with base");

        // Navigate home and back via the data-link anchor: the link's
        // href is base-prefixed, the matcher receives the base-free
        // path.
        await page.goto(`http://127.0.0.1:${port}${BASE}`, {
          waitUntil: "networkidle",
        });
        await page.click("#docs-link");
        await page.waitForFunction(
          () => location.pathname === "/mado/docs",
          { timeout: 2_000 },
        );

        const browserPathname = await page.evaluate(() => location.pathname);
        assert.equal(browserPathname, "/mado/docs");
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