// End-to-end tests for `node scripts/bake.mjs`.
//
// Verifies:
//   - --entry / --template / --out / --base-url flags are honored.
//   - Missing --entry produces a clear error (exit 1) instead of a hidden default.
//   - An unsupported value in a baked view (e.g. an `each()`-like directive object)
//     produces a loud error with a hint instead of silently rendering "[object Object]".

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BAKE = resolve(REPO_ROOT, "scripts/bake.mjs");

function mkTempProject(layout) {
  const dir = mkdtempSync(join(tmpdir(), "mado-bake-"));
  for (const [path, content] of Object.entries(layout)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

async function runBake(cwd, args = [], env = {}) {
  // Normalize so the caller can always read .code (0 on success, >0 on failure).
  try {
    const r = await exec(process.execPath, [BAKE, ...args], {
      cwd,
      env: { ...process.env, ...env },
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

test("bake: missing entry produces a clear error", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "no-routes-app" }),
    "index.html": `<!doctype html><html><head></head><body><div id="app"></div></body></html>`,
  });
  try {
    const result = await runBake(dir);
    assert.notEqual(result.code, 0, "bake should fail when entry is missing");
    const out = (result.stderr ?? "") + (result.stdout ?? "");
    assert.match(out, /\[bake\] entry not found/);
    assert.match(out, /mado\.config\.json|--entry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bake: --entry / --template / --out / --base-url honored, sitemap written", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "bake-flags-app", type: "module" }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "es2022",
        module: "es2022",
        moduleResolution: "bundler",
        strict: true,
      },
    }),
    "shell.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shell</title></head><body><div id="app"></div></body></html>`,
    "app/routes.ts": `
      // Standalone routes module: no @madojs/mado import needed for this static
      // bake — bake only inspects the manifest entries and what page() returns.
      const homePage = {
        _page: true,
        head: () => ({ title: "Home", description: "Home page" }),
        view: () => ({
          _mado: true,
          strings: ["<h1>Welcome ", "</h1>"],
          values: ["world"],
        }),
        bake: {
          paths: () => [{}],
          data: () => ({ greeting: "hello" }),
        },
      };
      export const manifest = { "/": homePage };
      export default { manifest };
    `,
  });
  try {
    const result = await runBake(dir, [
      "--entry", "app/routes.ts",
      "--template", "shell.html",
      "--out", "dist/baked",
      "--base-url", "https://flags.example",
    ]);
    if (result.code !== 0) {
      // Re-throw with full output for debuggability.
      throw new Error(
        `bake exited ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      );
    }
    const outDir = join(dir, "dist/baked");
    assert.ok(existsSync(join(outDir, "index.html")), "index.html written");
    assert.ok(existsSync(join(outDir, "sitemap.xml")), "sitemap.xml written");

    const html = readFileSync(join(outDir, "index.html"), "utf8");
    assert.match(html, /<title>Home<\/title>/);
    assert.match(html, /Welcome world/);
    assert.match(html, /id="bake"/);              // baked data island
    assert.match(html, /"greeting":"hello"/);
    assert.match(html, /href="https:\/\/flags\.example\/"/); // canonical link

    const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
    assert.match(sitemap, /https:\/\/flags\.example\//);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bake: unsupported directive (each-like object) produces a loud error, not [object Object]", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "bake-each-app", type: "module" }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "es2022",
        module: "es2022",
        moduleResolution: "bundler",
        strict: true,
      },
    }),
    "shell.html": `<!doctype html><html><head></head><body><div id="app"></div></body></html>`,
    "src/routes.ts": `
      // A directive-like object that bake's renderer cannot serialize. The
      // previous bake silently produced "[object Object]"; the new one must
      // raise a loud error with a hint.
      const eachLike = { _type: "each", items: [1, 2, 3] };
      const page = {
        _page: true,
        head: () => ({}),
        view: () => ({
          _mado: true,
          strings: ["<ul>", "</ul>"],
          values: [eachLike],
        }),
        bake: { paths: () => [{}], data: () => ({}) },
      };
      export const manifest = { "/": page };
      export default { manifest };
    `,
  });
  try {
    const result = await runBake(dir, [
      "--entry", "src/routes.ts",
      "--template", "shell.html",
      "--out", "dist/baked",
    ]);
    assert.notEqual(result.code, 0, "bake should fail on unsupported render shape");
    const combined = (result.stdout ?? "") + (result.stderr ?? "");
    assert.match(combined, /bake cannot (render|serialize) value of type "each"/);
    assert.doesNotMatch(combined, /\[object Object\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});