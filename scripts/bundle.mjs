// Production bundle through esbuild. No build config files.
//
// Usage:
//   mado bundle
//   mado bundle --entry src/main.ts --html index.html --out out
//
// Configuration precedence: built-in defaults < mado.config.json < CLI flags
// < legacy env vars (ENTRY, HTML, OUT_DIR).
//
// What it does:
//   1. Bundles `entry` with code splitting (each dynamic import → chunk),
//      writing hashed `main-<hash>.js` and `chunk-<hash>.js` into <out>/assets/.
//   2. Computes SRI for the entry bundle.
//   3. Rewrites `html` so its <script type=module> points at the hashed entry,
//      removes the dev importmap, and adds <link rel=modulepreload> for the
//      entry and all chunks. Writes the result to <out>/index.html.
//   4. Pre-compresses every .js into .gz and .br for nginx_gzip_static and
//      Cloudflare/Netlify Accept-Encoding.
//   5. Copies optional `favicon.ico`/`favicon.svg`/`assets/` from the project
//      root if they exist (kept for backwards compatibility; new apps should
//      put public assets in `public/` so `mado release` copies them).
//
// In repo-mode (the framework repo itself) the defaults still point at
// examples/showcase so the framework can dogfood its bundle pipeline against
// its biggest example.

import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp, stat, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";
import { join, basename, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";

import { loadConfig, parseFlags, resolveProjectPath } from "./_config.mjs";

const { flags } = parseFlags(process.argv.slice(2));
const cfg = loadConfig({});

// Defaults are context-aware: in repo-mode they continue to bundle the
// showcase example; in app-mode they assume the canonical layout.
const defaultEntry = cfg.context === "repo"
  ? "examples/showcase/main.ts"
  : "src/main.ts";
const defaultHtml = cfg.context === "repo"
  ? "examples/showcase/index.html"
  : "index.html";

const ENTRY = resolveProjectPath(
  cfg,
  typeof flags.entry === "string" ? flags.entry : process.env.ENTRY ?? defaultEntry,
);
const HTML = resolveProjectPath(
  cfg,
  typeof flags.html === "string" ? flags.html : process.env.HTML ?? defaultHtml,
);
const OUT_DIR = resolveProjectPath(
  cfg,
  typeof flags.out === "string" ? flags.out : process.env.OUT_DIR ?? cfg.build.out ?? "out",
);
// Where the hashed bundles land. Apps want them under /assets/* to match
// nginx.conf and _headers; in repo-mode we keep the historical out/main-*.js
// layout so existing showcase pages continue to work.
const ASSETS_REL = cfg.context === "repo" ? "" : "assets";
const ASSETS_DIR = ASSETS_REL ? join(OUT_DIR, ASSETS_REL) : OUT_DIR;

if (!existsSync(ENTRY)) {
  console.error(`[bundle] entry not found: ${ENTRY}`);
  console.error("[bundle] set bundle entry in mado.config.json or pass --entry <file>");
  process.exit(1);
}
if (!existsSync(HTML)) {
  console.error(`[bundle] html template not found: ${HTML}`);
  console.error("[bundle] pass --html <file> or place index.html at the project root");
  process.exit(1);
}

await mkdir(ASSETS_DIR, { recursive: true });

console.log(`[bundle] entry:    ${ENTRY}`);
console.log(`[bundle] html:     ${HTML}`);
console.log(`[bundle] out:      ${OUT_DIR}`);
if (ASSETS_REL) console.log(`[bundle] assets:   ${ASSETS_DIR}`);

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "esm",
  target: "es2022",
  splitting: true,
  outdir: ASSETS_DIR,
  entryNames: "main-[hash]",
  chunkNames: "chunk-[hash]",
  assetNames: "asset-[hash]",
  metafile: true,
  legalComments: "none",
});

const entryOutput = Object.entries(result.metafile.outputs).find(
  ([name, info]) => info.entryPoint && name.endsWith(".js"),
);
if (!entryOutput) {
  console.error("[bundle] entry not found in outputs");
  process.exit(1);
}
const mainBundle = basename(entryOutput[0]);

// Collect all js chunks in the assets dir.
const allJs = (await readdir(ASSETS_DIR)).filter((f) => f.endsWith(".js"));

// Pre-compress every .js into .gz and .br.
let totalRaw = 0;
let totalGz = 0;
let totalBr = 0;
for (const f of allJs) {
  const p = join(ASSETS_DIR, f);
  const buf = await readFile(p);
  totalRaw += buf.length;
  const gz = gzipSync(buf, { level: 9 });
  await writeFile(`${p}.gz`, gz);
  totalGz += gz.length;
  const br = brotliCompressSync(buf, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 11 } });
  await writeFile(`${p}.br`, br);
  totalBr += br.length;
}

// SRI for the main bundle.
const mainBuf = await readFile(join(ASSETS_DIR, mainBundle));
const sri = "sha384-" + createHash("sha384").update(mainBuf).digest("base64");

// Rewrite HTML: drop dev importmap, swap the <script src>, add preloads.
const urlPrefix = ASSETS_REL ? `/${ASSETS_REL}/` : "/";
let html = await readFile(HTML, "utf8");

html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, "");

const preloads = allJs
  .map(
    (f) =>
      `    <link rel="modulepreload" href="${urlPrefix}${f}"${
        f === mainBundle ? ` integrity="${sri}" crossorigin="anonymous"` : ""
      } />`,
  )
  .join("\n");

const scriptTag = `<script type="module" src="${urlPrefix}${mainBundle}" integrity="${sri}" crossorigin="anonymous"></script>`;
if (/<script\s+type="module"\s+src="[^"]+"[^>]*><\/script>/.test(html)) {
  html = html.replace(
    /<script\s+type="module"\s+src="[^"]+"[^>]*><\/script>/,
    scriptTag,
  );
} else {
  // No matching dev <script> in the template: inject one before </body>.
  html = html.replace(/<\/body>/i, `  ${scriptTag}\n  </body>`);
}

html = html.replace(/<\/head>/, `${preloads}\n  </head>`);

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "index.html"), html);

// Backwards-compatible asset copy (repo-mode only). In app-mode the
// `mado release` command copies the entire `public/` tree, which is the
// recommended path for new apps.
if (cfg.context === "repo") {
  for (const name of ["favicon.ico", "favicon.svg", "assets"]) {
    const src = join(cfg.projectRoot, "examples", name);
    if (!existsSync(src)) continue;
    const s = await stat(src);
    if (s.isDirectory()) {
      await cp(src, join(OUT_DIR, name), { recursive: true });
    } else {
      await cp(src, join(OUT_DIR, name));
    }
  }
}

// Stats
const kib = (n) => (n / 1024).toFixed(1);
console.log(`[bundle] chunks: ${allJs.length}`);
for (const f of allJs.sort()) {
  const sz = (await stat(join(ASSETS_DIR, f))).size;
  const gz = (await stat(join(ASSETS_DIR, `${f}.gz`))).size;
  const star = f === mainBundle ? " *" : "";
  console.log(`  ${f.padEnd(24)} ${kib(sz).padStart(6)} KB raw, ${kib(gz).padStart(5)} KB gz${star}`);
}
console.log(`[bundle] total: ${kib(totalRaw)} KB raw / ${kib(totalGz)} KB gz / ${kib(totalBr)} KB br`);
console.log(`[bundle] entry SRI: ${sri}`);