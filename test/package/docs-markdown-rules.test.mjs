import test from "node:test";
import assert from "node:assert/strict";

import {
  backslashEscapedBacktickLines,
} from "../../scripts/docs-markdown-rules.mjs";

test("published prose rejects backslash-escaped backticks", () => {
  assert.deepEqual(
    backslashEscapedBacktickLines(
      [
        "# Guide",
        "",
        "Use `html\\`...\\`` here.",
        "Use ``` html`` ``` instead.",
      ].join("\n"),
    ),
    [3],
  );
});

test("fenced source examples may contain literal backslash-backticks", () => {
  assert.deepEqual(
    backslashEscapedBacktickLines(
      [
        "```ts",
        "const source = String.raw`html\\`...\\``;",
        "```",
        "",
        "Portable ``` html`` ``` prose.",
      ].join("\n"),
    ),
    [],
  );
});

test("an inline long code span at line start is not mistaken for a fence", () => {
  assert.deepEqual(
    backslashEscapedBacktickLines(
      [
        "``` html`` ``` is a tagged template.",
        "Broken `css\\`\\`` prose.",
      ].join("\n"),
    ),
    [2],
  );
});
