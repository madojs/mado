/**
 * Pure pattern matching + flatten/normalize of the manifest.
 *
 * There is NO window/document/history or signals here — only functions
 * over strings and objects. This allows:
 *   - testing routing in Node without jsdom;
 *   - reusing the same compile/regex in bake / prefetch without duplication.
 */

import {
  isNested,
  isPage,
  type Guard,
  type Page,
  type RouteEntry,
} from "../page.js";
import type { TemplateResult } from "../html/template-types.js";

export type RouteParams = Record<string, string>;
export type RouteHandler = (params: RouteParams) => TemplateResult;
export type Routes = Record<string, RouteHandler>;

export interface CompiledRoute {
  pattern: string;
  regex: RegExp;
  keys: string[];
  handler: RouteHandler;
}

/**
 * Compile a pattern like `/users/:id` into a `CompiledRoute` with
 * named keys and a regex for matching against `location.pathname`.
 *
 * Special case `*` — wildcard fallback, matches anything.
 */
export function compile(pattern: string, handler: RouteHandler): CompiledRoute {
  if (pattern === "*") {
    return { pattern, regex: /.*/, keys: [], handler };
  }
  const keys: string[] = [];
  const re = pattern.replace(/\/$/, "").replace(/:[\w]+/g, (m) => {
    keys.push(m.slice(1));
    return "([^/]+)";
  });
  return {
    pattern,
    regex: new RegExp(`^${re}/?$`),
    keys,
    handler,
  };
}

/**
 * Find the first matching CompiledRoute for path. Returns already
 * decoded params (decodeURIComponent on each segment).
 * Wildcard (`*`) is skipped — handle it separately as a fallback.
 */
export function matchRoute(
  path: string,
  compiled: readonly CompiledRoute[],
): { route: CompiledRoute; params: RouteParams } | null {
  for (const r of compiled) {
    if (r.pattern === "*") continue;
    const m = r.regex.exec(path);
    if (m) {
      const params: RouteParams = {};
      r.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1] ?? "");
      });
      return { route: r, params };
    }
  }
  return null;
}

/** Simple regex WITHOUT keys — for prefetch (we only need the match fact). */
export function patternToRegex(pattern: string): RegExp {
  const re = pattern.replace(/\/$/, "").replace(/:[\w]+/g, "([^/]+)");
  return new RegExp(`^${re}/?$`);
}

// ---------- Manifest (routes()) ----------


export type RoutesMap = Record<string, RouteEntry>;

export interface FlatEntry {
  loader: () => Promise<Page> | Page;
  layouts: Array<() => Promise<Page> | Page>;
  /**
   * Guards inherited from enclosing nested groups, outer → inner.
   * The page may add its own via `Page.guard` — those run last.
   */
  guards: Guard[];
}

/**
 * Unfold a nested manifest into a flat list of `[fullPattern, FlatEntry]`.
 * Accumulates parent layouts along the way, so each leaf route
 * "knows" all its layouts (from outer to inner).
 */
export function flatten(
  map: RoutesMap,
  prefix = "",
  layouts: FlatEntry["layouts"] = [],
  guards: Guard[] = [],
): Array<[string, FlatEntry]> {
  const out: Array<[string, FlatEntry]> = [];
  for (const [k, v] of Object.entries(map)) {
    const full = joinPath(prefix, k);
    if (isNested(v)) {
      const nextLayouts = v.layout
        ? [...layouts, normalize(v.layout)]
        : layouts;
      const nextGuards = v.guard
        ? [...guards, ...toGuardArray(v.guard)]
        : guards;
      for (const sub of flatten(v.routes, full, nextLayouts, nextGuards)) {
        out.push(sub);
      }
    } else {
      out.push([
        full || "/",
        { loader: normalize(v), layouts, guards: [...guards] },
      ]);
    }
  }
  return out;
}

function toGuardArray(g: Guard | Guard[]): Guard[] {
  return Array.isArray(g) ? g : [g];
}

/** Careful path segment joining without duplicate slashes. */
export function joinPath(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith("/")) a = a.slice(0, -1);
  if (b.startsWith("/")) b = b.slice(1);
  return `${a}/${b}`;
}

/**
 * Normalise a RouteEntry into a uniform `() => Promise<Page> | Page`.
 *
 * RouteEntry comes in three forms:
 *   - a ready Page  → return as-is
 *   - dynamic import → await the default export and check it's a Page
 *   - something else  → throw (bad manifest entry)
 *
 * This function is the single place that handles both forms;
 * the rest of the code works only with the unified loader.
 */
export function normalize(entry: RouteEntry): () => Promise<Page> | Page {
  if (isPage(entry)) return () => entry;
  if (typeof entry === "function") {
    return async () => {
      const mod = await (entry as () => Promise<{ default: Page }>)();
      const p = mod.default;
      if (!isPage(p)) {
        throw new Error(
          "[mado] Lazy route did not return page({...}) as the default export.",
        );
      }
      return p;
    };
  }
  throw new Error("[mado] Invalid entry in routes(): " + String(entry));
}
