/**
 * Pure pattern matching + flatten/normalize of the manifest.
 *
 * There is NO window/document/history or signals here — only functions
 * over strings and objects. This allows:
 *   - testing routing in Node without jsdom;
 *   - reusing the same compile/regex in static discovery / prefetch without duplication.
 */

import {
  isLayoutGroup,
  isPage,
  type Guard,
  type Page,
  type RouteEntry,
} from "../page.js";

// Re-export isPage so build-time tooling (scripts/static/discover.mjs)
// can pull every routing helper it needs from a single module.
export { isPage };
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
  const re = routePatternSource(pattern, keys);
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
  const re = routePatternSource(pattern);
  return new RegExp(`^${re}/?$`);
}

function routePatternSource(pattern: string, keys?: string[]): string {
  const input = pattern.replace(/\/$/, "");
  let source = "";
  let cursor = 0;
  const params = /:([\w]+)/g;
  for (const match of input.matchAll(params)) {
    const index = match.index ?? 0;
    source += escapeRegex(input.slice(cursor, index));
    source += "([^/]+)";
    keys?.push(match[1]!);
    cursor = index + match[0].length;
  }
  return source + escapeRegex(input.slice(cursor));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract `:key` names from a route pattern, in declaration order.
 * Used by static discovery and prefetch URL synthesis; centralised here so
 * the two pipelines stay in sync.
 */
export function paramKeys(pattern: string): string[] {
  const keys: string[] = [];
  pattern.replace(/:([\w]+)/g, (_m, key) => {
    keys.push(key);
    return "";
  });
  return keys;
}

/**
 * Materialise a route pattern into a concrete pathname by substituting
 * declared `:key` placeholders with URL-encoded values from `params`.
 * Throws with route context when a required param is missing or the
 * resulting URL contains query / fragment.
 */
export function applyParams(
  pattern: string,
  params: Record<string, string>,
): string {
  if (pattern === "/") return "/";
  const pathname = pattern.replace(/:([\w]+)/g, (_m, key) => {
    const value = params[key];
    if (value == null) {
      throw new Error(`[mado] missing param :${key} for ${pattern}`);
    }
    return encodeURIComponent(String(value));
  });
  if (pathname.includes("?") || pathname.includes("#")) {
    throw new Error(
      `[mado] ${pattern}: query strings and fragments are not part of a route pathname.`,
    );
  }
  const absolute = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return absolute.length > 1 && absolute.endsWith("/")
    ? absolute.slice(0, -1)
    : absolute;
}

// ---------- Manifest (routes()) ----------


export type RoutesMap = Record<string, RouteEntry>;

export interface FlatEntry {
  loader: () => Promise<Page> | Page;
  layouts: Array<() => Promise<Page> | Page>;
  /**
   * Guards inherited from enclosing layout groups, outer → inner.
   * The page may add its own via `Page.guard` — those run last.
   */
  guards: Guard[];
}

/**
 * Unfold a layout-group manifest into a flat list of `[fullPattern, FlatEntry]`.
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
    if (isLayoutGroup(v)) {
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
