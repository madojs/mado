#!/usr/bin/env node

import { build } from "esbuild";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const API_ENTRY = "src/index.ts";
const SAMPLE_ENTRY = "starters/default/src/main.ts";
const DEVTOOLS_ENTRY = "src/devtools.ts";

const api = await bundlePublicApi();
report("public API", api.gzip);

const sample = await bundleSampleApp();
report("starter app", sample.gzip);

const devtools = await bundleEntry(DEVTOOLS_ENTRY);
report("devtools", devtools.gzip);

async function bundlePublicApi() {
  return bundleEntry(API_ENTRY, false);
}

async function bundleEntry(entryPoint, devtools = true) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    legalComments: "none",
    write: false,
    define: { __MADO_DEVTOOLS__: devtools ? "true" : "false" },
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
      define: { __MADO_DEVTOOLS__: "false" },
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

function report(label, actual) {
  console.log(`[size] ${label.padEnd(12)} ${kib(actual)} KiB gzip`);
}

function kib(bytes) {
  return (bytes / 1024).toFixed(2);
}
