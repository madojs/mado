import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConst, gzipSync } from "node:zlib";

import { parseFlags } from "../_config.mjs";
import { logger } from "../logger.mjs";
import { runNodeBin, runNodeScript, runVite, writeIfMissing } from "./run.mjs";

export async function runRelease(ctx, rawArgs) {
  const { flags: releaseFlags } = parseFlags(rawArgs);
  const outDir = resolve(
    ctx.projectRoot,
    typeof releaseFlags.out === "string" ? releaseFlags.out : "out",
  );

  logger.info("release", "context", `context: ${ctx.context}`);
  logger.info("release", "artifact", `artifact: ${outDir}`);

  if (!releaseFlags["no-clean"]) {
    if (existsSync(outDir)) {
      await rm(outDir, { recursive: true, force: true });
      logger.info("release", "clean", `cleaned ${outDir}`);
    }
  } else {
    logger.info("release", "clean-skip", "--no-clean: keeping existing out/");
  }

  logger.info("release", "step", "step 1/5  typecheck");
  await runNodeBin(ctx, "typescript/bin/tsc", ["--noEmit"]);

  logger.info("release", "step", "step 2/5  vite build");
  await runVite(ctx, ["build", "--outDir", outDir], { defaultConfig: true });

  logger.info("release", "step", "step 3/5  static snapshots");
  await runNodeScript(ctx, "scripts/static.mjs", [
    ...rawArgs.filter((a) => a !== "--no-clean"),
    "--out",
    outDir,
  ]);

  logger.info("release", "step", "step 4/5  deployment files");
  // GitHub Pages / Netlify / Cloudflare Pages fallback. SPA fallback shell
  // is written by `mado static`; here we only register the deployment
  // bindings, and respect user-supplied files (writeIfMissing).
  const spaShell = join(outDir, "_mado/spa.html");
  if (existsSync(spaShell)) {
    await writeIfMissing(join(outDir, "404.html"), await readFile(spaShell, "utf8"), "[release]  ");
  }
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

  logger.info("release", "step", "step 5/5  precompress assets");
  await precompressOut(outDir);

  logger.info("release", "done", `done. Deploy artifact: ${outDir}`);
  logger.info("release", "next", "try: mado preview");
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
  logger.info("release", "compress", `compressed ${count} file(s)`);
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
