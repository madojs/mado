import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import {
  OUTPUT_SENTINEL,
  claimOutputDirectory,
  prepareOutputDirectory,
} from "../../scripts/output-guard.mjs";

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "mado-output-"));
  const project = join(parent, "app");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "package.json"), "{}\n");
  writeFileSync(join(project, "src", "keep.ts"), "// keep\n");
  return { parent, project };
}

test("output guard rejects project root, parent and source even with force", async () => {
  const { parent, project } = fixture();
  try {
    for (const outDir of [project, parent, join(project, "src")]) {
      await assert.rejects(
        prepareOutputDirectory({ projectRoot: project, outDir, force: true }),
        /refusing/,
      );
    }
    assert.equal(readFileSync(join(project, "src", "keep.ts"), "utf8"), "// keep\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("output guard refuses a foreign non-empty directory", async () => {
  const { parent, project } = fixture();
  const output = join(project, "public-build");
  mkdirSync(output);
  writeFileSync(join(output, "keep.txt"), "important\n");
  try {
    await assert.rejects(
      prepareOutputDirectory({ projectRoot: project, outDir: output }),
      /not owned by Mado/,
    );
    assert.equal(readFileSync(join(output, "keep.txt"), "utf8"), "important\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("output guard cleans only a sentinel-owned directory", async () => {
  const { parent, project } = fixture();
  const output = join(project, "out");
  try {
    await claimOutputDirectory({ projectRoot: project, outDir: output });
    writeFileSync(join(output, "old.txt"), "old\n");
    await prepareOutputDirectory({ projectRoot: project, outDir: output });
    assert.equal(existsSync(join(output, "old.txt")), false);
    assert.equal(existsSync(join(output, OUTPUT_SENTINEL)), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("output guard resolves symlinks before safety checks", async () => {
  const { parent, project } = fixture();
  const link = join(project, "linked-output");
  try {
    symlinkSync(project, link, "dir");
    await assert.rejects(
      prepareOutputDirectory({ projectRoot: project, outDir: link, force: true }),
      /project root/,
    );
    assert.equal(existsSync(join(project, "package.json")), true);
  } finally {
    rmSync(dirname(project), { recursive: true, force: true });
  }
});
