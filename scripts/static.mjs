#!/usr/bin/env node

import { existsSync, readFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";

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
const timeout = Number(flags.timeout ?? 30_000);

try {
  console.log(`[static] artifact: ${outDir}`);

  // Source the public origin and Vite base from (in order):
  //   --base-url, --base / MADO_SITE env, _mado/build.json (the bridge
  //   emitted by the @madojs/mado/vite plugin). Static routes REQUIRE
  //   a non-localhost public origin; we never invent one.
  const buildMeta = readBuildMeta(outDir);
  const site = pickSite({ flags, buildMeta });
  const base = pickBase({ flags, buildMeta });
  validateSite(site, "site");

  const { shellHtml, tempRoot, routesDir } = await prepareStaticOutput(outDir);
  const { records } = await discoverStaticRoutes({
    projectRoot,
    entry: typeof flags.entry === "string" ? flags.entry : undefined,
  });

  console.log(`[static] discovered ${records.length} static route(s)`);

  if (records.length > 0 && !site) {
    throw new Error(
      "[mado:static] missing public origin for static routes.\n" +
        "Provide one of:\n" +
        "  mado static --base-url https://your.site\n" +
        "  MADO_SITE=https://your.site mado static\n" +
        "  mado({ site: \"https://your.site\" }) in vite.config.ts",
    );
  }

  const publicOrigin = site ?? "";
  const baseUrl = publicOrigin
    ? joinSite(publicOrigin, base)
    : "/";

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

  await writeStaticDeploymentFiles({
    outDir,
    records,
    baseUrl,
    site: publicOrigin,
    base,
  });
  await cleanupTemp(tempRoot);
  console.log(`[static] done`);
} catch (err) {
  writeSync(2, `${err?.stack ?? err}\n`);
  process.exit(1);
}

function readBuildMeta(outDir) {
  const file = join(outDir, "_mado/build.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function pickSite({ flags, buildMeta }) {
  const fromFlag = flags["base-url"] ?? flags.site;
  if (typeof fromFlag === "string" && fromFlag.length > 0) return fromFlag;
  if (typeof process.env.MADO_SITE === "string" && process.env.MADO_SITE.length > 0) {
    return process.env.MADO_SITE;
  }
  if (buildMeta?.site) return buildMeta.site;
  return null;
}

function pickBase({ flags, buildMeta }) {
  const fromFlag = flags.base;
  if (typeof fromFlag === "string" && fromFlag.length > 0) return fromFlag;
  if (buildMeta?.base) return buildMeta.base;
  return "/";
}

function validateSite(site, label) {
  if (!site) return;
  let u;
  try {
    u = new URL(site);
  } catch {
    throw new Error(`[mado:static] ${label} is not a valid URL: ${site}`);
  }
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1") {
    throw new Error(
      `[mado:static] ${label} cannot point at localhost (${site}). ` +
        "Set the public origin via --base-url or mado({ site }) in vite.config.ts.",
    );
  }
}

function joinSite(site, base) {
  const left = site.replace(/\/+$/, "");
  const right = (base ?? "/").startsWith("/") ? base : `/${base ?? "/"}`;
  const merged = `${left}${right}`;
  return merged.endsWith("/") ? merged.slice(0, -1) : merged;
}
