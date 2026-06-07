#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ROOT = resolve(process.cwd());
const [, , rawCommand, ...args] = process.argv;

const EXAMPLES = [
  ["basic", "minimal API tour"],
  ["tickets", "LLM zero-history CRUD validation"],
  ["showcase", "flagship SaaS CRM pressure app"],
  ["cloudflare", "Cloudflare Workers edge example"],
];

const command = rawCommand ?? "help";

switch (command) {
  case "build":
    await runNodeBin("typescript/bin/tsc", args);
    break;
  case "watch":
    await runNodeBin("typescript/bin/tsc", ["-w", ...args]);
    break;
  case "typecheck":
    await runNodeBin("typescript/bin/tsc", ["--noEmit", ...args]);
    break;
  case "test":
    if (args[0] === "browser") {
      await runNodeScript("scripts/showcase-regression.mjs", args.slice(1));
    } else {
      const files = await listTestFiles();
      await run(process.execPath, ["--test", "--test-timeout=10000", ...files, ...args]);
    }
    break;
  case "serve":
    await runServe(args[0] ?? "");
    break;
  case "dev":
    await runDev(args[0] ?? "");
    break;
  case "bake":
    await runNodeScript("scripts/bake.mjs", args);
    break;
  case "bundle":
    await runNodeScript("scripts/bundle.mjs", args);
    break;
  case "preview":
    await runNodeScript("scripts/preview.mjs", args);
    break;
  case "new":
    await runNodeScript("scripts/new.mjs", args);
    break;
  case "examples":
    printExamples();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`[mado] unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

async function runServe(example) {
  if (example) assertExample(example, { serveable: true });
  await run(process.execPath, [join(PACKAGE_ROOT, "server/serve.mjs"), example].filter(Boolean), {
    env: { ...process.env, EXAMPLE: example || process.env.EXAMPLE || "" },
  });
}

async function runDev(example) {
  if (example) assertExample(example, { serveable: true });

  const env = { ...process.env, EXAMPLE: example || process.env.EXAMPLE || "" };
  const server = spawn(process.execPath, [join(PACKAGE_ROOT, "server/serve.mjs"), example].filter(Boolean), {
    cwd: PROJECT_ROOT,
    env,
    stdio: "inherit",
  });
  const tsc = spawn(process.execPath, [resolveBin("typescript/bin/tsc"), "-w"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

  const children = [server, tsc];
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(code), 80);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await Promise.race(
    children.map(
      (child) =>
        new Promise((resolveExit) => {
          child.on("exit", (code, signal) => resolveExit({ code, signal }));
        }),
    ),
  ).then(({ code, signal }) => {
    if (signal) shutdown(1);
    else shutdown(code ?? 0);
  });
}

async function runNodeBin(bin, args) {
  await run(process.execPath, [resolveBin(bin), ...args]);
}

async function runNodeScript(script, args) {
  await run(process.execPath, [join(PACKAGE_ROOT, script), ...args]);
}

async function run(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: options.env ?? process.env,
    shell: options.shell ?? false,
  });
  const code = await new Promise((resolveExit) => {
    child.on("exit", (status) => resolveExit(status ?? 1));
  });
  if (code !== 0) process.exit(code);
}

function resolveBin(bin) {
  const projectPath = join(PROJECT_ROOT, "node_modules", bin);
  if (existsSync(projectPath)) return projectPath;
  const path = join(PACKAGE_ROOT, "node_modules", bin);
  if (!existsSync(path)) {
    console.error(`[mado] missing ${bin}. Run npm install first.`);
    process.exit(1);
  }
  return path;
}

function assertExample(name, { serveable }) {
  const dir = join(PROJECT_ROOT, "examples", name);
  if (!existsSync(dir)) {
    console.error(`[mado] unknown example: ${name}`);
    printExamples();
    process.exit(1);
  }
  if (serveable && !existsSync(join(dir, "index.html"))) {
    console.error(`[mado] example "${name}" is not a browser SPA example.`);
    process.exit(1);
  }
}

function printExamples() {
  console.log("Available examples:");
  for (const [name, description] of EXAMPLES) {
    const marker = existsSync(join(PROJECT_ROOT, "examples", name, "index.html")) ? "serve" : "docs";
    console.log(`  ${name.padEnd(10)} ${marker.padEnd(5)} ${description}`);
  }
}

async function listTestFiles() {
  const dir = join(PROJECT_ROOT, "test");
  const files = await readdir(dir);
  return files
    .filter((file) => file.endsWith(".test.mjs"))
    .sort()
    .map((file) => join("test", file));
}

function printHelp() {
  console.log(`mado commands:
  mado build
  mado watch
  mado typecheck
  mado test [browser]
  mado serve [basic|tickets|showcase]
  mado dev [basic|tickets|showcase]
  mado bake
  mado bundle
  mado preview
  mado new <list|form|detail> <name>
  mado examples`);
}
