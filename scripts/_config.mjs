// Small shared CLI helpers. Mado app configuration lives in vite.config.ts;
// this file intentionally does not read any project config file.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Detect whether we are inside the framework repository or inside a user app.
 *
 * @param {string} projectRoot
 * @returns {"app"|"repo"}
 */
export function detectContext(projectRoot) {
  const looksLikeRepo =
    existsSync(join(projectRoot, "src/index.ts")) &&
    existsSync(join(projectRoot, "package.json")) &&
    safeReadJson(join(projectRoot, "package.json"))?.name === "@madojs/mado";
  return looksLikeRepo ? "repo" : "app";
}

/**
 * Resolve a project-relative path against `projectRoot`.
 *
 * @param {string} projectRoot
 * @param {string} p
 * @returns {string}
 */
export function resolveProjectPath(projectRoot, p) {
  return resolve(projectRoot, p);
}

export function getPackageRoot() {
  return PACKAGE_ROOT;
}

/**
 * Tiny argv parser shared by CLI subcommands.
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

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
