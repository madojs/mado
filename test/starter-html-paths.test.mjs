// Tests that every starter ships an index.html that survives SPA hard refresh
// on a nested route.
//
// Background: an earlier version of every starter shipped relative paths in
// the importmap and the entry script tag:
//
//   <script type="importmap">
//     { "imports": {
//         "@madojs/mado": "./node_modules/@madojs/mado/dist/src/index.js",
//         ...
//     }}
//   </script>
//   <script type="module" src="./dist/main.js"></script>
//
// Hard-refreshing /admin/orders/42 (or any nested route) makes the browser
// resolve "./dist/main.js" against the current URL — fetching
// /admin/orders/dist/main.js → 404 → blank page. The same trap hits the
// importmap because of "./node_modules/...".
//
// This regression test asserts that every starter index.html uses root-absolute
// paths (start with "/") for both the importmap and the entry script.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTERS_DIR = resolve(__dirname, "..", "starters");

function listStarters() {
  return readdirSync(STARTERS_DIR).filter((name) => {
    const p = join(STARTERS_DIR, name);
    return statSync(p).isDirectory();
  });
}

test("every starter index.html uses absolute paths so nested-route hard refresh works", () => {
  for (const starter of listStarters()) {
    const indexPath = join(STARTERS_DIR, starter, "index.html");
    const html = readFileSync(indexPath, "utf8");

    // 1) Entry script tag.
    const scriptMatch = html.match(
      /<script\s+type="module"\s+src="([^"]+)"[^>]*><\/script>/,
    );
    assert.ok(
      scriptMatch,
      `${starter}/index.html: missing <script type="module" src="…">`,
    );
    const src = scriptMatch[1];
    assert.ok(
      src.startsWith("/"),
      `${starter}/index.html: entry script src must be root-absolute, got ${src}\n` +
        "Relative paths ('./...') break SPA hard refresh on nested routes.",
    );

    // 2) Importmap.
    const importmapMatch = html.match(
      /<script type="importmap">([\s\S]*?)<\/script>/,
    );
    assert.ok(
      importmapMatch,
      `${starter}/index.html: missing <script type="importmap">`,
    );
    const importmap = JSON.parse(importmapMatch[1]);
    const imports = importmap.imports ?? {};
    for (const [key, value] of Object.entries(imports)) {
      assert.ok(
        typeof value === "string" && value.startsWith("/"),
        `${starter}/index.html: importmap entry "${key}" must be root-absolute, got "${value}"\n` +
          "Relative paths ('./...') break SPA hard refresh on nested routes.",
      );
    }
  }
});