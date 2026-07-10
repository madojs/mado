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
test("mado init preserves each starter toolchain", async () => {
  for (const starter of ["default", "modular"]) {
    const root = mkdtempSync(join(tmpdir(), `mado-init-${starter}-`));
    try {
      await exec(process.execPath, [CLI, "init", "app", "--starter", starter], {
        cwd: root,
      });

      const pkg = JSON.parse(
        readFileSync(join(root, "app", "package.json"), "utf8"),
      );
      const template = JSON.parse(
        readFileSync(join(REPO_ROOT, "starters", starter, "package.json"), "utf8"),
      );

      assert.equal(pkg.name, "app");
      assert.equal(
        pkg.dependencies["@madojs/mado"],
        `^${ROOT_PACKAGE.version}`,
        `${starter}: @madojs/mado dependency should track the package version`,
      );

      assert.deepEqual(pkg.devDependencies, template.devDependencies);
      assert.equal(
        pkg.devDependencies.esbuild,
        undefined,
        `${starter}: generated apps should not depend on esbuild`,
      );
      assert.equal(
        pkg.devDependencies.lightningcss,
        undefined,
        `${starter}: Vite owns the default CSS toolchain`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
