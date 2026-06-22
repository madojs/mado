#!/usr/bin/env node
// Docs lint: refuses to ship documentation that still uses the legacy
// vocabulary the 0.12 release replaced. Active reference docs, README,
// llms.txt and AGENTS.md must use the new terms; migration guides,
// CHANGELOG, release notes and ADRs are allowed to mention the old
// names by name so users can find them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Phrases that MUST disappear from current docs/README/llms/AGENTS. They
// remain legal inside the allow-listed contexts below.
const FORBIDDEN = [
  { pattern: /\bpage\.bake\b/, replacement: "page.static" },
  { pattern: /\bmado bake\b/, replacement: "mado static" },
  { pattern: /\bout\/baked\b/, replacement: "out/<route>/index.html" },
  { pattern: /#bake\b/, replacement: "data-mado-static-data" },
  { pattern: /No Vite required/i, replacement: "drop the phrase" },
  {
    pattern: /SEO-heavy public sites are not supported/i,
    replacement: "drop the phrase — Mado now snapshots public sites",
  },
  {
    pattern: /\binternal tools only\b/i,
    replacement: "drop the phrase — Mado is for sites and apps",
  },
  {
    pattern: /shadow:\s*false[^.\n]*SEO/i,
    replacement: "drop the recommendation; SEO is handled by snapshots",
  },
];

const ALLOW_LISTED = [
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)docs\/architecture\/adr\//,
  /(^|\/)docs\/.+migration/i,
  /(^|\/)docs\/.+v1-stability/i,
  /(^|\/)scripts\/docs-lint\.mjs$/,
];

const ROOTS = [
  "README.md",
  "AGENTS.md",
  "llms.txt",
  "docs/en",
];

let errors = 0;

for (const root of ROOTS) {
  const full = join(REPO_ROOT, root);
  try {
    statSync(full);
  } catch {
    continue;
  }
  scan(full);
}

if (errors > 0) {
  console.error(`\n[docs-lint] ${errors} forbidden term(s) in current docs.`);
  process.exit(1);
}
console.log("[docs-lint] OK");

function scan(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }
  if (!path.endsWith(".md") && !path.endsWith(".txt")) return;
  const rel = path.slice(REPO_ROOT.length + 1);
  if (ALLOW_LISTED.some((rx) => rx.test(rel))) return;

  const body = readFileSync(path, "utf8");
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(lines[i])) {
        errors++;
        console.error(
          `${rel}:${i + 1}: forbidden term matches /${rule.pattern.source}/. ` +
            `Replace with: ${rule.replacement}`,
        );
      }
    }
  }
}