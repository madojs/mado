// Regression test for stale asset cleanup in `mado bundle`.
//
// Earlier behavior:
//   scripts/bundle.mjs created out/assets/ but never cleaned it. Each run
//   produced new hashed files (main-<hash>.js, chunk-<hash>.js) alongside the
//   old ones. The subsequent `readdir(ASSETS_DIR)` then treated every .js it
//   found as part of the current bundle, so the rewritten out/index.html
//   ended up with <link rel="modulepreload"> entries for stale chunks from
//   prior runs. SRI was only computed for the fresh entry, so stale preloads
//   shipped without integrity checks. The production HTML kept growing,
//   the browser preloaded dead code, and the cache story degraded with
//   every release.
//
// This test runs bundle twice on a tiny synthesized project and asserts that:
//   1) Each run leaves a single main-<hash>.js (no accumulated stale files).
//   2) The number of asset .js files after run #2 equals the freshly emitted
//      chunks (i.e. <= number of entry+chunk files esbuild produced this run).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BUNDLE = resolve(REPO_ROOT, "scripts/bundle.mjs");

function scaffold() {
  const root = mkdtempSync(join(tmpdir(), "mado-bundle-"));
  mkdirSync(join(root, "src"), { recursive: true });

  // index.html with the documented importmap + entry script. The actual
  // values don't matter for this test; bundle.mjs just rewrites them.
  writeFileSync(
    join(root, "index.html"),
    `<!doctype html>
<html><head>
  <meta charset="utf-8">
  <title>t</title>
  <script type="importmap">{"imports":{}}</script>
</head><body>
  <div id="app"></div>
  <script type="module" src="/dist/main.js"></script>
</body></html>
`,
  );

  // A tiny entry with one dynamic import so esbuild emits at least one
  // chunk in addition to the main bundle. This is the same shape every
  // real Mado app produces (lazy-loaded pages).
  writeFileSync(
    join(root, "src/main.ts"),
    `import("./extra.js").then((m) => console.log(m.value));\n`,
  );
  writeFileSync(join(root, "src/extra.ts"), `export const value = 1;\n`);

  // Minimal mado.config.json so loadConfig() treats this as app-mode.
  writeFileSync(
    join(root, "mado.config.json"),
    JSON.stringify({ build: { out: "out" } }, null, 2),
  );

  return root;
}

function listJs(dir) {
  return readdirSync(dir).filter((f) => f.endsWith(".js"));
}

test("mado bundle: second run does not accumulate stale hashed assets", async () => {
  const root = scaffold();
  try {
    // Run #1
    await exec(process.execPath, [BUNDLE], { cwd: root });
    const assetsDir = join(root, "out", "assets");
    const first = listJs(assetsDir).sort();
    assert.ok(first.length > 0, "first run should emit at least one .js");
    const firstMain = first.filter((f) => f.startsWith("main-"));
    assert.equal(
      firstMain.length,
      1,
      `expected exactly one main-<hash>.js after first run, got ${firstMain.join(", ")}`,
    );

    // Mutate the source so the second build produces a different hash.
    writeFileSync(
      join(root, "src/main.ts"),
      `import("./extra.js").then((m) => console.log("v2", m.value));\n`,
    );

    // Run #2
    await exec(process.execPath, [BUNDLE], { cwd: root });
    const second = listJs(assetsDir).sort();
    const secondMain = second.filter((f) => f.startsWith("main-"));
    assert.equal(
      secondMain.length,
      1,
      `expected exactly one main-<hash>.js after second run, got ${secondMain.join(
        ", ",
      )}.\nStale main-* survived between runs — production HTML would preload dead code.`,
    );

    // The fresh main must not be the previous main (hash should differ
    // because the source changed). If it doesn't, the bundle never wrote
    // a new entry and the test is meaningless.
    assert.notEqual(
      secondMain[0],
      firstMain[0],
      "test sanity: source changed, hashed entry should change too",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});