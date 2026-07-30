// Tests for the end-to-end `mado release` pipeline.
//
// Verifies:
//   - In a scaffolded app with the default starter, `mado release` produces a
//     working out/ directory containing index.html, Vite assets,
//     browser-captured static HTML (when static routes exist), public assets,
//     and the generated _headers + _redirects CDN config files.
//   - `mado preview` remains a thin static preview of the final out/.
//
// This is an end-to-end test: it scaffolds a temp project from
// starters/default/, symlinks the local framework as a dependency, and runs the
// real CLI. It is therefore the slowest test in the suite; the deployment
// story regresses loudly if it fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createConnection, createServer } from "node:net";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");
const PREVIEW = resolve(REPO_ROOT, "scripts/preview.mjs");
const SKIP_BROWSER =
  process.env.MADO_REQUIRE_BROWSER !== "1" &&
  !process.env.MADO_BROWSER_PATH &&
  !process.env.MADO_BROWSER_CHANNEL;

// The default starter is a real modular app. We trim the generated app to a
// minimal public manifest so this test exercises the release pipeline, not
// backend API availability.

async function scaffoldApp() {
  const dir = mkdtempSync(join(tmpdir(), "mado-release-"));

  // The release pipeline test exercises the modular starter end to end:
  // it already has the auth / billing / layout / module-boundary shape
  // that real business apps deploy, so any regression here surfaces in
  // the most realistic possible artifact. The universal starter is
  // exercised separately by `test/static/dsd-takeover.test.mjs`.
  try {
    await exec(process.execPath, [CLI, "init", "app", "--starter", "modular"], {
      cwd: dir,
    });
    const app = join(dir, "app");

    // Replace the starter home page with a compact static route,
    // so we exercise scripts/static.mjs end-to-end.
    const homePage = `
      import { html, page } from "@madojs/mado";
      export default page({
        static: true,
        title: "Home",
        head: () => ({ description: "Home page" }),
        view: () => html\`<h1>Welcome</h1>\`,
      });
    `;
    writeFileSync(join(app, "src/modules/home/home.page.ts"), homePage);

    // app.routes.ts: trim to a public route plus not-found.
    const routes = `
      import { routes } from "@madojs/mado";
      export const manifest = {
        "/": () => import("./modules/home/home.page"),
        "*": () => import("./modules/home/not-found.page"),
      };
      export default routes(manifest);
    `;
    writeFileSync(join(app, "src/app.routes.ts"), routes);

    // Provide a `public/robots.txt` so we can assert the copy step works.
    mkdirSync(join(app, "public"), { recursive: true });
    writeFileSync(join(app, "public/robots.txt"), "User-agent: *\nAllow: /\n");

    // Link the local framework as `@madojs/mado`.
    mkdirSync(join(app, "node_modules/@madojs"), { recursive: true });
    symlinkSync(REPO_ROOT, join(app, "node_modules/@madojs/mado"));
    symlinkSync(join(REPO_ROOT, "node_modules/vite"), join(app, "node_modules/vite"));

    return { root: dir, app };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

async function runCli(cwd, args) {
  try {
    const execResult = await exec(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        // mado static now requires an explicit public origin for static
        // routes. The fixture's home page declares `static: true`, so we
        // bind a stable test origin (matches the deterministic-output
        // assertion).
        MADO_SITE: "https://release-fixture.test",
      },
    });
    return { code: 0, stdout: execResult.stdout ?? "", stderr: execResult.stderr ?? "" };
  } catch (e) {
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(e.message ?? ""),
    };
  }
}

async function pickFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function startPreview(cwd, port) {
  const child = spawn(
    process.execPath,
    [PREVIEW, "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode != null) {
      throw new Error(`mado preview exited with ${child.exitCode}`);
    }
    try {
      await new Promise((resolveSocket, reject) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolveSocket();
        });
        socket.once("error", reject);
      });
      return child;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  child.kill("SIGTERM");
  throw new Error(`mado preview did not start on port ${port}`);
}

