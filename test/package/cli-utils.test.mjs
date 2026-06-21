import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  detectContext,
  parseFlags,
  resolveProjectPath,
} from "../../scripts/_config.mjs";

function makeProject(layout) {
  const dir = mkdtempSync(join(tmpdir(), "mado-cfg-"));
  for (const [path, content] of Object.entries(layout)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test("detectContext: empty dir is app-mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "mado-ctx-"));
  try {
    assert.equal(detectContext(dir), "app");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectContext: dir with @madojs/mado package.json + src/index.ts is repo-mode", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "@madojs/mado" }),
    "src/index.ts": "// framework entry",
  });
  try {
    assert.equal(detectContext(dir), "repo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectContext: a user app that uses madojs is still app-mode", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({
      name: "my-app",
      dependencies: { "@madojs/mado": "^0.5.0" },
    }),
    "src/routes.ts": "export const manifest = {};",
  });
  try {
    assert.equal(detectContext(dir), "app");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectPath: resolves relative paths against projectRoot", () => {
  assert.equal(resolveProjectPath("/tmp/proj", "src/routes.ts"), "/tmp/proj/src/routes.ts");
  assert.equal(resolveProjectPath("/tmp/proj", "/abs/path"), "/abs/path");
});

test("parseFlags: --key=value", () => {
  const { flags, positional } = parseFlags(["build", "--out=dist", "--entry=src/a.ts"]);
  assert.deepEqual(positional, ["build"]);
  assert.equal(flags.out, "dist");
  assert.equal(flags.entry, "src/a.ts");
});

test("parseFlags: --key value", () => {
  const { flags } = parseFlags(["--entry", "src/routes.ts", "--base-url", "https://x"]);
  assert.equal(flags.entry, "src/routes.ts");
  assert.equal(flags["base-url"], "https://x");
});

test("parseFlags: boolean --flag", () => {
  const { flags } = parseFlags(["--force"]);
  assert.equal(flags.force, true);
});

test("parseFlags: positional + flags mixed", () => {
  const { flags, positional } = parseFlags(["init", "my-app", "--starter", "default"]);
  assert.deepEqual(positional, ["init", "my-app"]);
  assert.equal(flags.starter, "default");
});
