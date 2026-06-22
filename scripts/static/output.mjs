import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { addNoIndex, escapeXml } from "./serialize.mjs";

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

  const tempRoot = join(outDir, ".mado");
  const routesDir = join(tempRoot, "static", "routes");
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(routesDir, { recursive: true });

  return { shellHtml, spaPath, tempRoot, routesDir };
}

export async function writeCapturedRoutes(routesDir, captured) {
  for (const record of captured) {
    const file = routeFile(routesDir, record.pathname);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, record.html);
  }
}

export async function promoteCapturedRoutes({ outDir, routesDir, captured }) {
  for (const record of captured) {
    const source = routeFile(routesDir, record.pathname);
    const target = routeFile(outDir, record.pathname);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

export async function writeStaticDeploymentFiles({ outDir, records, baseUrl }) {
  await writeFile(join(outDir, "sitemap.xml"), sitemap(records, baseUrl));
  await writeFile(join(outDir, "404.html"), await readFile(join(outDir, "_mado", "spa.html"), "utf8"));
  await writeFile(join(outDir, "_redirects"), "/* /_mado/spa.html 200\n");
  await writeFile(
    join(outDir, "_headers"),
    [
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/*.html",
      "  Cache-Control: no-cache, must-revalidate",
      "",
    ].join("\n"),
  );
}

export async function cleanupTemp(tempRoot) {
  await rm(tempRoot, { recursive: true, force: true });
}

function routeFile(root, pathname) {
  if (pathname === "/") return join(root, "index.html");
  const clean = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  return join(root, clean, "index.html");
}

function sitemap(records, baseUrl) {
  const root = baseUrl.replace(/\/$/, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${records
  .map((record) => `  <url><loc>${escapeXml(`${root}${record.pathname}`)}</loc></url>`)
  .join("\n")}
</urlset>
`;
}
