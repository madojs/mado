import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "api/public-api.json"), "utf8"));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const runtime = await import(resolve(root, "dist/src/index.js"));

assertEqual("package subpaths", Object.keys(pkg.exports).sort(), manifest.subpaths.slice().sort());
assertEqual("runtime exports", Object.keys(runtime).sort(), manifest.runtimeExports.slice().sort());

const actualTypes = normaliseDeclarations(
  await readFile(resolve(root, "dist/src/index.d.ts"), "utf8"),
);
const expectedTypes = normaliseDeclarations(
  await readFile(resolve(root, "api/index.d.ts"), "utf8"),
);
if (actualTypes !== expectedTypes) {
  throw new Error(
    "[api] public declarations changed. Review the change and update api/index.d.ts intentionally.",
  );
}

console.log(`[api] OK — ${manifest.runtimeExports.length} runtime exports, ${manifest.subpaths.length} subpaths`);

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  throw new Error(
    `[api] ${label} changed\nexpected: ${expected.join(", ")}\nactual:   ${actual.join(", ")}`,
  );
}

function normaliseDeclarations(source) {
  return source
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, "")
    .replace(/,\s*}/g, " }")
    .replace(/\s+/g, " ")
    .trim();
}
