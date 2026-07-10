#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseFlags } from "./_config.mjs";
import { configureLogger, logger } from "./logger.mjs";
import { claimOutputDirectory, validateOutputDirectory } from "./output-guard.mjs";
import { discoverStaticRoutes } from "./static/discover.mjs";
import { createStaticCaptureServer } from "./static/server.mjs";
import { captureStaticRoutes } from "./static/browser.mjs";
import {
  cleanupTemp,
  dropBuildBridge,
  prepareStaticOutput,
  promoteCapturedRoutes,
  promoteSpaShell,
  writeCapturedRoutes,
  writeStaticDeploymentFiles,
} from "./static/output.mjs";

const { flags } = parseFlags(configureLogger(process.argv.slice(2)));
const projectRoot = resolve(process.cwd());
const outDir = resolve(
  projectRoot,
  typeof flags.out === "string" ? flags.out : "out",
);
const timeout = Number(flags.timeout ?? 30_000);

let tempRootForCleanup = null;
try {
  await validateOutputDirectory({
    projectRoot,
    outDir,
    force: flags["force-output"] === true,
  });
  logger.info("static", "artifact", `artifact: ${outDir}`);

  // Source the public origin and Vite base from (in order):
  //   --base-url, --base / MADO_SITE env, _mado/build.json (the bridge
  //   emitted by the @madojs/mado/vite plugin). Static routes REQUIRE
  //   a non-localhost public origin; we never invent one.
  const buildMeta = readBuildMeta(outDir);
  const site = pickSite({ flags, buildMeta });
  const base = pickBase({ flags, buildMeta });
  validateSite(site, "site");

  // Ordering matters: discover and validate the manifest BEFORE we
  // touch the deployed artefact. A manifest that throws (missing
  // params, duplicate URL, ...) used to leave a half-prepared
  // staging directory behind because we provisioned the temp tree
  // before discovery; now the temp tree is created only after we know
  // the inputs are sound.
  const { records } = await discoverStaticRoutes({
    projectRoot,
    entry: typeof flags.entry === "string" ? flags.entry : undefined,
  });

  logger.info("static", "discover", `discovered ${records.length} static route(s)`);

  await claimOutputDirectory({
    projectRoot,
    outDir,
    force: flags["force-output"] === true,
  });

  if (records.length > 0 && !site) {
    throw new Error(
      "[mado:static] missing public origin for static routes.\n" +
        "Provide one of:\n" +
        "  mado static --base-url https://your.site\n" +
        "  MADO_SITE=https://your.site mado static\n" +
        "  mado({ site: \"https://your.site\" }) in vite.config.ts",
    );
  }

  const { shellHtml, tempRoot, routesDir, stagedSpaPath } =
    await prepareStaticOutput(outDir);
  tempRootForCleanup = tempRoot;

  const publicOrigin = site ?? "";
  const baseUrl = publicOrigin
    ? joinSite(publicOrigin, base)
    : "/";

  if (records.length > 0) {
    const server = await createStaticCaptureServer({
      outDir,
      shellHtml,
      records,
      base,
    });
    try {
      const captured = await captureStaticRoutes({
        records,
        serverOrigin: server.origin,
        baseUrl,
        base,
        site: publicOrigin,
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
      // First write everything to the temp staging tree, only then
      // promote into `out/`. A capture failure aborts before any of the
      // existing deployment files are touched.
      await writeCapturedRoutes(routesDir, captured);
      await promoteCapturedRoutes({ outDir, routesDir, captured });
      logger.info("static", "capture", `captured ${captured.length} route snapshot(s)`);
    } finally {
      await server.close();
    }
  }

  // SPA shell is promoted only after every route survived capture and
  // promotion. On a re-run with broken pages this guarantees that the
  // previous (working) `_mado/spa.html` is preserved.
  await promoteSpaShell({ outDir, stagedSpaPath });

  await writeStaticDeploymentFiles({
    outDir,
    records,
    baseUrl,
    site: publicOrigin,
    base,
  });

  // Drop the internal build bridge so the production artifact does not
  // ship Vite's resolved view of the project (site, base, assetsDir).
  await dropBuildBridge(outDir);
  logger.info("static", "done", "done");
} catch (err) {
  // Defer the actual termination: `process.exit()` is synchronous and
  // would race the awaited cleanup in the `finally` block, leaving the
  // OS to garbage-collect a half-promoted staging directory. Setting
  // `exitCode` lets Node finish the microtask queue (including the
  // cleanup below) and then exit with the failure status.
  logger.error("static", "failed", err instanceof Error ? err.message : String(err), err);
  process.exitCode = 1;
} finally {
  if (tempRootForCleanup) {
    try {
      await cleanupTemp(tempRootForCleanup);
    } catch {
      /* best effort */
    }
  }
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
