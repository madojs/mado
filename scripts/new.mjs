// Scaffold a new page from templates/.
//
//   node scripts/new.mjs list users
//   node scripts/new.mjs form sign-up
//   node scripts/new.mjs detail post
//
// Result: examples/pages/<name>.ts (or src/pages/, when present)
// with __name__ / __Name__ placeholders replaced.
//
// Zero dependencies.

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ROOT = resolve(process.cwd());

const [, , kind, rawName] = process.argv;

if (!kind || !rawName) {
  console.error("usage: node scripts/new.mjs <list|form|detail> <name>");
  process.exit(1);
}

const templates = {
  list: "templates/page-list.ts",
  form: "templates/page-form.ts",
  detail: "templates/page-detail.ts",
};

const tplPath = templates[kind];
if (!tplPath) {
  console.error(`unknown template: ${kind} (available: list, form, detail)`);
  process.exit(1);
}

// name → kebab-case (for file names and tags)
const kebab = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Name → PascalCase for titles
const pascal = kebab
  .split("-")
  .filter(Boolean)
  .map((p) => p[0].toUpperCase() + p.slice(1))
  .join("");

const targetDir = (await exists("src/pages"))
  ? "src/pages"
  : (await exists("examples/basic/pages"))
    ? "examples/basic/pages"
    : "src/pages";
await mkdir(targetDir, { recursive: true });

const targetFile = join(
  targetDir,
  kind === "detail" ? `${kebab}-detail.ts` : `${kebab}.ts`,
);

if (await exists(targetFile)) {
  console.error(`already exists: ${targetFile}`);
  process.exit(1);
}

const src = await readFile(join(PACKAGE_ROOT, tplPath), "utf8");
const out = src.replaceAll("__name__", kebab).replaceAll("__Name__", pascal);

await writeFile(targetFile, out);
console.log(`✓ created: ${targetFile}`);
console.log(`  remember to add this to routes.ts:`);
const routePath = kind === "detail" ? `/${kebab}/:id` : `/${kebab}`;
console.log(`    '${routePath}': () => import('./pages/${kebab}${kind === "detail" ? "-detail" : ""}.js'),`);

async function exists(p) {
  try {
    await access(join(PROJECT_ROOT, p));
    return true;
  } catch {
    return false;
  }
}
