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

import {
  backslashEscapedBacktickLines,
} from "./docs-markdown-rules.mjs";

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

  // Old pre-Vite transport language.
  { pattern: /\btsc[- ]only\b/i, replacement: "drop the phrase — Vite is the canonical transport" },
  { pattern: /\bno bundler\b/i, replacement: "drop the phrase — Vite is the canonical bundler" },
  { pattern: /\btsc\s*(?:→|->)+\s*browser\b/i,
    replacement: "drop the phrase — generated apps go through Vite" },
  { pattern: /\bimport[\s-]?map(?:s)?\b/i, replacement: "drop the phrase — apps use Vite, not import maps" },

  // Old dev / static / edge claims.
  { pattern: /SSE[- ]?reload/i, replacement: "drop the phrase — dev uses Vite HMR" },
  { pattern: /\bedge[- ]prerender\b/i, replacement: "drop the phrase — capture is `mado static` only" },

  // Old doc filenames in active docs (the migration table in
  // docs/en/README.md is allow-listed via docs-lint:allow-legacy-mention
  // markers around it if needed).
  { pattern: /\b03-static-bake\.md\b/, replacement: "15-static-snapshots.md" },
  { pattern: /\b09-shadow-vs-light-dom\.md\b/, replacement: "10-pages-and-components.md" },
  { pattern: /\b10-app-architecture\.md\b/, replacement: "16-app-architecture.md" },
  { pattern: /\b13-deployment\.md\b/, replacement: "20-deployment.md" },
  { pattern: /\b16-bake-cookbook\.md\b/, replacement: "23-cookbook.md" },
  { pattern: /\b18-api-freeze-map\.md\b/, replacement: "30-api-surface.md" },
  { pattern: /\b19-reactivity-ordering\.md\b/, replacement: "31-reactivity-ordering.md" },
  { pattern: /\b20-v1-stability\.md\b/, replacement: "32-v1-stability.md" },
  { pattern: /\b07-llm-pitfalls\.md\b/, replacement: "40-llm-guide.md" },
  { pattern: /\b08-llm-zero-history-test\.md\b/, replacement: "40-llm-guide.md" },
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
  ".github/copilot-instructions.md",
  "CONTRIBUTING.md",
  "TODO.md",
  "docs/README.md",
  "docs/en",
  "starters/default/README.md",
  "starters/modular/README.md",
];
const docsFiles = [];
const publicNames = publicNamesFromGolden();
const publicSubpaths = new Set([
  "@madojs/mado",
  "@madojs/mado/vite",
  "@madojs/mado/devtools.js",
  "@madojs/mado/docs/en/manifest.json",
  "@madojs/mado/llms.txt",
  "@madojs/mado/package.json",
]);

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

validateDocsManifest();

for (const file of docsFiles) {
  validateLinks(file);
  validateImports(file);
}

