// Tests for scripts/_config.mjs — the single configuration loader.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  detectContext,
  loadConfig,
  parseFlags,
  resolveProjectPath,
} from "../scripts/_config.mjs";

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

test("detectContext: dir with @madojs/mado package.json + src/index.ts + examples/ is repo-mode", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "@madojs/mado" }),
    "src/index.ts": "// framework entry",
    "examples/README.md": "examples",
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

test("loadConfig: app-mode defaults point to src/routes.ts and index.html", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "my-app" }),
  });
  try {
    const cfg = loadConfig({ projectRoot: dir });
    assert.equal(cfg.context, "app");
    assert.equal(cfg.bake.entry, "src/routes.ts");
    assert.equal(cfg.bake.template, "index.html");
    assert.equal(cfg.build.out, "out");
    assert.equal(cfg.build.dist, "dist");
    assert.equal(cfg.build.publicDir, "public");
    assert.equal(cfg.dev.port, 5173);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: mado.config.json overrides defaults", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "my-app" }),
    "mado.config.json": JSON.stringify({
      dev: { port: 4000, proxy: { "/api": "http://upstream:9000" } },
      bake: { entry: "src/edge-routes.ts", baseUrl: "https://example.org" },
      build: { out: "dist-out" },
    }),
  });
  try {
    const cfg = loadConfig({ projectRoot: dir });
    assert.equal(cfg.dev.port, 4000);
    assert.equal(cfg.dev.proxy["/api"], "http://upstream:9000");
    assert.equal(cfg.bake.entry, "src/edge-routes.ts");
    assert.equal(cfg.bake.baseUrl, "https://example.org");
    // template untouched → default
    assert.equal(cfg.bake.template, "index.html");
    assert.equal(cfg.build.out, "dist-out");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: explicit overrides beat the config file", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "my-app" }),
    "mado.config.json": JSON.stringify({ bake: { entry: "from-file.ts" } }),
  });
  try {
    const cfg = loadConfig({
      projectRoot: dir,
      overrides: { bake: { entry: "from-flag.ts" } },
    });
    assert.equal(cfg.bake.entry, "from-flag.ts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig: undefined values in overrides do not clobber defaults", () => {
  const dir = makeProject({
    "package.json": JSON.stringify({ name: "my-app" }),
  });
  try {
    const cfg = loadConfig({
      projectRoot: dir,
      overrides: { bake: { entry: undefined, template: undefined } },
    });
    assert.equal(cfg.bake.entry, "src/routes.ts");
    assert.equal(cfg.bake.template, "index.html");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectPath: resolves relative paths against projectRoot", () => {
  const cfg = { projectRoot: "/tmp/proj" };
  assert.equal(resolveProjectPath(cfg, "src/routes.ts"), "/tmp/proj/src/routes.ts");
  assert.equal(resolveProjectPath(cfg, "/abs/path"), "/abs/path");
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
  const { flags, positional } = parseFlags(["init", "my-app", "--starter", "admin"]);
  assert.deepEqual(positional, ["init", "my-app"]);
  assert.equal(flags.starter, "admin");
});