/**
 * Pure pattern matching + flatten/normalize of the manifest.
 *
 * There is NO window/document/history or signals here — only functions
 * over strings and objects. This allows:
 *   - testing routing in Node without jsdom;
 *   - reusing the same compile/regex in static discovery / prefetch without duplication.
 */
import { isPage, type Guard, type Page, type RouteEntry } from "../page.js";
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
export declare function compile(pattern: string, handler: RouteHandler): CompiledRoute;
/**
 * Find the first matching CompiledRoute for path. Returns already
 * decoded params (decodeURIComponent on each segment).
 * Wildcard (`*`) is skipped — handle it separately as a fallback.
 */
export declare function matchRoute(path: string, compiled: readonly CompiledRoute[]): {
    route: CompiledRoute;
    params: RouteParams;
} | null;
/** Simple regex WITHOUT keys — for prefetch (we only need the match fact). */
export declare function patternToRegex(pattern: string): RegExp;
/**
 * Extract `:key` names from a route pattern, in declaration order.
 * Used by static discovery and prefetch URL synthesis; centralised here so
 * the two pipelines stay in sync.
 */
export declare function paramKeys(pattern: string): string[];
/**
 * Materialise a route pattern into a concrete pathname by substituting
 * declared `:key` placeholders with URL-encoded values from `params`.
 * Throws with route context when a required param is missing or the
 * resulting URL contains query / fragment.
 */
export declare function applyParams(pattern: string, params: Record<string, string>): string;
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
export declare function flatten(map: RoutesMap, prefix?: string, layouts?: FlatEntry["layouts"], guards?: Guard[]): Array<[string, FlatEntry]>;
/** Careful path segment joining without duplicate slashes. */
export declare function joinPath(a: string, b: string): string;
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
export declare function normalize(entry: RouteEntry): () => Promise<Page> | Page;