if (errors > 0) {
  console.error(`\n[docs-lint] ${errors} documentation error(s).`);
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
  docsFiles.push(path);
  const rel = path.slice(REPO_ROOT.length + 1);
  if (ALLOW_LISTED.some((rx) => rx.test(rel))) return;

  const body = readFileSync(path, "utf8");
  const lines = body.split("\n");
  const invalidBacktickLines = new Set(
    backslashEscapedBacktickLines(body),
  );
  let inIgnoreBlock = false;
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.trimStart().match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.marker &&
        fenceMatch[1].length >= fence.length &&
        fenceMatch[2].trim() === ""
      ) {
        fence = null;
        continue;
      }
    } else if (
      fenceMatch &&
      (
        fenceMatch[1][0] === "~" ||
        !fenceMatch[2].includes("`")
      )
    ) {
      // Backtick fence info strings cannot contain a backtick. This
      // distinction matters for valid inline spans such as
      // ``` html`` ```, which may begin a prose line but are not fences.
      fence = {
        length: fenceMatch[1].length,
        marker: fenceMatch[1][0],
      };
      continue;
    }

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

    const prose = line.replace(/(`+)(.*?)\1/g, "");
    if (invalidBacktickLines.has(i + 1)) {
      errors++;
      console.error(
        `${rel}:${i + 1}: backslash-escaped backticks are literal inside ` +
          "CommonMark code spans; use a longer backtick delimiter",
      );
    }
    if (
      !fence &&
      rel.startsWith("docs/en/") &&
      /<\/?(?!https?:|mailto:)[A-Za-z][^>]*>/.test(prose)
    ) {
      errors++;
      console.error(
        `${rel}:${i + 1}: raw HTML is not allowed in published Markdown; ` +
          "use Markdown or a fenced/inline code span",
      );
    }

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

function validateLinks(path) {
  const body = readFileSync(path, "utf8");
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^(?:https?:|mailto:)/.test(target)) continue;
    target = decodeURIComponent(target.split("#")[0]);
    const full = resolve(dirname(path), target);
    try {
      statSync(full);
    } catch {
      errors++;
      console.error(`${path.slice(REPO_ROOT.length + 1)}: broken link ${match[1]}`);
    }
  }
}

function validateImports(path) {
  const body = readFileSync(path, "utf8");
  for (const match of body.matchAll(/(?:from\s+|import\s+)["'](@madojs\/mado(?:\/[^"']+)?)['"]/g)) {
    if (!publicSubpaths.has(match[1])) {
      errors++;
      console.error(`${path.slice(REPO_ROOT.length + 1)}: non-public package import ${match[1]}`);
    }
  }
  for (const match of body.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']@madojs\/mado["']/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.replace(/\/\/.*$/s, "").trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
      if (name && !publicNames.has(name)) {
        errors++;
        console.error(`${path.slice(REPO_ROOT.length + 1)}: non-public root import ${name}`);
      }
    }
  }
}

function publicNamesFromGolden() {
  const body = readFileSync(join(REPO_ROOT, "api/index.d.ts"), "utf8");
  const names = new Set();
  for (const match of body.matchAll(/export(?:\s+type)?\s+\{([^}]+)\}/g)) {
    for (const raw of match[1].split(",")) names.add(raw.trim().split(/\s+as\s+/)[0]);
  }
  return names;
}

function validateDocsManifest() {
  const docsRoot = join(REPO_ROOT, "docs", "en");
  const manifestPath = join(docsRoot, "manifest.json");
  let manifest;
  let source;

  try {
    source = readFileSync(manifestPath, "utf8");
    manifest = JSON.parse(source);
  } catch (error) {
    docsError(`docs/en/manifest.json: cannot read valid JSON (${error.message})`);
    return;
  }

  if (source !== `${JSON.stringify(manifest, null, 2)}\n`) {
    docsError("docs/en/manifest.json: use deterministic two-space JSON formatting");
  }
  if (!isRecord(manifest)) {
    docsError("docs/en/manifest.json: root must be an object");
    return;
  }
  validateKeys(manifest, ["schemaVersion", "locale", "sections"], "manifest");
  if (manifest.schemaVersion !== 1) {
    docsError("docs/en/manifest.json: schemaVersion must be 1");
  }
  if (manifest.locale !== "en") {
    docsError('docs/en/manifest.json: locale must be "en"');
  }
  if (!Array.isArray(manifest.sections) || manifest.sections.length === 0) {
    docsError("docs/en/manifest.json: sections must be a non-empty array");
    return;
  }

  const sectionIds = new Set();
  const slugs = new Set();
  const files = new Set();
  const flatFiles = [];
  const sectionTitles = [];

  for (const [sectionIndex, section] of manifest.sections.entries()) {
    const label = `sections[${sectionIndex}]`;
    if (!isRecord(section)) {
      docsError(`docs/en/manifest.json: ${label} must be an object`);
      continue;
    }
    validateKeys(section, ["id", "title", "entries"], label);
    if (typeof section.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id)) {
      docsError(`docs/en/manifest.json: ${label}.id must be a lowercase slug`);
    } else if (sectionIds.has(section.id)) {
      docsError(`docs/en/manifest.json: duplicate section id ${section.id}`);
    } else {
      sectionIds.add(section.id);
    }
    if (typeof section.title !== "string" || section.title.trim() !== section.title || !section.title) {
      docsError(`docs/en/manifest.json: ${label}.title must be a non-empty trimmed string`);
    } else {
      sectionTitles.push(section.title);
    }
    if (!Array.isArray(section.entries) || section.entries.length === 0) {
      docsError(`docs/en/manifest.json: ${label}.entries must be a non-empty array`);
      continue;
    }

    for (const [entryIndex, entry] of section.entries.entries()) {
      const entryLabel = `${label}.entries[${entryIndex}]`;
      if (!isRecord(entry)) {
        docsError(`docs/en/manifest.json: ${entryLabel} must be an object`);
        continue;
      }
      validateKeys(entry, ["slug", "file"], entryLabel);

      if (typeof entry.slug !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(entry.slug)) {
        docsError(`docs/en/manifest.json: ${entryLabel}.slug must be a lowercase URL slug`);
      } else if (slugs.has(entry.slug)) {
        docsError(`docs/en/manifest.json: duplicate document slug ${entry.slug}`);
      } else {
        slugs.add(entry.slug);
      }

      if (
        typeof entry.file !== "string" ||
        !/^\d{2}-[a-z0-9]+(?:[.-][a-z0-9]+)*\.md$/.test(entry.file) ||
        entry.file.includes("..") ||
        entry.file.includes("/") ||
        entry.file.includes("\\")
      ) {
        docsError(`docs/en/manifest.json: ${entryLabel}.file must be a safe numbered Markdown basename`);
        continue;
      }
      if (files.has(entry.file)) {
        docsError(`docs/en/manifest.json: duplicate document file ${entry.file}`);
        continue;
      }
      files.add(entry.file);
      flatFiles.push(entry.file);

      try {
        const firstLine = readFileSync(join(docsRoot, entry.file), "utf8").split(/\r?\n/, 1)[0];
        if (!/^#\s+\S/.test(firstLine)) {
          docsError(`docs/en/${entry.file}: first line must be a non-empty H1`);
        }
      } catch {
        docsError(`docs/en/manifest.json: missing document ${entry.file}`);
      }
    }
  }

  const expectedFiles = readdirSync(docsRoot)
    .filter((file) => /^\d{2}-.*\.md$/.test(file))
    .sort();
  if (JSON.stringify(flatFiles) !== JSON.stringify(expectedFiles)) {
    docsError(
      "docs/en/manifest.json: flattened entries must cover every numbered Markdown file in filename order",
    );
  }

  validateReadmeMap(docsRoot, sectionTitles, flatFiles);
}

function validateReadmeMap(docsRoot, expectedTitles, expectedFiles) {
  const readme = readFileSync(join(docsRoot, "README.md"), "utf8");
  const start = readme.indexOf("\n## Map\n");
  const end = start < 0 ? -1 : readme.indexOf("\n## ", start + "\n## Map\n".length);
  if (start < 0 || end < 0) {
    docsError("docs/en/README.md: expected a bounded ## Map section");
    return;
  }
  const map = readme.slice(start, end);
  const titles = [...map.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
  const files = [...map.matchAll(/\]\(\.\/(\d{2}-[^)#]+\.md)(?:#[^)]+)?\)/g)].map(
    (match) => match[1],
  );
  if (JSON.stringify(titles) !== JSON.stringify(expectedTitles)) {
    docsError("docs/en/README.md: ## Map section headings must match manifest sections");
  }
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    docsError("docs/en/README.md: ## Map links must match manifest entries in order");
  }
}

function validateKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = allowed.slice().sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    docsError(
      `docs/en/manifest.json: ${label} keys must be exactly ${expected.join(", ")}`,
    );
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function docsError(message) {
  errors++;
  console.error(message);
}
