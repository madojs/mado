import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function run(cmd, args, options = {}) {
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: options.env ?? process.env,
    shell: options.shell ?? false,
  });
  const code = await new Promise((resolveExit) => {
    child.on("exit", (status) => resolveExit(status ?? 1));
  });
  if (code !== 0) process.exit(code);
}

export async function runNodeBin(ctx, bin, args) {
  await run(process.execPath, [resolveBin(ctx, bin), ...args], {
    cwd: ctx.projectRoot,
  });
}

export async function runNodeScript(ctx, script, args) {
  await run(process.execPath, [join(ctx.packageRoot, script), ...args], {
    cwd: ctx.projectRoot,
  });
}

export async function runVite(ctx, args, { defaultConfig } = {}) {
  const viteArgs = [...args];
  if (defaultConfig && !hasFlag(viteArgs, "--config") && !hasFlag(viteArgs, "-c")) {
    const configPath = join(ctx.projectRoot, "vite.config.ts");
    if (!existsSync(configPath)) {
      viteArgs.push("--config", join(ctx.packageRoot, "scripts", "vite.default.mjs"));
    }
  }
  await run(
    process.execPath,
    [resolvePackageBin(ctx, "vite", "bin/vite.js"), ...viteArgs],
    { cwd: ctx.projectRoot },
  );
}

export function resolvePackageBin(ctx, pkg, binPath) {
  const projectPath = join(ctx.projectRoot, "node_modules", pkg, binPath);
  if (existsSync(projectPath)) return projectPath;
  const packagePath = join(ctx.packageRoot, "node_modules", pkg, binPath);
  if (existsSync(packagePath)) return packagePath;
  console.error(`[mado] missing ${pkg}. Install it in this project: npm i -D ${pkg}`);
  process.exit(1);
}

export function resolveBin(ctx, bin) {
  const projectPath = join(ctx.projectRoot, "node_modules", bin);
  if (existsSync(projectPath)) return projectPath;
  const packagePath = join(ctx.packageRoot, "node_modules", bin);
  if (!existsSync(packagePath)) {
    console.error(`[mado] missing ${bin}. Run npm install first.`);
    process.exit(1);
  }
  return packagePath;
}

export async function writeIfMissing(path, content, logPrefix = "[mado]") {
  if (existsSync(path)) return;
  await writeFile(path, content);
  console.log(`${logPrefix} wrote ${path}`);
}

export async function listTestFiles(projectRoot) {
  const dir = join(projectRoot, "test");
  const files = [];
  async function walk(current, prefix = "test") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const rel = join(prefix, entry.name);
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
        files.push(rel);
      }
    }
  }
  await walk(dir);
  return files.sort();
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function hasFlag(args, long, short) {
  return args.some((arg) => arg === long || (short && arg === short) || arg.startsWith(`${long}=`));
}
