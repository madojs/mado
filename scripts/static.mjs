#!/usr/bin/env node

import { resolve } from "node:path";
import { writeSync } from "node:fs";

import { parseFlags } from "./_config.mjs";
import { discoverStaticRoutes } from "./static/discover.mjs";
import { createStaticCaptureServer } from "./static/server.mjs";
import { captureStaticRoutes } from "./static/browser.mjs";
import {
  cleanupTemp,
  prepareStaticOutput,
  promoteCapturedRoutes,
  writeCapturedRoutes,
  writeStaticDeploymentFiles,
} from "./static/output.mjs";

const { flags } = parseFlags(process.argv.slice(2));
const projectRoot = resolve(process.cwd());
const outDir = resolve(
  projectRoot,
  typeof flags.out === "string" ? flags.out : "out",
);
const baseUrl =
  typeof flags["base-url"] === "string"
    ? flags["base-url"]
    : "https://example.com";
const timeout = Number(flags.timeout ?? 30_000);

try {
  console.log(`[static] artifact: ${outDir}`);

  const { shellHtml, tempRoot, routesDir } = await prepareStaticOutput(outDir);
  const { records } = await discoverStaticRoutes({
    projectRoot,
    entry: typeof flags.entry === "string" ? flags.entry : undefined,
  });

  console.log(`[static] discovered ${records.length} static route(s)`);

  if (records.length > 0) {
    const server = await createStaticCaptureServer({ outDir, shellHtml, records });
    try {
      const captured = await captureStaticRoutes({
        records,
        serverOrigin: server.origin,
        baseUrl,
        timeout,
        browserChannel:
          typeof flags["browser-channel"] === "string"
            ? flags["browser-channel"]
            : undefined,
        browserPath:
          typeof flags["browser-path"] === "string"
            ? flags["browser-path"]
            : undefined,
      });
      await writeCapturedRoutes(routesDir, captured);
      await promoteCapturedRoutes({ outDir, routesDir, captured });
      console.log(`[static] captured ${captured.length} route snapshot(s)`);
    } finally {
      await server.close();
    }
  }

  await writeStaticDeploymentFiles({ outDir, records, baseUrl });
  await cleanupTemp(tempRoot);
  console.log(`[static] done`);
} catch (err) {
  writeSync(2, `${err?.stack ?? err}\n`);
  process.exit(1);
}
