import { existsSync } from "node:fs";
import { mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const OUTPUT_SENTINEL = ".mado-output";
const BUILD_BRIDGE = join("_mado", "build.json");
const PROTECTED_PROJECT_DIRS = new Set([
  ".git",
  "docs",
  "node_modules",
  "scripts",
  "src",
  "starters",
  "test",
]);

export async function prepareOutputDirectory({
  projectRoot,
  outDir,
  clean = true,
  force = false,
}) {
  const safe = await resolveSafeOutput(projectRoot, outDir);
  const state = await ownershipState(safe.outDir);

  if (state === "foreign" && !force) {
    throw new Error(
      `[mado:output] refusing to use non-empty directory not owned by Mado: ${safe.outDir}\n` +
        `Choose an empty directory or pass --force-output after checking the path.`,
    );
  }

  if (clean && existsSync(safe.outDir)) {
    await rm(safe.outDir, { recursive: true, force: true });
  }
  await mkdir(safe.outDir, { recursive: true });
  await writeSentinel(safe.outDir, safe.projectRoot);
  return safe.outDir;
}

export async function claimOutputDirectory({ projectRoot, outDir, force = false }) {
  const safe = await validateOutputDirectory({ projectRoot, outDir, force });
  await mkdir(safe.outDir, { recursive: true });
  await writeSentinel(safe.outDir, safe.projectRoot);
  return safe.outDir;
}

export async function validateOutputDirectory({ projectRoot, outDir, force = false }) {
  const safe = await resolveSafeOutput(projectRoot, outDir);
  const state = await ownershipState(safe.outDir);
  if (state === "foreign" && !force) {
    throw new Error(
      `[mado:output] refusing to write into non-empty directory not owned by Mado: ${safe.outDir}\n` +
        `Run a Mado/Vite build first, choose another --out, or pass --force-output.`,
    );
  }
  return safe;
}

export async function resolveSafeOutput(projectRoot, outDir) {
  const project = await canonicalPath(resolve(projectRoot));
  const output = await canonicalPath(resolve(projectRoot, outDir));
  const home = await canonicalPath(homedir());

  if (isFilesystemRoot(output)) {
    throw new Error(`[mado:output] refusing filesystem root: ${output}`);
  }
  if (output === project) {
    throw new Error(`[mado:output] refusing project root: ${output}`);
  }
  if (output === home) {
    throw new Error(`[mado:output] refusing home directory: ${output}`);
  }
  if (isInside(output, project)) {
    throw new Error(`[mado:output] refusing a parent of the project: ${output}`);
  }

  const projectRelative = relative(project, output);
  if (projectRelative && !projectRelative.startsWith("..") && !isAbsolute(projectRelative)) {
    const first = projectRelative.split(/[\\/]/, 1)[0];
    if (PROTECTED_PROJECT_DIRS.has(first)) {
      throw new Error(`[mado:output] refusing protected project directory: ${output}`);
    }
  }

  return { projectRoot: project, outDir: output };
}

async function ownershipState(outDir) {
  if (!existsSync(outDir)) return "empty";
  const entries = await readdir(outDir);
  if (entries.length === 0) return "empty";
  if (existsSync(join(outDir, OUTPUT_SENTINEL))) return "owned";
  // A build bridge is emitted by the Mado Vite plugin and is sufficient
  // evidence for a direct `mado static` invocation after `mado build`.
  if (existsSync(join(outDir, BUILD_BRIDGE))) return "owned";
  return "foreign";
}

async function writeSentinel(outDir, projectRoot) {
  await writeFile(
    join(outDir, OUTPUT_SENTINEL),
    `${JSON.stringify({ owner: "@madojs/mado", projectRoot }, null, 2)}\n`,
  );
}

async function canonicalPath(path) {
  let cursor = path;
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(relative(parent, cursor));
    cursor = parent;
  }
  const base = await realpath(cursor).catch(() => resolve(cursor));
  return resolve(base, ...suffix);
}

function isFilesystemRoot(path) {
  return dirname(path) === path;
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
