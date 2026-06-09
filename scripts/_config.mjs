// Mado configuration loader.
//
// Single source of project configuration for `mado dev`, `mado build`,
// `mado bundle`, `mado bake`, `mado preview`, `mado release`.
//
// Lookup order (first hit wins):
//   1. `mado.config.json`  in PROJECT_ROOT (recommended)
//   2. built-in defaults
//
// CLI flags always override file values, file values override defaults.
//
// Context detection:
//   - "app"  : a user project that depends on `@madojs/mado`
//   - "repo" : the framework repository itself (has src/index.ts and examples/)
//
// In app-mode, defaults assume the canonical layout from MADO_V1_PLAN.md:
//   src/routes.ts  index.html  public/  dist/  out/

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @typedef {Object} MadoDevConfig
 * @property {number} [port]
 * @property {Record<string,string>} [proxy]   // path → upstream base URL
 *
 * @typedef {Object} MadoBuildConfig
 * @property {string} [out]                    // deploy artifact dir (default: "out")
 * @property {string} [dist]                   // tsc output dir (default: "dist")
 * @property {string} [publicDir]              // static assets dir (default: "public")
 *
 * @typedef {Object} MadoBakeConfig
 * @property {string} [entry]                  // routes module (default: "src/routes.ts")
 * @property {string} [template]               // SPA shell html (default: "index.html")
 * @property {string} [baseUrl]                // canonical/sitemap base
 * @property {string} [outDir]                 // override (default: build.out + "/baked")
 *
 * @typedef {Object} MadoBundleConfig
 * @property {boolean} [splitting]
 * @property {Array<"gz"|"br">} [compress]
 *
 * @typedef {Object} MadoConfig
 * @property {"app"|"repo"} context
 * @property {string} projectRoot
 * @property {MadoDevConfig}    dev
 * @property {MadoBuildConfig}  build
 * @property {MadoBakeConfig}   bake
 * @property {MadoBundleConfig} bundle
 */

/**
 * Detect whether we are inside the framework repository or inside a user app.
 *
 * Heuristic: the framework repo has both `src/index.ts` and an `examples/`
 * directory at PROJECT_ROOT. Anything else is treated as an app.
 *
 * @param {string} projectRoot
 * @returns {"app"|"repo"}
 */
export function detectContext(projectRoot) {
  const looksLikeRepo =
    existsSync(join(projectRoot, "src/index.ts")) &&
    existsSync(join(projectRoot, "examples")) &&
    existsSync(join(projectRoot, "package.json")) &&
    safeReadJson(join(projectRoot, "package.json"))?.name === "@madojs/mado";
  return looksLikeRepo ? "repo" : "app";
}

/**
 * Built-in defaults per context.
 *
 * @param {"app"|"repo"} context
 * @returns {MadoConfig}
 */
function defaults(context) {
  if (context === "repo") {
    return {
      context,
      projectRoot: "",
      dev:    { port: 5173, proxy: {} },
      build:  { out: "out", dist: "dist", publicDir: "public" },
      bake:   {
        entry: "examples/basic/routes.ts",
        template: "examples/index.html",
        baseUrl: "https://example.com",
      },
      bundle: { splitting: true, compress: ["gz", "br"] },
    };
  }
  return {
    context,
    projectRoot: "",
    dev:    { port: 5173, proxy: {} },
    build:  { out: "out", dist: "dist", publicDir: "public" },
    bake:   {
      entry: "src/routes.ts",
      template: "index.html",
      baseUrl: "https://example.com",
    },
    bundle: { splitting: true, compress: ["gz", "br"] },
  };
}

/**
 * Load and merge configuration for the given project root.
 *
 * Precedence (low → high): defaults, mado.config.json, CLI overrides.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot=process.cwd()]
 * @param {Partial<MadoConfig>} [opts.overrides]
 * @returns {MadoConfig}
 */
export function loadConfig(opts = {}) {
  const projectRoot = resolve(opts.projectRoot ?? process.cwd());
  const context = detectContext(projectRoot);
  const base = defaults(context);
  base.projectRoot = projectRoot;

  const file = join(projectRoot, "mado.config.json");
  const fromFile = existsSync(file) ? safeReadJson(file) ?? {} : {};

  const merged = deepMerge(base, fromFile);
  if (opts.overrides) deepMerge(merged, opts.overrides);

  merged.context = context;
  merged.projectRoot = projectRoot;
  return merged;
}

/**
 * Resolve a project-relative path against `projectRoot`. Absolute paths are
 * returned unchanged.
 *
 * @param {MadoConfig} cfg
 * @param {string} p
 * @returns {string}
 */
export function resolveProjectPath(cfg, p) {
  if (!p) return cfg.projectRoot;
  return resolve(cfg.projectRoot, p);
}

/**
 * @param {MadoConfig} cfg
 * @returns {string}
 */
export function getPackageRoot() {
  return PACKAGE_ROOT;
}

// ---------- helpers ----------

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.warn(`[mado] failed to parse ${path}: ${err.message}`);
    return null;
  }
}

/**
 * Shallow-deep merge: objects are merged recursively, arrays and primitives
 * are replaced. Mutates `target` and returns it.
 */
function deepMerge(target, source) {
  if (!source || typeof source !== "object") return target;
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      target[k] &&
      typeof target[k] === "object" &&
      !Array.isArray(target[k])
    ) {
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

/**
 * Tiny argv parser shared by CLI subcommands.
 *
 * Recognises `--key=value`, `--key value`, and `--flag` (boolean).
 * Unknown leading positionals are returned in `positional`.
 *
 * @param {string[]} argv
 * @returns {{ flags: Record<string, string|boolean>, positional: string[] }}
 */
export function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const name = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}