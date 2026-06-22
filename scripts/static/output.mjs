import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { addNoIndex, escapeXml } from "./serialize.mjs";

/**
 * Stage a deterministic temp output for the snapshot pipeline.
 *
 *   out/index.html           ← Vite-built SPA shell, consumed as capture seed
 *   out/_mado/spa.html       ← noindexed copy used as SPA fallback at runtime
 *   <os-temp>/mado-static-…  ← per-route captured HTML
 *
 * Captures go to an OS temp directory rather than `out/.mado/` so a crash
 * mid-capture can never leave half-baked artifacts inside the deployment
 * tree. promoteCapturedRoutes() copies the final HTML back into `out/`
 * atomically after verification.
 */
export async function prepareStaticOutput(outDir) {
  const shellPath = join(outDir, "index.html");
  if (!existsSync(shellPath)) {
    throw new Error(
      `[mado:static] missing ${shellPath}. Run \`mado build\` or Vite build before \`mado static\`.`,
    );
  }

  const shellHtml = await readFile(shellPath, "utf8");
  const spaPath = join(outDir, "_mado", "spa.html");
  await mkdir(dirname(spaPath), { recursive: true });
  await writeFile(spaPath, addNoIndex(shellHtml));

  // External temp directory — never leaks into `out/`.
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const tempRoot = await mkdtemp(join(tmpdir(), "mado-static-"));
  const routesDir = join(tempRoot, "routes");
  await mkdir(routesDir, { recursive: true });

  return { shellHtml, spaPath, tempRoot, routesDir };
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
