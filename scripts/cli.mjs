#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import http from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectContext, loadConfig } from "./_config.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ROOT = resolve(process.cwd());
const PACKAGE_JSON = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
const [, , rawCommand, ...args] = process.argv;

// Context detection lives in _config.mjs so every script agrees on what
// "repo" vs "app" means. CLI uses it to pick safer defaults.
const CONTEXT = detectContext(PROJECT_ROOT);
const IS_REPO = CONTEXT === "repo";

const EXAMPLES = [
  ["basic", "minimal API tour"],
  ["tickets", "LLM zero-history CRUD validation"],
  ["showcase", "flagship SaaS CRM pressure app"],
  ["cloudflare", "Cloudflare Workers edge example"],
];
const STARTERS = ["minimal", "crud", "admin"];

const command = rawCommand ?? "help";

switch (command) {
  case "init":
    await runInit(args);
    break;
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
      // Ensure dist/ is fresh so tests that import from ../dist/ work.
      await runNodeBin("typescript/bin/tsc", []);
      const files = await listTestFiles();
      await run(process.execPath, ["--test", "--test-timeout=20000", ...files, ...args]);
    }
    break;
  case "serve":
    await runServe(args);
    break;
  case "dev":
    await runDev(args);
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
  case "release":
    await runRelease(args);
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

async function runServe(rawArgs) {
  // Split args into [example?, ...flags]. The first non-flag positional is the
  // example name; everything else (including `--host`, `--port`, etc.) is
  // forwarded verbatim to server/serve.mjs.
  const { example, forwarded } = splitDevArgs(rawArgs);
  if (example) assertExample(example, { serveable: true });

  // In app-mode (generated project, no example argument) we also go through
  // server/serve.mjs to get config support (--host, --port, mado.config.json
  // dev.proxy, HMR, etc.) — previously this fell back to serveStaticProject()
  // which only read PORT from env and had no proxy/config/HMR.
  await run(
    process.execPath,
    [join(PACKAGE_ROOT, "server/serve.mjs"), example, ...forwarded].filter(
      Boolean,
    ),
    {
      env: { ...process.env, EXAMPLE: example || process.env.EXAMPLE || "" },
    },
  );
}

