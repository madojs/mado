/**
 * routes() — high-level manifest router with lazy loading, layouts,
 * prefetch and a sync-fast-path for already-loaded pages.
 *
 * On top of the raw router() from navigation.ts this adds:
 *   - dynamic-import loaders (code splitting via `() => import(...)`),
 *   - route groups with layouts (via page.ts: layout({ layout, routes })),
 *   - per-instance module cache (not global — two routes() calls
 *     in the same process do NOT interfere),
 *   - hover prefetch and programmatic prefetchPath(),
 *   - smart loadingDelay (no progress-bar flicker on fast networks),
 *   - sync-fast-path: if the page is already in cache — renders synchronously,
 *     without loading state and without a microtask. Removes flicker on back/forward.
 */
import { type TemplateResult } from "../html/template-types.js";
import { type RouteParams, type RoutesMap } from "./match.js";
import { type RouterApi } from "./navigation.js";
export interface RoutesOptions {
    /**
     * TemplateResult while the module is loading. Default — thin
     * progress bar at the top (see defaultLoadingView). If the page is in cache,
     * loading is not shown at all (sync render).
     */
    loading?: () => TemplateResult;
    /** TemplateResult if the import threw. */
    error?: (err: Error) => TemplateResult;
    /**
     * Route-level error boundary for lazy import, load() and view() errors.
     * A page's local `errorView` wins when present.
     */
    errorPage?: (err: Error, params: RouteParams) => TemplateResult;
    /** Prefix for document.title (e.g. ' · MyApp'). */
    titleSuffix?: string;
    /**
     * Delay before showing the loading view in ms. If loading
     * finishes faster — loading is not shown, the ready page renders immediately.
     * Guards against flicker on fast connections.
     * Default 100ms. Set to 0 to disable.
     */
    loadingDelay?: number;
    /**
     * Use View Transitions API on navigation (smooth crossfade).
     * Default true.
     */
    viewTransitions?: boolean;
    /**
     * Restore saved scroll on back/forward and scroll new navigations to top.
     * Default true.
     */
    scrollRestoration?: boolean;
    /**
     * Move focus to the main content landmark after navigation.
     * Default true.
     */
    focusManagement?: boolean;
}
/**
 * Create a router from a manifest. Returns the same RouterApi as router().
 */
export declare function routes(manifest: RoutesMap, options?: RoutesOptions): RouterApi;
/**
 * Prefetch-load modules for a path (hover, programmatic).
 * Safe to call repeatedly — cached.
 *
 * Iterates all active routes() and starts loaders for matched entries.
 * If there is no active routes() — no-op.
 */
export declare function prefetchPath(pathname: string): void;
