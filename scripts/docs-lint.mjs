#!/usr/bin/env node
// Docs lint: refuses to ship documentation that still uses the legacy
// vocabulary the 0.12 release replaced. Active reference docs, README,
// llms.txt, AGENTS.md, CONTRIBUTING.md, TODO.md and the starter READMEs
// must use the new terms; migration guides, CHANGELOG, release notes
// and ADRs are allowed to mention the old names by name so users can
// find them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Phrases that MUST disappear from current docs/README/llms/AGENTS. They
// remain legal inside the allow-listed contexts below.
const FORBIDDEN = [
  // Page API renamed from `bake` to `static`.
  { pattern: /\bpage\.bake\b/, replacement: "page.static" },
  { pattern: /\bbake\.paths\b/, replacement: "static.paths" },
  { pattern: /\bbake\.data\b/, replacement: "static.initialData" },
  { pattern: /\bbake\.revalidate\b/, replacement: "drop; no revalidate API" },

  // CLI renamed from `bake` to `static`.
  { pattern: /\bmado bake\b/, replacement: "mado static" },
  { pattern: /\bnpm run bake\b/, replacement: "npm run release" },

  // Output / marker shape changed.
  { pattern: /\bout\/baked\b/, replacement: "out/<route>/index.html" },
  { pattern: /#bake\b/, replacement: "data-mado-static-data" },

  // Old "Smart Static (`bake`)" headline.
  { pattern: /Smart Static \(`bake`\)/, replacement: "Static snapshots (`mado static`)" },

  // Old transport / renderer claims.
  { pattern: /No Vite required/i, replacement: "drop the phrase; Vite is the canonical transport" },
  { pattern: /\bNo Chromium needed\b/i, replacement: "drop the phrase; mado static REQUIRES Chromium" },
  // `linkedom` is also a legitimate Node-side test helper (the framework
  // uses it in test/router/* for DOM unit tests). We only flag the
  // phrases that mis-described the snapshot pipeline as a linkedom
  // renderer.
  { pattern: /linkedom (?:as|is) (?:the |a )?(?:static|snapshot|production) renderer/i,
    replacement: "drop the claim; capture uses Playwright/Chromium" },
  { pattern: /linkedom-?based renderer/i,
    replacement: "drop the claim; capture uses Playwright/Chromium" },
  { pattern: /server-rendered snapshot/i, replacement: "browser-rendered snapshot" },
  { pattern: /\bmeta[- ]shell\b/i, replacement: "static snapshot" },

  // Old positioning.
  {
    pattern: /SEO-heavy public sites are not supported/i,
    replacement: "drop the phrase — Mado now snapshots public sites",
  },
  {
    pattern: /\binternal tools only\b/i,
    replacement: "drop the phrase — Mado is for sites and apps",
  },
  {
    pattern: /SPA framework for internal tools/i,
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

// Files / trees that must stay on-message about the post-0.12 API. New
// roots must be added here AND covered by the CI step.
const ROOTS = [
  "README.md",
  "AGENTS.md",
  "llms.txt",
  "CONTRIBUTING.md",
  "TODO.md",
  "docs/README.md",
  "docs/en",
  "starters/default/README.md",
  "starters/modular/README.md",
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
  let inIgnoreBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Block-scoped allowance: paragraphs that teach LLMs which names
    // are obsolete must be free to mention those names verbatim.
    //   <!-- docs-lint:allow-legacy-mention -->
    //   ...legacy terms...
    //   <!-- /docs-lint:allow-legacy-mention -->
    if (line.includes("docs-lint:allow-legacy-mention")) {
      inIgnoreBlock = !line.includes("/docs-lint:allow-legacy-mention");
      continue;
    }
    if (inIgnoreBlock) continue;

    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(line)) {
        errors++;
        console.error(
          `${rel}:${i + 1}: forbidden term matches /${rule.pattern.source}/. ` +
            `Replace with: ${rule.replacement}`,
        );
      }
    }
  }
}
