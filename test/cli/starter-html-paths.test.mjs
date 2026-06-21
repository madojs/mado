// Tests that every starter ships a Vite-style index.html that survives SPA hard
// refresh on nested routes: the module entry is root-absolute and there is no
// legacy importmap/dist script path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTERS_DIR = resolve(__dirname, "../..", "starters");

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
    assert.equal(src, "/src/main.ts", `${starter}/index.html should use the Vite TS entry`);
    assert.equal(html.includes("importmap"), false, `${starter}/index.html should not use importmaps`);
    assert.equal(html.includes("/dist/"), false, `${starter}/index.html should not reference dist/`);
  }
});
