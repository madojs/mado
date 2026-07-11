import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("published source maps embed their TypeScript sources", async () => {
  for (const file of ["index.js.map", "signal.js.map", "vite/index.js.map"]) {
    const map = JSON.parse(
      await readFile(new URL(`../../dist/src/${file}`, import.meta.url), "utf8"),
    );
    assert.equal(Array.isArray(map.sourcesContent), true, `${file} has sourcesContent`);
    assert.equal(map.sourcesContent.length, map.sources.length);
    assert.ok(map.sourcesContent.every((source) => typeof source === "string"));
  }
});
