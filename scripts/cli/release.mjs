import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConst, gzipSync } from "node:zlib";

import { parseFlags } from "../_config.mjs";
import { runNodeBin, runNodeScript, runVite, writeIfMissing } from "./run.mjs";

export async function runRelease(ctx, rawArgs) {
  const { flags: releaseFlags } = parseFlags(rawArgs);
  const outDir = resolve(
    ctx.projectRoot,
    typeof releaseFlags.out === "string" ? releaseFlags.out : "out",
  );

  console.log(`[release] context: ${ctx.context}`);
  console.log(`[release] artifact: ${outDir}`);
  console.log("");

  if (!releaseFlags["no-clean"]) {
    if (existsSync(outDir)) {
      await rm(outDir, { recursive: true, force: true });
      console.log(`[release] cleaned ${outDir}`);
    }
  } else {
    console.log("[release] --no-clean: keeping existing out/");
  }

  console.log("[release] step 1/5  typecheck");
  await runNodeBin(ctx, "typescript/bin/tsc", ["--noEmit"]);

  console.log("[release] step 2/5  vite build");
  await runVite(ctx, ["build", "--outDir", outDir], { defaultConfig: true });

  console.log("[release] step 3/5  static snapshots");
  await runNodeScript(ctx, "scripts/static.mjs", [
    ...rawArgs.filter((a) => a !== "--no-clean"),
    "--out",
    outDir,
  ]);

  console.log("[release] step 4/5  precompress assets");
  await precompressOut(outDir);

  console.log("[release] step 5/5  CDN config");
  await writeIfMissing(join(outDir, "_redirects"), "/* /_mado/spa.html 200\n", "[release]  ");
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
    "[release]  ",
  );

  console.log("");
  console.log(`[release] done. Deploy artifact: ${outDir}`);
  console.log("[release] try:  mado preview");
}

async function precompressOut(outDir) {
  if (!existsSync(outDir)) return;
  const files = await listCompressibleFiles(outDir);
  let count = 0;
  for (const file of files) {
    const buf = await readFile(file);
    await writeFile(`${file}.gz`, gzipSync(buf, { level: 9 }));
    await writeFile(
      `${file}.br`,
      brotliCompressSync(buf, {
        params: { [zlibConst.BROTLI_PARAM_QUALITY]: 11 },
      }),
    );
    count++;
  }
  console.log(`[release]   compressed ${count} file(s)`);
}

async function listCompressibleFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listCompressibleFiles(file));
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(js|css|html|json|svg)$/.test(entry.name) && !/\.(gz|br)$/.test(entry.name)) {
      out.push(file);
    }
  }
  return out;
}
