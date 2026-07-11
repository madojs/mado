import test from "node:test";
import assert from "node:assert/strict";

import { platformInvocation } from "../../scripts/platform-command.mjs";

test("package smoke invokes npm CLI through Node on Windows", () => {
  const options = {
    platform: "win32",
    npmExecPath: "C:\\npm\\npm-cli.js",
    nodeExecPath: "C:\\node\\node.exe",
  };
  assert.deepEqual(platformInvocation("npm", ["pack"], options), {
    command: "C:\\node\\node.exe",
    args: ["C:\\npm\\npm-cli.js", "pack"],
  });
  assert.deepEqual(platformInvocation("npx", ["mado", "init"], options), {
    command: "C:\\node\\node.exe",
    args: ["C:\\npm\\npm-cli.js", "exec", "--", "mado", "init"],
  });
});

test("package smoke keeps POSIX commands unchanged", () => {
  assert.deepEqual(
    platformInvocation("tool", ["arg"], { platform: "linux", npmExecPath: undefined }),
    { command: "tool", args: ["arg"] },
  );
});

test("Windows direct execution fails with an actionable npm error", () => {
  assert.throws(
    () => platformInvocation("npm", ["pack"], { platform: "win32", npmExecPath: undefined }),
    /npm run package:smoke/,
  );
});
