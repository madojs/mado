// Optional production bundle through esbuild. No config files.
//
// Usage:
//   node scripts/bundle.mjs              # → out/<hash>.js + chunks + out/index.html
//   ENTRY=examples/main.ts node scripts/bundle.mjs
//
// What it does:
//   1. Bundles entry with code splitting (each dynamic import → a chunk).
//   2. Writes out/ index.html with modulepreload for critical chunks.
//   3. Computes SRI hashes and writes integrity="...".
//   4. Creates .gz and .br next to each .js for nginx gzip_static.
//
// Dependency: esbuild (devDep, only needed when running bundle).

import { build } from "esbuild";
import {
  readFile,
  writeFile,
  mkdir,
  cp,
  stat,
  readdir,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";

const ENTRY = process.env.ENTRY ?? "examples/main.ts";
const OUT_DIR = process.env.OUT_DIR ?? "out";
const HTML = process.env.HTML ?? "examples/index.html";

await mkdir(OUT_DIR, { recursive: true });

console.log(`[bundle] entry: ${ENTRY}`);

// 1) esbuild with code splitting
const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "esm",
  target: "es2022",
  splitting: true,
  outdir: OUT_DIR,
  entryNames: "main-[hash]",
  chunkNames: "chunk-[hash]",
  assetNames: "asset-[hash]",
  metafile: true,
  legalComments: "none",
});

// 2) Find the main entry file
const entryFile = Object.entries(result.metafile.outputs)
  .find(([name, info]) => info.entryPoint && name.endsWith(".js"))?.[0];

if (!entryFile) {
  console.error("[bundle] entry not found in outputs");
  process.exit(1);
}
const mainBundle = basename(entryFile);

// 3) Collect all js chunks (including main)
const allJs = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".js"));

// 4) Compress every .js into .gz and .br (for nginx gzip_static)
let totalRaw = 0;
let totalGz = 0;
let totalBr = 0;

for (const f of allJs) {
  const p = join(OUT_DIR, f);
  const buf = await readFile(p);
  totalRaw += buf.length;

  const gz = gzipSync(buf, { level: 9 });
  await writeFile(`${p}.gz`, gz);
  totalGz += gz.length;

  const br = brotliCompressSync(buf, {
    params: { [zlibConst.BROTLI_PARAM_QUALITY]: 11 },
  });
  await writeFile(`${p}.br`, br);
  totalBr += br.length;
}

// 5) SRI for the main bundle
const mainBuf = await readFile(join(OUT_DIR, mainBundle));
const sri = "sha384-" + createHash("sha384").update(mainBuf).digest("base64");

// 6) HTML: replace <script> and add modulepreload for main
let html = await readFile(HTML, "utf8");

// modulepreload for main + other chunks. For now preload all chunks; this can
// later be filtered from metafile analysis.
const preloads = allJs
  .map(
    (f) =>
      `    <link rel="modulepreload" href="/${f}"${
        f === mainBundle ? ` integrity="${sri}" crossorigin="anonymous"` : ""
      } />`,
  )
  .join("\n");

// Remove the old importmap (it points to dev paths under /dist/src/...).
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, "");

// Replace the script with the new one.
html = html.replace(
  /<script\s+type="module"\s+src="[^"]+"[^>]*><\/script>/,
  `<script type="module" src="/${mainBundle}" integrity="${sri}" crossorigin="anonymous"></script>`,
);

// Insert preloads before </head>.
html = html.replace(
  /<\/head>/,
  `${preloads}\n  </head>`,
);

await writeFile(join(OUT_DIR, "index.html"), html);

// 7) Static files
for (const name of ["favicon.ico", "favicon.svg", "assets"]) {
  const src = join("examples", name);
  if (existsSync(src)) {
    const s = await stat(src);
    if (s.isDirectory()) {
      await cp(src, join(OUT_DIR, name), { recursive: true });
    } else {
      await cp(src, join(OUT_DIR, name));
    }
  }
}

// 8) Stats
const kib = (n) => (n / 1024).toFixed(1);
console.log(`[bundle] chunks: ${allJs.length}`);
for (const f of allJs.sort()) {
  const sz = (await stat(join(OUT_DIR, f))).size;
  const gz = (await stat(join(OUT_DIR, `${f}.gz`))).size;
  const star = f === mainBundle ? " *" : "";
  console.log(`  ${f.padEnd(24)} ${kib(sz).padStart(6)} KB raw, ${kib(gz).padStart(5)} KB gz${star}`);
}
console.log(`[bundle] total: ${kib(totalRaw)} KB raw / ${kib(totalGz)} KB gz / ${kib(totalBr)} KB br`);
console.log(`[bundle] entry SRI: ${sri}`);
