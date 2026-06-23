import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CLI = resolve(REPO_ROOT, "scripts/cli.mjs");
const ROOT_PACKAGE = JSON.parse(
  readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
);
const REQUIRED_DEV_DEPS = [
  "typescript",
  "vite",
  "playwright-core",
  "lightningcss",
];

test("mado init writes required dev dependencies for every starter", async () => {
  for (const starter of ["default", "modular"]) {
    const root = mkdtempSync(join(tmpdir(), `mado-init-${starter}-`));
    try {
      await exec(process.execPath, [CLI, "init", "app", "--starter", starter], {
        cwd: root,
      });

      const pkg = JSON.parse(
        readFileSync(join(root, "app", "package.json"), "utf8"),
      );

      assert.equal(pkg.name, "app");
      assert.equal(
        pkg.dependencies["@madojs/mado"],
        `^${ROOT_PACKAGE.version}`,
        `${starter}: @madojs/mado dependency should track the package version`,
      );

      for (const name of REQUIRED_DEV_DEPS) {
        assert.equal(
          pkg.devDependencies[name],
          ROOT_PACKAGE.devDependencies[name],
          `${starter}: ${name} should be generated as a devDependency`,
        );
      }
      assert.equal(
        pkg.devDependencies.esbuild,
        undefined,
        `${starter}: generated apps should not depend on esbuild`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