async function runInit(rawArgs) {
  const { flags, positional } = parseFlags(rawArgs);
  const targetArg = positional[0];
  if (!targetArg) {
    console.error("[mado] usage: mado init <name> [--starter minimal|crud] [--force]");
    process.exit(1);
  }

  const starter = String(flags.starter ?? "minimal");
  if (!STARTERS.includes(starter)) {
    console.error(`[mado] unknown starter: ${starter}`);
    console.error(`[mado] available starters: ${STARTERS.join(", ")}`);
    process.exit(1);
  }

  const target = resolve(PROJECT_ROOT, targetArg);
  const source = join(PACKAGE_ROOT, "starters", starter);
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
  await copyCanonicalAgentFiles(target);
  await ensureStarterGitignore(target);
  await ensureStarterPackageJson(target);

  const packageName = packageNameFromDir(target);
  if (!isValidPackageName(packageName)) {
    console.error(`[mado] invalid package name derived from target: ${packageName}`);
    process.exit(1);
  }

  const replacements = {
    __APP_NAME__: packageName,
    __PACKAGE_NAME__: packageName,
    __MADOJS_VERSION__: process.env.MADO_PACKAGE_SPEC || process.env.MADOJS_PACKAGE_SPEC || `^${PACKAGE_JSON.version}`,
    __MADO_VERSION__: PACKAGE_JSON.version,
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
  console.log(`  cd ${relativePath(PROJECT_ROOT, target)}`);
  console.log("  npm install");
  console.log("  npm run build");
  console.log("  npm run serve");
  console.log("");
}

async function runDev(rawArgs) {
  // Forward unknown flags (e.g. --host, --port) to server/serve.mjs so callers
  // can write `mado dev --host 127.0.0.1` without the CLI mistaking `--host`
  // for an example name.
  const { example, forwarded } = splitDevArgs(rawArgs);
  if (example) assertExample(example, { serveable: true });

  const env = { ...process.env, EXAMPLE: example || process.env.EXAMPLE || "" };
  const server = spawn(
    process.execPath,
    [join(PACKAGE_ROOT, "server/serve.mjs"), example, ...forwarded].filter(
      Boolean,
    ),
    {
      cwd: PROJECT_ROOT,
      env,
      stdio: "inherit",
    },
  );
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

async function runRelease(rawArgs) {
  // Single "ship it" command. Composes the smaller steps so the user does not
  // have to remember the order, and so the deploy artifact (out/) is always
  // assembled the same way.
  //
  //   mado release [--no-clean]
  //     → rm -rf out/        (unless --no-clean)
  //     → mado typecheck
  //     → mado build       (tsc → dist/)
  //     → mado bundle      (esbuild → out/assets/, also writes out/index.html)
  //     → mado bake        (HTML → out/baked/, using bundled out/index.html)
  //     → copy public/* → out/
  //     → promote baked HTML + sitemap into out/ route paths
  //
  // Flags are forwarded to bake/bundle.
  const { flags: releaseFlags } = parseFlags(rawArgs);
  const cfg = loadConfig({ projectRoot: PROJECT_ROOT });
  const outDir = resolve(
    cfg.projectRoot,
    typeof releaseFlags.out === "string" ? releaseFlags.out : cfg.build.out ?? "out",
  );
  const publicDir = resolve(cfg.projectRoot, cfg.build.publicDir ?? "public");
  const bundledHtml = join(outDir, "index.html");
  const bakedDir = resolve(
    cfg.projectRoot,
    cfg.bake.outDir ??
      join(
        typeof releaseFlags.out === "string" ? releaseFlags.out : cfg.build.out ?? "out",
        "baked",
      ),
  );

  console.log(`[release] context: ${cfg.context}`);
  console.log(`[release] artifact: ${outDir}`);
  console.log("");

  // Deterministic builds: remove the entire output directory so stale assets,
  // removed bake routes, and deleted public files don't linger in the deploy
  // artifact. Use --no-clean to opt out (e.g. incremental CI workflows).
  if (!releaseFlags["no-clean"]) {
    if (existsSync(outDir)) {
      await rm(outDir, { recursive: true, force: true });
      console.log(`[release] cleaned ${outDir}`);
    }
  } else {
    console.log("[release] --no-clean: keeping existing out/");
  }

  console.log("[release] step 1/5  typecheck");
  await runNodeBin("typescript/bin/tsc", ["--noEmit"]);

  console.log("[release] step 2/5  build (tsc → dist/)");
  await runNodeBin("typescript/bin/tsc", []);

  console.log("[release] step 3/5  bundle (esbuild → out/assets/)");
  await runNodeScript("scripts/bundle.mjs", rawArgs);

  console.log("[release] step 4/5  bake (out/baked/, bundled shell)");
  await runNodeScript("scripts/bake.mjs", [
    ...rawArgs,
    "--template",
    bundledHtml,
    "--out",
    bakedDir,
  ]);

  console.log("[release] step 5/5  copy public/ → out/");
  if (existsSync(publicDir)) {
    await mkdir(outDir, { recursive: true });
    await cp(publicDir, outDir, { recursive: true });
    console.log(`[release]   copied ${publicDir} → ${outDir}`);
  } else {
    console.log(`[release]   no ${publicDir}, skipping`);
  }

  const promoted = await promoteBakedHtml(bakedDir, outDir);
  if (promoted.html > 0) {
    console.log(`[release]   promoted ${promoted.html} baked HTML page(s) into out/`);
  }
  if (promoted.sitemap) {
    console.log(`[release]   copied sitemap.xml → ${join(outDir, "sitemap.xml")}`);
  }

  // Optional CDN config files. Generated only when not already provided.
  await writeIfMissing(
    join(outDir, "_redirects"),
    // Cloudflare Pages / Netlify: SPA fallback so deep links work after a
    // hard refresh. Baked HTML files are matched first because of
    // `force: false` / static-priority rules on these hosts.
    "/* /index.html 200\n",
  );
  await writeIfMissing(
    join(outDir, "_headers"),
    [
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/*.html",
      "  Cache-Control: no-cache, must-revalidate",
      "",
    ].join("\n"),
  );

  console.log("");
  console.log(`[release] done. Deploy artifact: ${outDir}`);
  console.log("[release] try:  mado preview");
}

async function writeIfMissing(path, content) {
  if (existsSync(path)) return;
  await writeFile(path, content);
  console.log(`[release]   wrote ${path}`);
}

async function promoteBakedHtml(bakedDir, outDir) {
  if (!existsSync(bakedDir)) return { html: 0, sitemap: false };

  let html = 0;

  async function walk(dir, rel = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      const source = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(source, nextRel);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
      const target = join(outDir, nextRel);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      html++;
    }
  }

  await walk(bakedDir);

  const bakedSitemap = join(bakedDir, "sitemap.xml");
  const rootSitemap = join(outDir, "sitemap.xml");
  let sitemap = false;
  if (existsSync(bakedSitemap)) {
    await copyFile(bakedSitemap, rootSitemap);
    sitemap = true;
  }

  return { html, sitemap };
}

async function copyCanonicalAgentFiles(target) {
  for (const file of ["AGENTS.md", "llms.txt"]) {
    const source = join(PACKAGE_ROOT, file);
    if (existsSync(source)) await copyFile(source, join(target, file));
  }
}

async function ensureStarterGitignore(target) {
  const file = join(target, ".gitignore");
  if (existsSync(file)) return;
  await writeFile(file, "node_modules\ndist\nout\n.DS_Store\n*.log\n");
}

async function ensureStarterPackageJson(target) {
  const file = join(target, "package.json");
  if (!existsSync(file)) return;

  const pkg = JSON.parse(await readFile(file, "utf8"));
  const rootDev = PACKAGE_JSON.devDependencies ?? {};
  pkg.devDependencies = {
    ...(pkg.devDependencies ?? {}),
    typescript: rootDev.typescript ?? "^6.0.3",
    esbuild: rootDev.esbuild ?? "^0.28.0",
    linkedom: rootDev.linkedom ?? "^0.18.12",
  };

  await writeFile(file, `${JSON.stringify(pkg, null, 2)}\n`);
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
  const ctx = IS_REPO ? "repo-mode (framework repository)" : "app-mode";
  console.log(`mado commands (${ctx}):

  Project lifecycle:
    mado init <name> [--starter minimal|crud|admin] [--force]
                           scaffold a new app
    mado dev               tsc -w + dev server with HMR
    mado build             tsc (writes dist/)
    mado typecheck         tsc --noEmit
    mado test [browser]    run unit tests (or browser regression)

  Production:
    mado bundle            esbuild → out/assets/   (hashed bundles)
    mado bake [--entry <file>] [--template <html>] [--out <dir>] [--base-url <url>]
                           prerender baked routes  → out/baked/
    mado release           typecheck + build + bundle + bake + copy public/ → out/
                           ← the one command for "ship it"
    mado preview           serve exactly out/ locally (production rehearsal)
    mado serve [example]   simple static server (also runs in repo-mode for examples)

  Generators:
    mado new <list|form|detail> <name>

  Misc:
    mado examples          list bundled examples
    mado help              this screen

  Configuration:
    mado reads ./mado.config.json (dev.proxy, build.out, bake.entry/template/baseUrl, …)
    CLI flags > mado.config.json > built-in defaults.

  See MADO_V1_PLAN.md for the road to v1.`);
}

function parseFlags(raw) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--") continue;
    if (arg.startsWith("--")) {
      const [name, inline] = arg.slice(2).split("=");
      if (inline !== undefined) flags[name] = inline;
      else if (raw[i + 1] && !raw[i + 1].startsWith("-")) flags[name] = raw[++i];
      else flags[name] = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

/**
 * Split args for `mado dev` / `mado serve` into:
 *   - example: the first non-flag positional (or undefined)
 *   - forwarded: every remaining token (flags, their values, leftover
 *     positionals), preserved in order so server/serve.mjs sees them
 *     unchanged.
 *
 * This is what lets `mado dev -- --host 127.0.0.1` and
 * `mado dev showcase --port 6000` both work without the CLI confusing
 * `--host` for an example name.
 */
function splitDevArgs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { example: "", forwarded: [] };
  }
  let example = "";
  const forwarded = [];
  let pickedExample = false;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "--") {
      forwarded.push(...raw.slice(i + 1));
      break;
    }
    if (a.startsWith("-")) {
      forwarded.push(a);
      // Lookahead: if the next token is the flag's VALUE (does not start with
      // "-"), forward it too — but only when the flag is in inline form
      // (--flag value), not --flag=value.
      if (!a.includes("=") && raw[i + 1] !== undefined && !raw[i + 1].startsWith("-")) {
        forwarded.push(raw[++i]);
      }
      continue;
    }
    if (!pickedExample) {
      example = a;
      pickedExample = true;
    } else {
      forwarded.push(a);
    }
  }
  return { example, forwarded };
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

function contentType(file) {
  const ext = file.slice(file.lastIndexOf("."));
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  }[ext] ?? "application/octet-stream";
}

// serveStaticProject removed in v0.7 — mado serve now always goes through
// server/serve.mjs to get --host, --port, dev.proxy, and HMR support.
