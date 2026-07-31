import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));
const contract = JSON.parse(
  readFileSync(new URL("../../api/public-api.json", import.meta.url)),
);

test("package exports expose only the public entrypoints", () => {
  assert.deepEqual(Object.keys(pkg.exports).sort(), contract.subpaths.slice().sort());
  assert.equal(pkg.exports["./*"], undefined);
});

test("package self-import blocks internal subpaths", async () => {
  const api = await import("@madojs/mado");
  assert.deepEqual(Object.keys(api).sort(), contract.runtimeExports["."].slice().sort());
  assert.equal(typeof api.html, "function");
  assert.equal(typeof api.layout, "function");
  assert.equal(api.nested, undefined);
  for (const removed of [
    "adopt",
    "instantiate",
    "isHtmlDirective",
    "isLayoutGroup",
    "isPage",
    "lazy",
    "list",
    "scopeStyles",
  ]) {
    assert.equal(api[removed], undefined, `${removed} must not leak from the root API`);
  }
  const devtools = await import("@madojs/mado/devtools.js");
  assert.deepEqual(
    Object.keys(devtools).sort(),
    contract.runtimeExports["./devtools.js"].slice().sort(),
  );
  assert.equal(typeof devtools.devtools?.open, "function");
  const vite = await import("@madojs/mado/vite");
  assert.deepEqual(
    Object.keys(vite).sort(),
    contract.runtimeExports["./vite"].slice().sort(),
  );
  assert.equal(typeof vite.mado, "function");

  const manifestUrl = import.meta.resolve("@madojs/mado/docs/en/manifest.json");
  const manifest = JSON.parse(readFileSync(new URL(manifestUrl), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.locale, "en");
  assert.ok(manifest.sections.length > 0);
  for (const section of manifest.sections) {
    for (const entry of section.entries) {
      assert.match(
        readFileSync(new URL(entry.file, manifestUrl), "utf8"),
        /^#\s+\S/,
        `${entry.file} must resolve relative to the public manifest`,
      );
    }
  }
  const llmsUrl = import.meta.resolve("@madojs/mado/llms.txt");
  assert.match(readFileSync(new URL(llmsUrl), "utf8"), /^# Mado$/m);
  const packageUrl = import.meta.resolve("@madojs/mado/package.json");
  const publicPackage = JSON.parse(readFileSync(new URL(packageUrl), "utf8"));
  assert.equal(publicPackage.name, "@madojs/mado");
  assert.equal(publicPackage.version, pkg.version);

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
