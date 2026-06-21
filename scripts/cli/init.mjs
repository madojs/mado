import { existsSync, readdirSync, statSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parseFlags } from "../_config.mjs";

const STARTERS = ["default"];

export async function runInit(ctx, rawArgs) {
  const { flags, positional } = parseFlags(rawArgs);
  const targetArg = positional[0];
  if (!targetArg) {
    console.error("[mado] usage: mado init <name> [--starter default] [--force]");
    process.exit(1);
  }

  const starter = String(flags.starter ?? "default");
  if (!STARTERS.includes(starter)) {
    console.error(`[mado] unknown starter: ${starter}`);
    console.error(`[mado] available starters: ${STARTERS.join(", ")}`);
    process.exit(1);
  }

  const target = resolve(ctx.projectRoot, targetArg);
  const source = join(ctx.packageRoot, "starters", starter);
  if (!existsSync(source)) {
    console.error(`[mado] missing starter template: ${starter}`);
    process.exit(1);
  }
  if (existsSync(target) && statSync(target).isFile()) {
    console.error(`[mado] target exists and is a file: ${target}`);
    process.exit(1);
  }
  if (existsSync(target) && readdirSync(target).length > 0 && !flags.force) {
    console.error(`[mado] target directory is not empty: ${target}`);
    console.error("[mado] use --force to write into it");
    process.exit(1);
  }

  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  await copyCanonicalLLMFiles(ctx, target);
  await ensureStarterGitignore(target);
  await ensureStarterPackageJson(ctx, target);

  const packageName = packageNameFromDir(target);
  if (!isValidPackageName(packageName)) {
    console.error(`[mado] invalid package name derived from target: ${packageName}`);
    process.exit(1);
  }

  const replacements = {
    __APP_NAME__: packageName,
    __PACKAGE_NAME__: packageName,
    __MADOJS_VERSION__:
      process.env.MADO_PACKAGE_SPEC ||
      process.env.MADOJS_PACKAGE_SPEC ||
      `^${ctx.packageJson.version}`,
    __MADO_VERSION__: ctx.packageJson.version,
  };

  for (const file of await walkFiles(target)) {
    const text = await readFile(file, "utf8").catch(() => null);
    if (text === null) continue;
    let next = text;
    for (const [key, value] of Object.entries(replacements)) {
      next = next.split(key).join(value);
    }
    if (next !== text) await writeFile(file, next);
  }

  console.log("");
  console.log(`Created ${packageName} with the ${starter} starter.`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${relativePath(ctx.projectRoot, target)}`);
  console.log("  npm install");
  console.log("  npm run dev");
  console.log("");
}

async function copyCanonicalLLMFiles(ctx, target) {
  for (const file of ["llms.txt"]) {
    const source = join(ctx.packageRoot, file);
    const dest = join(target, file);
    if (existsSync(source) && !existsSync(dest)) await copyFile(source, dest);
  }
}

async function ensureStarterGitignore(target) {
  const file = join(target, ".gitignore");
  if (existsSync(file)) return;
  await writeFile(file, "node_modules\nout\n.DS_Store\n*.log\n");
}

async function ensureStarterPackageJson(ctx, target) {
  const file = join(target, "package.json");
  if (!existsSync(file)) return;

  const pkg = JSON.parse(await readFile(file, "utf8"));
  pkg.dependencies = {
    ...(pkg.dependencies ?? {}),
    "@madojs/mado":
      process.env.MADO_PACKAGE_SPEC ||
      process.env.MADOJS_PACKAGE_SPEC ||
      `^${ctx.packageJson.version}`,
  };
  const rootDev = ctx.packageJson.devDependencies ?? {};
  pkg.devDependencies = {
    ...(pkg.devDependencies ?? {}),
    typescript: rootDev.typescript ?? "^6.0.3",
    linkedom: rootDev.linkedom ?? "^0.18.12",
    lightningcss: rootDev.lightningcss ?? "^1.32.0",
    vite: rootDev.vite ?? "^8.0.16",
  };

  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function packageNameFromDir(target) {
  return target
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mado-app";
}

function isValidPackageName(name) {
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name)
    && !name.includes("..")
    && !name.startsWith(".")
    && name.length <= 214;
}

async function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git"].includes(entry)) continue;
    if (entry === "package-lock.json") continue;
    const file = join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) out.push(...await walkFiles(file));
    else out.push(file);
  }
  return out;
}

function relativePath(from, to) {
  const rel = to.startsWith(from) ? to.slice(from.length).replace(/^[/\\]/, "") : to;
  return rel || ".";
}
