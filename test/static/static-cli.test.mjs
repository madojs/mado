import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const STATIC = resolve(REPO_ROOT, "scripts/static.mjs");
const BAKE = resolve(REPO_ROOT, "scripts/bake.mjs");

function mkTempProject(layout) {
  const dir = mkdtempSync(join(tmpdir(), "mado-static-"));
  for (const [path, content] of Object.entries(layout)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

async function runScript(script, cwd, args = []) {
  try {
    const result = await exec(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    return { code: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (err) {
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err.message ?? ""),
    };
  }
}

test("bake: tombstone points to static/release", async () => {
  const dir = mkTempProject({ "package.json": "{}" });
  try {
    const result = await runScript(BAKE, dir);
    assert.notEqual(result.code, 0);
    const output = result.stdout + result.stderr;
    assert.match(output, /`mado bake` was removed/);
    assert.match(output, /mado static/);
    assert.match(output, /mado release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static: missing route manifest produces a clear error", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "no-routes-app", type: "module" }),
    "out/index.html": "<!doctype html><html><head></head><body><div id=\"app\"></div></body></html>",
  });
  try {
    const result = await runScript(STATIC, dir);
    assert.notEqual(result.code, 0);
    const output = result.stdout + result.stderr;
    assert.match(output, /\[mado:static\] entry not found/);
    assert.match(output, /src\/app\.routes\.ts|--entry/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static: dynamic static route without paths fails during discovery", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "dynamic-static-app", type: "module" }),
    "out/index.html": "<!doctype html><html><head></head><body><div id=\"app\"></div></body></html>",
    "src/routes.ts": `
      const page = { _page: true, static: true, view: () => ({ _mado: true, strings: [""], values: [] }) };
      export const manifest = { "/products/:slug": page };
      export default { manifest };
    `,
  });
  try {
    const result = await runScript(STATIC, dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout + result.stderr, /dynamic static routes must provide static\.paths/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("static: SPA-only manifest preserves fallback shell and writes deployment files", async () => {
  const dir = mkTempProject({
    "package.json": JSON.stringify({ name: "spa-only-app", type: "module" }),
    "out/index.html": "<!doctype html><html><head><title>App</title></head><body><div id=\"app\"></div></body></html>",
    "src/routes.ts": `
      const page = { _page: true, view: () => ({ _mado: true, strings: [""], values: [] }) };
      export const manifest = { "/": page };
      export default { manifest };
    `,
  });
  try {
    const result = await runScript(STATIC, dir);
    if (result.code !== 0) {
      throw new Error(
        `static exited ${result.code}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      );
    }
    assert.ok(existsSync(join(dir, "out/_mado/spa.html")));
    assert.ok(existsSync(join(dir, "out/404.html")));
    assert.ok(existsSync(join(dir, "out/sitemap.xml")));
    assert.ok(existsSync(join(dir, "out/_redirects")));
    assert.match(readFileSync(join(dir, "out/_mado/spa.html"), "utf8"), /noindex/);
    assert.match(readFileSync(join(dir, "out/_redirects"), "utf8"), /\/_mado\/spa\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
