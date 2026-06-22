import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { addNoIndex, escapeXml } from "./serialize.mjs";

/**
 * Stage a deterministic temp output for the snapshot pipeline.
 *
 *   out/index.html           ← Vite-built SPA shell, consumed as capture seed
 *   <os-temp>/spa.html       ← noindexed copy, staged before promotion
 *   <os-temp>/routes/...     ← per-route captured HTML, also staged
 *
 * Nothing inside `out/` is mutated until all routes capture cleanly. A
 * mid-pipeline crash leaves the existing deployment untouched; only a
 * verified, complete capture is promoted by `promoteCapturedRoutes()`
 * and `promoteSpaShell()`.
 */
export async function prepareStaticOutput(outDir) {
  const shellPath = join(outDir, "index.html");
  if (!existsSync(shellPath)) {
    throw new Error(
      `[mado:static] missing ${shellPath}. Run \`mado build\` or Vite build before \`mado static\`.`,
    );
  }

  const shellHtml = await readFile(shellPath, "utf8");

  // External temp directory — never leaks into `out/` on failure.
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const tempRoot = await mkdtemp(join(tmpdir(), "mado-static-"));
  const routesDir = join(tempRoot, "routes");
  await mkdir(routesDir, { recursive: true });

  // Stage the SPA fallback in temp; promote later, only after all
  // captures verified. Until then `out/_mado/spa.html` either does not
  // exist (cold release) or holds the previous release's copy (re-run).
  const stagedSpaPath = join(tempRoot, "spa.html");
  await writeFile(stagedSpaPath, addNoIndex(shellHtml));

  return { shellHtml, tempRoot, routesDir, stagedSpaPath };
}

export async function writeCapturedRoutes(routesDir, captured) {
  for (const record of captured) {
    const file = safeRouteFile(routesDir, record.pathname);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, record.html);
  }
}

export async function promoteCapturedRoutes({ outDir, routesDir, captured }) {
  for (const record of captured) {
    const source = safeRouteFile(routesDir, record.pathname);
    const target = safeRouteFile(outDir, record.pathname);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

/**
 * Promote the staged SPA fallback shell into `out/_mado/spa.html` after
 * all routes captured successfully. Called once at the end of the
 * pipeline; any crash before this point leaves the previous shell (or
 * no shell at all) in place.
 */
export async function promoteSpaShell({ outDir, stagedSpaPath }) {
  const target = join(outDir, "_mado", "spa.html");
  await mkdir(dirname(target), { recursive: true });
  await copyFile(stagedSpaPath, target);
}

/**
 * Drop the build-time bridge `out/_mado/build.json` from the final
 * deployment artifact. It is internal CLI plumbing (the
 * `@madojs/mado/vite` plugin emits it so `mado static` can read the
 * resolved Vite base/site without parsing `vite.config.ts`); leaving it
 * in `out/` would leak the build pipeline's view of the project to
 * production traffic.
 */
export async function dropBuildBridge(outDir) {
  await rm(join(outDir, "_mado", "build.json"), { force: true });
}

/**
 * Files owned by `mado static`: the sitemap (derived from discovered
 * static routes) and the SPA fallback shell.
 *
 * Files owned by `mado release` (so it can decide writeIfMissing
 * semantics for user-customised deployments): 404.html, _headers,
 * _redirects, and asset precompression.
 */
export async function writeStaticDeploymentFiles({ outDir, records, site, base }) {
  await writeFile(join(outDir, "sitemap.xml"), sitemap(records, site, base));
}

export async function cleanupTemp(tempRoot) {
  await rm(tempRoot, { recursive: true, force: true });
}

/**
 * Map a route pathname to an `index.html` file inside `root`, refusing
 * any path that would traverse outside the deployment tree.
 */
function safeRouteFile(root, pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0") || decoded.includes("\\")) {
    throw new Error(`[mado:static] illegal pathname: ${pathname}`);
  }
  const cleaned = decoded === "/" ? "" : decoded.replace(/^\/+/, "").replace(/\/+$/, "");
  if (cleaned.split("/").some((seg) => seg === "..")) {
    throw new Error(`[mado:static] pathname traversal not allowed: ${pathname}`);
  }
  const target = resolve(root, cleaned, "index.html");
  const rootAbs = resolve(root) + sep;
  if (!target.startsWith(rootAbs)) {
    throw new Error(`[mado:static] pathname escapes deployment root: ${pathname}`);
  }
  // Use forward slashes inside join so cross-platform output is stable.
  return target;
}

function sitemap(records, site, base) {
  const origin = (site ?? "").replace(/\/+$/, "");
  const prefix = ((base ?? "/") || "/").replace(/\/+$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${records
  .map((record) => {
    const pathname = record.pathname === "/" ? "" : record.pathname;
    const loc = `${origin}${prefix}${pathname}` || "/";
    return `  <url><loc>${escapeXml(loc)}</loc></url>`;
  })
  .join("\n")}
</urlset>
`;
}

// Silence the unused-import linter for the helpers we still re-export.
void relative;
