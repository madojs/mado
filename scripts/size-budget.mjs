#!/usr/bin/env node

import { build } from "esbuild";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const API_ENTRY = "src/index.ts";
const SAMPLE_ENTRY = "starters/default/src/main.ts";
// Public API budget bumped from 16 KiB → 17 KiB to accommodate the
// base-aware router/navigation pack added in 0.12.0 (`src/router/base.ts`,
// stripBase/withBase wiring in navigation, manifest and static-runtime).
// Override per-environment via MADO_SIZE_API_GZIP_LIMIT.
const API_GZIP_LIMIT = readLimit("MADO_SIZE_API_GZIP_LIMIT", 17 * 1024);
const SAMPLE_GZIP_LIMIT = readLimit("MADO_SIZE_SAMPLE_GZIP_LIMIT", 42 * 1024);

let failed = false;

const api = await bundlePublicApi();
report("public API", api.gzip, API_GZIP_LIMIT);

const sample = await bundleSampleApp();
report("starter app", sample.gzip, SAMPLE_GZIP_LIMIT);

if (failed) process.exit(1);

async function bundlePublicApi() {
  const result = await build({
    entryPoints: [API_ENTRY],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    legalComments: "none",
    write: false,
  });
  const js = result.outputFiles[0]?.contents;
  if (!js) throw new Error("[size] esbuild produced no public API output");
  return { gzip: gzipSync(js, { level: 9 }).length };
}

async function bundleSampleApp() {
  const outdir = await mkdtemp(join(tmpdir(), "mado-size-"));
  try {
    await build({
      entryPoints: [SAMPLE_ENTRY],
      bundle: true,
      minify: true,
      format: "esm",
      target: "es2022",
      platform: "browser",
      splitting: true,
      outdir,
      alias: {
        "@madojs/mado": "./src/index.ts",
      },
      legalComments: "none",
    });

    let gzip = 0;
    for (const file of await readdir(outdir)) {
      if (!file.endsWith(".js")) continue;
      const js = await readFile(join(outdir, file));
      gzip += gzipSync(js, { level: 9 }).length;
    }
    return { gzip };
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

function report(label, actual, limit) {
  const ok = actual < limit;
  const mark = ok ? "ok" : "FAIL";
  console.log(
    `[size] ${label.padEnd(12)} ${mark} ${kib(actual)} KiB gzip < ${kib(limit)} KiB`,
  );
  if (!ok) failed = true;
}

function readLimit(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`[size] ${name} must be a positive byte count`);
  }
  return n;
}

function kib(bytes) {
  return (bytes / 1024).toFixed(2);
}
