import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectContext } from "../_config.mjs";
import { runInit } from "./init.mjs";
import { runNew } from "./generate.mjs";
import { printHelp } from "./help.mjs";
import { runRelease } from "./release.mjs";
import { hasFlag, listTestFiles, run, runNodeBin, runNodeScript, runVite } from "./run.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function main(argv) {
  const projectRoot = resolve(process.cwd());
  const context = detectContext(projectRoot);
  const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const ctx = {
    packageRoot: PACKAGE_ROOT,
    projectRoot,
    packageJson,
    context,
    isRepo: context === "repo",
  };

  const [rawCommand, ...args] = argv;
  const command = rawCommand ?? "help";

  switch (command) {
    case "init":
      await runInit(ctx, args);
      break;
    case "build":
      await runNodeBin(ctx, "typescript/bin/tsc", args);
      break;
    case "watch":
      await runNodeBin(ctx, "typescript/bin/tsc", ["-w", ...args]);
      break;
    case "typecheck":
      await runNodeBin(ctx, "typescript/bin/tsc", ["--noEmit", ...args]);
      break;
    case "test": {
      await runNodeBin(ctx, "typescript/bin/tsc", []);
      const files = await listTestFiles(projectRoot);
      await run(process.execPath, ["--test", "--test-timeout=30000", ...files, ...args], {
        cwd: projectRoot,
      });
      break;
    }
    case "dev":
      await runVite(
        ctx,
        [...(hasFlag(args, "--host") ? [] : ["--host", "localhost"]), ...args],
        { defaultConfig: true },
      );
      break;
    case "bake":
      console.error("[mado] `mado bake` was removed.");
      console.error("Use `mado static`, or run the complete pipeline with `mado release`.");
      process.exit(1);
      break;
    case "static":
      await runNodeScript(ctx, "scripts/static.mjs", args);
      break;
    case "preview":
      await runNodeScript(ctx, "scripts/preview.mjs", args);
      break;
    case "release":
      await runRelease(ctx, args);
      break;
    case "new":
      await runNew(ctx, args);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp(ctx);
      break;
    default:
      console.error(`[mado] unknown command: ${command}`);
      printHelp(ctx);
      process.exit(1);
  }
}
