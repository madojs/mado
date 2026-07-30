import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConst, gzipSync } from "node:zlib";

import { parseFlags } from "../_config.mjs";
import { logger } from "../logger.mjs";
import { prepareOutputDirectory } from "../output-guard.mjs";
import { runNodeBin, runNodeScript, runVite, writeIfMissing } from "./run.mjs";

export async function runRelease(ctx, rawArgs) {
  const { flags: releaseFlags } = parseFlags(rawArgs);
  const outDir = resolve(
    ctx.projectRoot,
    typeof releaseFlags.out === "string" ? releaseFlags.out : "out",
  );

  logger.info("release", "context", `context: ${ctx.context}`);
  logger.info("release", "artifact", `artifact: ${outDir}`);

  await prepareOutputDirectory({
    projectRoot: ctx.projectRoot,
    outDir,
    clean: !releaseFlags["no-clean"],
    force: releaseFlags["force-output"] === true,
  });
  if (releaseFlags["no-clean"]) {
    // `--no-clean` may preserve Vite assets for an internal debugging loop,
    // but deployment policy must always be derived from the current sources.
    // Otherwise a stale captured/public 404 or framework-generated redirect
    // can silently invert the next release's host behavior.
    await resetReleasePolicy(outDir);
    logger.info(
      "release",
      "clean-skip",
      "--no-clean: keeping existing assets; refreshing host policy",
    );
  } else {
    logger.info("release", "clean", `prepared ${outDir}`);
  }

  logger.info("release", "step", "step 1/5  typecheck");
  await runNodeBin(ctx, "typescript/bin/tsc", ["--noEmit"]);

  logger.info("release", "step", "step 2/5  vite build");
  await runVite(ctx, ["build", "--outDir", outDir], { defaultConfig: true });

  logger.info("release", "step", "step 3/5  static snapshots");
  const preserveBuiltNotFound = existsSync(join(outDir, "404.html"));
  await runNodeScript(ctx, "scripts/static.mjs", [
    ...rawArgs.filter((a) => a !== "--no-clean"),
    ...(preserveBuiltNotFound ? ["--preserve-public-404"] : []),
    "--out",
    outDir,
  ]);

  logger.info("release", "step", "step 4/5  deployment files");
  // GitHub Pages / Netlify / Cloudflare Pages fallback. A wildcard page with
  // `static: true` is already captured into 404.html by `mado static`.
  // Otherwise preserve the historical noindex SPA-shell fallback. An
  // explicit host fallback (captured or public/404.html) disables Mado's
  // automatic catch-all rewrite; a user-authored _redirects still wins and
  // may opt a hybrid application back into host-specific SPA rewrites.
  const spaShell = join(outDir, "_mado/spa.html");
  const notFoundPage = join(outDir, "404.html");
  const hasHostNotFound = existsSync(notFoundPage);
  if (existsSync(spaShell)) {
    await writeIfMissing(notFoundPage, await readFile(spaShell, "utf8"), "[release]  ");
  }
  if (!hasHostNotFound) {
    await writeIfMissing(join(outDir, "_redirects"), "/* /_mado/spa.html 200\n", "[release]  ");
  }
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

async function resetReleasePolicy(outDir) {
  await Promise.all(
    [
      "404.html",
      "404.html.gz",
      "404.html.br",
      "_redirects",
    ].map((file) => rm(join(outDir, file), { force: true })),
  );
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
