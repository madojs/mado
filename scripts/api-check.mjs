import {
  access,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const distRoot = resolve(root, "dist/src");
const declarationRoot = resolve(root, "api/declarations");
const rootGolden = resolve(root, "api/index.d.ts");

if (isMainModule()) await main();

async function main() {
  const args = process.argv.slice(2);
  const update = args.length === 1 && args[0] === "--update";
  if (args.length > 0 && !update) {
    throw new Error("[api] usage: node scripts/api-check.mjs [--update]");
  }

  const manifest = JSON.parse(
    await readFile(resolve(root, "api/public-api.json"), "utf8"),
  );
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  assertEqual(
    "package subpaths",
    Object.keys(pkg.exports).sort(),
    manifest.subpaths.slice().sort(),
  );
  const runtimeSubpaths = Object.entries(pkg.exports)
    .filter(([, target]) => packageConditionTarget(target, "import"))
    .map(([subpath]) => subpath)
    .sort();
  assertEqual(
    "runtime entrypoints",
    runtimeSubpaths,
    Object.keys(manifest.runtimeExports).sort(),
  );
  for (const [subpath, expected] of Object.entries(manifest.runtimeExports)) {
    const target = packageConditionTarget(pkg.exports[subpath], "import");
    if (!target) throw new Error(`[api] ${subpath} has no import export target`);
    const runtime = await import(resolve(root, target));
    assertEqual(`${subpath} runtime exports`, Object.keys(runtime).sort(), expected.slice().sort());
  }

  const typeEntries = packageTypeEntries(pkg.exports);
  const rootEntry = typeEntries.get(".");
  if (!rootEntry) throw new Error("[api] package root has no types export");
  if (typeof pkg.types !== "string" || resolve(root, pkg.types) !== rootEntry) {
    throw new Error("[api] package types field differs from the root types export");
  }

  const declarations = await collectDeclarationGraph(
    [...typeEntries.values()],
    distRoot,
  );
  const rootDeclaration = declarations.get(rootEntry);
  if (!rootDeclaration) throw new Error("[api] package root declaration is missing");

  const dependencyDeclarations = new Map(
    [...declarations]
      .filter(([path]) => path !== rootEntry)
      .map(([path, source]) => [portableRelative(distRoot, path), source]),
  );

  if (update) {
    await writeFile(rootGolden, rootDeclaration);
    await updateDeclarationSnapshots(dependencyDeclarations, declarationRoot);
    console.log(
      `[api] updated root contract and ${dependencyDeclarations.size} reachable declaration snapshot(s)`,
    );
    return;
  }

  const changes = [];
  const expectedRoot = declarationText(await readFile(rootGolden, "utf8"));
  if (rootDeclaration !== expectedRoot) changes.push("api/index.d.ts");

  const expectedDeclarations = await readDeclarationSnapshots(declarationRoot);
  const paths = new Set([
    ...dependencyDeclarations.keys(),
    ...expectedDeclarations.keys(),
  ]);
  for (const path of [...paths].sort()) {
    if (dependencyDeclarations.get(path) !== expectedDeclarations.get(path)) {
      changes.push(`api/declarations/${path}`);
    }
  }

  if (changes.length > 0) {
    throw new Error(
      "[api] public declarations changed:\n" +
        changes.map((path) => `  - ${path}`).join("\n") +
        "\nRun `npm run api:update`, review the declaration diff, and document " +
        "the contract change intentionally.",
    );
  }

  console.log(
    `[api] OK — ${Object.keys(manifest.runtimeExports).length} runtime entrypoints, ` +
      `${manifest.subpaths.length} subpaths, ${declarations.size} declaration files`,
  );
}

export async function collectDeclarationGraph(entryFiles, boundary) {
  const declarations = new Map();
  const pending = [...new Set(entryFiles.map((path) => resolve(path)))];

  while (pending.length > 0) {
    const path = pending.pop();
    if (declarations.has(path)) continue;
    assertInside(boundary, path);

    const source = await readFile(path, "utf8");
    declarations.set(path, declarationText(source));
    for (const specifier of declarationSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const dependency = await resolveDeclaration(path, specifier, boundary);
      if (!declarations.has(dependency)) pending.push(dependency);
    }
  }

  return declarations;
}

export function declarationSpecifiers(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const found = new Set();
  for (const pattern of [
    /^\s*\/\/\/\s*<reference\s+path=["']([^"']+)["'][^>]*>/gm,
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bdeclare\s+module\s*["']([^"']+)["']/g,
    /^\s*import\s*["']([^"']+)["']/gm,
  ]) {
    const input = pattern.source.includes("reference") ? source : code;
    for (const match of input.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

export function declarationText(source) {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/^\/\/# sourceMappingURL=.*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .trim() + "\n";
}

function packageTypeEntries(exportsMap) {
  const entries = new Map();
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const targets = packageConditionTargets(target, "types");
    if (targets.size === 0) continue;
    if (targets.size > 1) {
      throw new Error(
        `[api] ${subpath} exposes multiple declaration targets: ${[...targets].join(", ")}`,
      );
    }
    const [types] = targets;
    const path = resolve(root, types);
    assertInside(distRoot, path);
    entries.set(subpath, path);
  }
  return entries;
}

function packageConditionTarget(target, condition) {
  const targets = packageConditionTargets(target, condition);
  if (targets.size === 0) return null;
  if (targets.size > 1) {
    throw new Error(
      `[api] export exposes multiple ${condition} targets: ${[...targets].join(", ")}`,
    );
  }
  return [...targets][0];
}

function packageConditionTargets(target, condition, found = new Set()) {
  if (!target) return found;
  if (Array.isArray(target)) {
    for (const value of target) packageConditionTargets(value, condition, found);
    return found;
  }
  if (typeof target !== "object") return found;
  if (typeof target[condition] === "string") found.add(target[condition]);
  for (const [key, value] of Object.entries(target)) {
    if (key !== condition) packageConditionTargets(value, condition, found);
  }
  return found;
}

async function resolveDeclaration(importer, specifier, boundary) {
  const target = resolve(dirname(importer), specifier);
  const candidates = declarationCandidates(target);
  for (const candidate of candidates) {
    assertInside(boundary, candidate);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next declaration-file form.
    }
  }
  throw new Error(
    `[api] cannot resolve declaration import ${specifier} from ` +
      portableRelative(root, importer),
  );
}

function declarationCandidates(target) {
  if (target.endsWith(".d.ts") || target.endsWith(".d.mts") || target.endsWith(".d.cts")) {
    return [target];
  }
  if (target.endsWith(".mts")) return [`${target.slice(0, -4)}.d.mts`];
  if (target.endsWith(".cts")) return [`${target.slice(0, -4)}.d.cts`];
  if (target.endsWith(".ts")) return [`${target.slice(0, -3)}.d.ts`];
  if (target.endsWith(".mjs")) return [`${target.slice(0, -4)}.d.mts`];
  if (target.endsWith(".cjs")) return [`${target.slice(0, -4)}.d.cts`];
  if (target.endsWith(".js")) return [`${target.slice(0, -3)}.d.ts`];
  return [
    `${target}.d.ts`,
    `${target}.d.mts`,
    `${target}.d.cts`,
    resolve(target, "index.d.ts"),
    resolve(target, "index.d.mts"),
    resolve(target, "index.d.cts"),
  ];
}

async function updateDeclarationSnapshots(actual, directory) {
  const previous = await readDeclarationSnapshots(directory);
  for (const path of previous.keys()) {
    if (!actual.has(path)) await unlink(resolve(directory, path));
  }
  for (const [path, source] of actual) {
    const target = resolve(directory, path);
    assertInside(directory, target);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
}

async function readDeclarationSnapshots(directory) {
  const snapshots = new Map();
  for (const path of await listFiles(directory)) {
    snapshots.set(path, declarationText(await readFile(resolve(directory, path), "utf8")));
  }
  return snapshots;
}

async function listFiles(directory, prefix = "") {
  let entries;
  try {
    entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const out = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listFiles(directory, path));
    else if (entry.isFile() && /\.d\.(?:ts|mts|cts)$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  throw new Error(
    `[api] ${label} changed\nexpected: ${expected.join(", ")}\n` +
      `actual:   ${actual.join(", ")}`,
  );
}

function assertInside(boundary, path) {
  const rel = relative(resolve(boundary), resolve(path));
  if (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)) return;
  throw new Error(`[api] declaration escaped its public package boundary: ${path}`);
}

function portableRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

function isMainModule() {
  return !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}
