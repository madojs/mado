import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const exec = promisify(execFile);
const CLI = resolve("scripts/cli.mjs");

test("CLI diagnostics support machine-readable JSON", async () => {
  await assert.rejects(
    exec(process.execPath, [CLI, "unknown", "--log-format=json"], {
      env: { ...process.env, NO_COLOR: "1" },
    }),
    (error) => {
      const record = JSON.parse(error.stderr.trim().split("\n")[0]);
      assert.equal(record.level, "error");
      assert.equal(record.scope, "mado");
      assert.equal(record.code, "unknown-command");
      assert.match(record.message, /unknown command/);
      return true;
    },
  );
});

test("CLI diagnostics honour --log-level=silent", async () => {
  await assert.rejects(
    exec(process.execPath, [CLI, "unknown", "--log-level=silent"]),
    (error) => {
      assert.equal(error.stderr, "");
      return true;
    },
  );
});
