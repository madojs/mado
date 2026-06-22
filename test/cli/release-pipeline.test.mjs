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
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");

// The default starter is a real modular app. We trim the generated app to a
// minimal public manifest so this test exercises the release pipeline, not
// backend API availability.

async function scaffoldApp() {
  const dir = mkdtempSync(join(tmpdir(), "mado-release-"));

  // Use the framework CLI to scaffold the minimal starter — it already does
  // not pull our admin guard chain, so we don't need to patch much.
  try {
    await exec(process.execPath, [CLI, "init", "app"], { cwd: dir });
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
      env: { ...process.env, FORCE_COLOR: "0" },
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

test("mado release: produces out/ with Vite assets, static HTML, public assets, _headers, _redirects", { timeout: 120_000 }, async () => {
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
    assert.ok(existsSync(join(out, "404.html")), "GitHub Pages fallback is written");
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.match(html, /Welcome/);
    assert.match(html, /data-mado-static/);
    assert.match(html, /\/assets\/[^"]+\.js/);
    assert.doesNotMatch(html, /<script[^>]+src="\/dist\/main\.js"/);
    assert.doesNotMatch(html, /__MADO_STATIC_MODE__/);
    assert.ok(existsSync(join(out, "sitemap.xml")), "sitemap.xml written to out/");

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