async function stopPreview(child) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}

async function launchTestBrowser(chromium) {
  if (process.env.MADO_BROWSER_PATH) {
    return chromium.launch({
      executablePath: process.env.MADO_BROWSER_PATH,
      headless: true,
    });
  }
  if (process.env.MADO_BROWSER_CHANNEL) {
    return chromium.launch({
      channel: process.env.MADO_BROWSER_CHANNEL,
      headless: true,
    });
  }
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return chromium.launch({ channel: "chrome", headless: true });
  }
}

test("mado release: produces out/ with Vite assets, static HTML, public assets, _headers, _redirects", { skip: SKIP_BROWSER, timeout: 120_000 }, async () => {
  const { root, app } = await scaffoldApp();
  try {
    const result = await runCli(app, ["release"]);
    if (result.code !== 0) {
      throw new Error(
        `mado release exited ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      );
    }
    const out = join(app, "out");
    assert.ok(existsSync(out), "out/ exists");

    // Public assets copied
    assert.ok(existsSync(join(out, "robots.txt")), "public/robots.txt copied to out/");
    const robots = readFileSync(join(out, "robots.txt"), "utf8");
    assert.match(robots, /User-agent: \*/);

    // CDN config generated
    assert.ok(existsSync(join(out, "_redirects")), "_redirects generated");
    assert.match(
      readFileSync(join(out, "_redirects"), "utf8"),
      /\/\* \/_mado\/spa\.html 200/,
    );
    assert.ok(existsSync(join(out, "_headers")), "_headers generated");
    assert.match(
      readFileSync(join(out, "_headers"), "utf8"),
      /immutable/,
    );

    // Static step produced directly deployable HTML + sitemap.
    assert.equal(existsSync(join(out, "baked")), false, "out/baked is not written");
    assert.equal(existsSync(join(out, ".mado")), false, "temporary static output is cleaned");
    assert.ok(existsSync(join(out, "_mado/spa.html")), "SPA shell is preserved");
    assert.ok(existsSync(join(out, "404.html")), "SPA-backed 404 fallback is written");
    const notFoundHtml = readFileSync(join(out, "404.html"), "utf8");
    assert.match(notFoundHtml, /name="robots"[^>]+noindex/);
    assert.equal(
      notFoundHtml,
      readFileSync(join(out, "_mado/spa.html"), "utf8"),
      "a non-static wildcard keeps the SPA shell host fallback",
    );
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /Welcome/);
    assert.match(html, /data-mado-static/);
    assert.match(html, /\/assets\/[^"]+\.js/);
    assert.doesNotMatch(html, /<script[^>]+src="\/dist\/main\.js"/);
    assert.doesNotMatch(html, /__MADO_STATIC_MODE__/);
    assert.ok(existsSync(join(out, "sitemap.xml")), "sitemap.xml written to out/");
    assert.doesNotMatch(
      readFileSync(join(out, "sitemap.xml"), "utf8"),
      /__mado_static_not_found__|404/,
      "the host fallback is not a public sitemap route",
    );

    const rootHtml = readFileSync(join(out, "index.html"), "utf8");
    assert.match(rootHtml, /Welcome/);
    assert.match(rootHtml, /data-mado-static/);
    assert.match(rootHtml, /\/assets\/[^"]+\.js/);
    assert.doesNotMatch(rootHtml, /<script[^>]+src="\/dist\/main\.js"/);

    // Vite build produced at least one hashed asset.
    const assetFiles = readdirSync(join(out, "assets"));
    assert.ok(
      assetFiles.some((name) => /-[A-Za-z0-9_-]{6,}\.js$/.test(name)),
      "Vite should emit at least one hashed JS asset",
    );

    const firstSnapshot = snapshotDir(out);
    const secondRun = await runCli(app, ["release"]);
    if (secondRun.code !== 0) {
      throw new Error(
        `second mado release exited ${secondRun.code}\nSTDOUT:\n${secondRun.stdout}\nSTDERR:\n${secondRun.stderr}`,
      );
    }
    assert.deepEqual(
      snapshotDir(out),
      firstSnapshot,
      "two mado release runs on the same input must produce byte-identical out/",
    );

    // Even when a custom Vite config preserves out/, --no-clean must rebuild
    // the mutually exclusive host policy files from current sources.
    const viteConfigPath = join(app, "vite.config.ts");
    writeFileSync(
      viteConfigPath,
      readFileSync(viteConfigPath, "utf8").replace(
        "export default defineConfig({",
        "export default defineConfig({\n  build: { emptyOutDir: false },",
      ),
    );
    writeFileSync(
      join(app, "public/404.html"),
      "<!doctype html><title>Current public 404</title>\n",
    );
    const hostPolicy = await runCli(app, ["release", "--no-clean"]);
    if (hostPolicy.code !== 0) {
      throw new Error(
        `host-policy mado release exited ${hostPolicy.code}\n` +
          `STDOUT:\n${hostPolicy.stdout}\nSTDERR:\n${hostPolicy.stderr}`,
      );
    }
    assert.match(
      readFileSync(join(out, "404.html"), "utf8"),
      /Current public 404/,
    );
    assert.equal(
      existsSync(join(out, "_redirects")),
      false,
      "a current public 404 removes the stale generated SPA redirect",
    );

    rmSync(join(app, "public/404.html"), { force: true });
    const spaPolicy = await runCli(app, ["release", "--no-clean"]);
    if (spaPolicy.code !== 0) {
      throw new Error(
        `SPA-policy mado release exited ${spaPolicy.code}\n` +
          `STDOUT:\n${spaPolicy.stdout}\nSTDERR:\n${spaPolicy.stderr}`,
      );
    }
    assert.equal(
      readFileSync(join(out, "404.html"), "utf8"),
      readFileSync(join(out, "_mado/spa.html"), "utf8"),
      "removing public/404.html replaces its stale copy with the SPA shell",
    );
    assert.match(
      readFileSync(join(out, "_redirects"), "utf8"),
      /\/\* \/_mado\/spa\.html 200/,
      "returning to SPA policy regenerates the catch-all",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mado release: captures an explicit host 404 and disables the automatic SPA catch-all", { skip: SKIP_BROWSER, timeout: 120_000 }, async () => {
  const { root, app } = await scaffoldApp();
  let preview;
  try {
    writeFileSync(
      join(app, "src/modules/home/dynamic.page.ts"),
      `
        import { html, page } from "@madojs/mado";
        export default page({
          view: ({ params }) => html\`<h1>Dynamic \${params.slug}</h1>\`,
        });
      `,
    );
    writeFileSync(
      join(app, "src/app.routes.ts"),
      `
        import { routes } from "@madojs/mado";
        export const manifest = {
          "/": () => import("./modules/home/home.page"),
          "/:slug": () => import("./modules/home/dynamic.page"),
          "*": () => import("./modules/home/not-found.page"),
        };
        export default routes(manifest);
      `,
    );
    writeFileSync(
      join(app, "src/modules/home/not-found.page.ts"),
      `
        import { html, page, routeUrl } from "@madojs/mado";
        export default page({
          static: true,
          title: "Not Found",
          head: () => ({
            canonical: "/must-not-survive",
            og: { url: "/must-not-survive" },
            meta: [
              { name: "robots", content: "index follow" },
              { property: "og:url", content: "/also-must-not-survive" },
            ],
            link: [{ rel: "canonical", href: "/also-must-not-survive" }],
          }),
          view: () => html\`
            <h1>Captured host not found</h1>
            <a data-link href=\${routeUrl("/")}>Home</a>
          \`,
        });
      `,
    );
    const result = await runCli(app, ["release"]);
    if (result.code !== 0) {
      throw new Error(
        `mado release exited ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      );
    }
    const out = join(app, "out");
    const notFoundHtml = readFileSync(join(out, "404.html"), "utf8");
    assert.match(notFoundHtml, /Captured host not found/);
    assert.match(notFoundHtml, /data-mado-static/);
    assert.match(notFoundHtml, /data-mado-static-fallback/);
    assert.match(notFoundHtml, /name="robots"[^>]+noindex/);
    assert.doesNotMatch(notFoundHtml, /rel="canonical"/);
    assert.doesNotMatch(notFoundHtml, /property="og:url"/);
    assert.doesNotMatch(notFoundHtml, /__mado_static_not_found__/);
    assert.notEqual(
      notFoundHtml,
      readFileSync(join(out, "_mado/spa.html"), "utf8"),
    );
    assert.equal(
      existsSync(join(out, "_redirects")),
      false,
      "an explicit host 404 must not be shadowed by an automatic SPA catch-all",
    );

    const port = await pickFreePort();
    preview = await startPreview(app, port);
    const response = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Captured host not found/);

    const { chromium } = await import("playwright-core");
    const browser = await launchTestBrowser(chromium);
    try {
      const page = await browser.newPage();
      const navigation = await page.goto(
        `http://127.0.0.1:${port}/missing`,
        { waitUntil: "networkidle" },
      );
      assert.equal(navigation?.status(), 404);
      assert.equal(
        await page.locator("h1").textContent(),
        "Captured host not found",
        "the host fallback must beat a matching dynamic route during boot",
      );
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute("content"),
        "noindex, follow",
      );
      assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
      assert.equal(await page.locator('meta[property="og:url"]').count(), 0);
      await page.locator('a[href="/"]').click();
      await page.waitForURL(`http://127.0.0.1:${port}/`);
      await page.waitForSelector("h1");
      assert.equal(await page.locator("h1").textContent(), "Welcome");
      assert.equal(
        await page.locator('meta[name="robots"]').count(),
        0,
        "the static fallback noindex must not leak after SPA navigation",
      );
    } finally {
      await browser.close();
    }

    await stopPreview(preview);
    preview = null;

    writeFileSync(
      join(app, "public/404.html"),
      "<!doctype html><title>Authored 404</title><h1>User-owned fallback</h1>\n",
    );
    writeFileSync(
      join(app, "src/modules/home/not-found.page.ts"),
      `
        import { html, page } from "@madojs/mado";
        export default page({
          static: true,
          view: ({ path }) => html\`<h1>Unused \${path}</h1>\`,
        });
      `,
    );
    const authoredResult = await runCli(app, ["release"]);
    if (authoredResult.code !== 0) {
      throw new Error(
        `mado release exited ${authoredResult.code}\nSTDOUT:\n${authoredResult.stdout}\nSTDERR:\n${authoredResult.stderr}`,
      );
    }
    assert.match(
      readFileSync(join(out, "404.html"), "utf8"),
      /User-owned fallback/,
      "public/404.html wins over captured wildcard output",
    );
    assert.equal(existsSync(join(out, "_redirects")), false);
  } finally {
    await stopPreview(preview);
    rmSync(root, { recursive: true, force: true });
  }
});

test("mado release: rejects pathname-dependent static wildcard copy", { skip: SKIP_BROWSER, timeout: 120_000 }, async () => {
  const { root, app } = await scaffoldApp();
  try {
    writeFileSync(
      join(app, "src/modules/home/not-found.page.ts"),
      `
        import { html, page } from "@madojs/mado";
        export default page({
          static: true,
          title: "Not Found",
          view: ({ path }) => html\`<h1>Missing \${path}</h1>\`,
        });
      `,
    );
    const result = await runCli(app, ["release"]);
    assert.notEqual(result.code, 0);
    assert.match(
      result.stdout + result.stderr,
      /static wildcard must render pathname-independent fallback copy/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function snapshotDir(dir, prefix = "") {
  const rows = [];
  for (const entry of readdirSync(dir).sort()) {
    const file = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(file);
    if (stat.isDirectory()) {
      rows.push(...snapshotDir(file, rel));
    } else {
      rows.push([rel, sha256(readFileSync(file))]);
    }
  }
  return rows;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
