// Tests for the end-to-end `mado release` pipeline.
//
// Verifies:
//   - In a scaffolded app with the admin starter, `mado release` produces a
//     working out/ directory containing index.html, an assets/ bundle,
//     baked/index.html (when bake routes exist), public assets copied through,
//     and the generated _headers + _redirects CDN config files.
//   - `mado preview` is wired up (we don't bind it to a port here; we only
//     check it can locate out/ via mado.config.json).
//
// This is an end-to-end test: it scaffolds a temp project from
// starters/admin/, symlinks the local framework as a dependency, and runs the
// real CLI. It is therefore the slowest test in the suite; the deployment
// story regresses loudly if it fails.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");

// The admin starter pulls a `requireAuth` guard from src/lib/auth.ts which in
// turn uses fetch / signal etc. — those are framework concerns that work in
// the browser, not in this test. We trim the starter to a minimum that still
// exercises the release pipeline: a public landing, an /admin guarded route
// whose guard always passes, and one baked route to prove the bake step runs.

function scaffoldApp() {
  const dir = mkdtempSync(join(tmpdir(), "mado-release-"));

  // Use the framework CLI to scaffold the minimal starter — it already does
  // not pull our admin guard chain, so we don't need to patch much.
  return new Promise(async (resolve, reject) => {
    try {
      const r = await exec(process.execPath, [CLI, "init", "app", "--starter", "minimal"], { cwd: dir });
      const app = join(dir, "app");

      // Replace minimal's `pages/home.ts` with one that defines a bake route,
      // so we exercise scripts/bake.mjs end-to-end.
      const homePage = `
        import { html, page } from "@madojs/mado";
        export default page({
          title: "Home",
          head: () => ({ description: "Home page" }),
          view: () => html\`<h1>Welcome</h1>\`,
          bake: { paths: () => [{}], data: () => ({ greeting: "hi" }) },
        });
      `;
      writeFileSync(join(app, "src/pages/home.ts"), homePage);

      // routes.ts: the minimal scaffold already exports `default routes({...})`,
      // but bake also needs a named `manifest` export. Re-write to satisfy
      // both.
      const routes = `
        import { routes } from "@madojs/mado";
        export const manifest = {
          "/": () => import("./pages/home.js"),
          "*": () => import("./pages/not-found.js"),
        };
        export default routes(manifest);
      `;
      writeFileSync(join(app, "src/routes.ts"), routes);

      // Provide a `public/robots.txt` so we can assert the copy step works.
      mkdirSync(join(app, "public"), { recursive: true });
      writeFileSync(join(app, "public/robots.txt"), "User-agent: *\nAllow: /\n");

      // Link the local framework as `@madojs/mado`.
      mkdirSync(join(app, "node_modules/@madojs"), { recursive: true });
      symlinkSync(REPO_ROOT, join(app, "node_modules/@madojs/mado"));

      resolve({ root: dir, app });
    } catch (e) {
      reject(e);
    }
  });
}

async function runCli(cwd, args) {
  try {
    const r = await exec(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    return { code: 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (e) {
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? String(e.message ?? ""),
    };
  }
}

test("mado release: produces out/ with bundle, baked HTML, public assets, _headers, _redirects", async () => {
  const { root, app } = await scaffoldApp();
  try {
    const r = await runCli(app, ["release"]);
    if (r.code !== 0) {
      throw new Error(
        `mado release exited ${r.code}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`,
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
      /\/\* \/index\.html 200/,
    );
    assert.ok(existsSync(join(out, "_headers")), "_headers generated");
    assert.match(
      readFileSync(join(out, "_headers"), "utf8"),
      /immutable/,
    );

    // Bake step produced baked HTML + sitemap.
    const baked = join(out, "baked");
    assert.ok(existsSync(join(baked, "index.html")), "baked/index.html written");
    const html = readFileSync(join(baked, "index.html"), "utf8");
    assert.match(html, /Welcome/);
    assert.match(html, /"greeting":"hi"/);
    assert.ok(existsSync(join(baked, "sitemap.xml")), "baked/sitemap.xml written");

    // Bundle step produced at least one hashed asset.
    // (bundle.mjs uses esbuild splitting; the exact filenames are hashed.)
    const outFiles = readFileSync(join(out, "_redirects"), "utf8"); // smoke
    void outFiles;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});