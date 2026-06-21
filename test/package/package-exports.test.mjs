import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));

test("package exports expose only the public entrypoints", () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), [".", "./devtools.js", "./vite"]);
  assert.equal(pkg.exports["./*"], undefined);
});

test("package self-import blocks internal subpaths", async () => {
  const api = await import("@madojs/mado");
  assert.equal(typeof api.html, "function");
  assert.equal(typeof api.layout, "function");
  assert.equal(api.nested, undefined);
  await import("@madojs/mado/devtools.js");
  const vite = await import("@madojs/mado/vite");
  assert.equal(typeof vite.mado, "function");

  await assert.rejects(
    import("@madojs/mado/lifecycle.js"),
    (err) =>
      err &&
      err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" &&
      String(err.message).includes("./lifecycle.js"),
  );
});

test("internal test hooks are stripped from public declarations", () => {
  const files = [
    "../../dist/src/signal.d.ts",
    "../../dist/src/diagnostics.d.ts",
    "../../dist/src/resource.d.ts",
    "../../dist/src/router/manifest.d.ts",
    "../../dist/src/router/navigation.d.ts",
  ];

  for (const file of files) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(text.includes("_testHooks"), false, `${file} leaks _testHooks`);
  }
});
