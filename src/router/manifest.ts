/**
 * routes() — high-level manifest router with lazy loading, layouts,
 * prefetch and a sync-fast-path for already-loaded pages.
 *
 * On top of the raw router() from navigation.ts this adds:
 *   - dynamic-import loaders (code splitting via `() => import(...)`),
 *   - nested routes with layouts (via page.ts: nested({ layout, routes })),
 *   - per-instance module cache (not global — two routes() calls
 *     in the same process do NOT interfere),
 *   - hover prefetch and programmatic prefetchPath(),
 *   - smart loadingDelay (no progress-bar flicker on fast networks),
 *   - sync-fast-path: if the page is already in cache — renders synchronously,
 *     without loading state and without a microtask. Removes flicker on back/forward.
 */

import { signal } from "../signal.js";
import { html } from "../html/template.js";
import type { TemplateResult } from "../html/template-types.js";
import type { Page, PageContext } from "../page.js";
import { applyHead } from "../head.js";
import {
  flatten,
  patternToRegex,
  type FlatEntry,
  type RouteParams,
  type Routes,
  type RoutesMap,
} from "./match.js";
import { router, type RouterApi } from "./navigation.js";

export interface RoutesOptions {
  /**
   * TemplateResult while the module is loading. Default — thin
   * progress bar at the top (see defaultLoadingView). If the page is in cache,
   * loading is not shown at all (sync render).
   */
  loading?: () => TemplateResult;
  /** TemplateResult if the import threw. */
  error?: (err: Error) => TemplateResult;
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
}

/**
 * Internal state for one routes() instance. Previously these Maps
 * were global — two routes() calls interfered. Now each
 * routes() has its own context.
 */
interface RoutesContext {
  moduleCache: Map<unknown, Page>;
  pathToFlat: Map<string, FlatEntry>;
  compiledForPrefetch: Array<{ regex: RegExp; entry: FlatEntry }>;
  renderSeq: number;
}

/**
 * Registry of active RoutesContexts. Used by the global
 * prefetchPath() — iterates over all active instances. On router.dispose()
 * the corresponding context is removed from the registry.
 */
const activeRoutes = new Set<RoutesContext>();

/**
 * Create a router from a manifest. Returns the same RouterApi as router().
 */
export function routes(
  manifest: RoutesMap,
  options: RoutesOptions = {},
): RouterApi {
  const ctx: RoutesContext = {
    moduleCache: new Map(),
    pathToFlat: new Map(),
    compiledForPrefetch: [],
    renderSeq: 0,
  };
  activeRoutes.add(ctx);

  const flat = flatten(manifest);
  const lowLevel: Routes = {};
  for (const [pattern, entry] of flat) {
    lowLevel[pattern] = (params) =>
      renderEntry(ctx, entry, params, options, ++ctx.renderSeq);
    ctx.pathToFlat.set(pattern, entry);
    if (pattern !== "*") {
      ctx.compiledForPrefetch.push({ regex: patternToRegex(pattern), entry });
    }
  }

  const api = router(lowLevel, {
    viewTransitions: options.viewTransitions,
  // Raise prefetch into sub-router: hover on a link → find matching FlatEntry → load loader + layouts.
  prefetch: (pathname) => prefetchPathInContext(ctx, pathname),
  });
  const origDispose = api.dispose;
  api.dispose = () => {
    activeRoutes.delete(ctx);
    origDispose();
  };
  return api;
}

// ---------- prefetch ----------

/**
 * Prefetch-load modules for a path (hover, programmatic).
 * Safe to call repeatedly — cached.
 *
 * Iterates all active routes() and starts loaders for matched entries.
 * If there is no active routes() — no-op.
 */
export function prefetchPath(pathname: string): void {
  for (const ctx of activeRoutes) {
    prefetchPathInContext(ctx, pathname);
  }
}

function prefetchPathInContext(ctx: RoutesContext, pathname: string): void {
  const exact = ctx.pathToFlat.get(pathname);
  const entry =
    exact ?? ctx.compiledForPrefetch.find((c) => c.regex.test(pathname))?.entry;
  if (!entry) return;
  loadPage(ctx, entry.loader).catch(() => {});
  for (const lt of entry.layouts) loadPage(ctx, lt).catch(() => {});
}

// ---------- Loading ----------


async function loadPage(
  ctx: RoutesContext,
  loader: () => Promise<Page> | Page,
): Promise<Page> {
  const cached = ctx.moduleCache.get(loader);
  if (cached) return cached;
  const p = await loader();
  ctx.moduleCache.set(loader, p);
  return p;
}

/**
 * Synchronous cache check. If all modules (page + layouts)
 * are already loaded — returns them without a Promise. This allows
 * renderEntry to render the page without loading state and without a microtask.
 */
function tryLoadSync(
  ctx: RoutesContext,
  entry: FlatEntry,
): { page: Page; layouts: Page[] } | undefined {
  const page = ctx.moduleCache.get(entry.loader);
  if (!page) return undefined;
  const layouts: Page[] = [];
  for (const l of entry.layouts) {
    const lp = ctx.moduleCache.get(l);
    if (!lp) return undefined;
    layouts.push(lp);
  }
  return { page, layouts };
}

// ---------- Render ----------


/**
 * Apply the page's title/head. Extracted from renderEntry so it
 * can be called from both the async and sync branch.
 */
function applyPageMeta(
  page: Page,
  params: RouteParams,
  options: RoutesOptions,
): void {
  const title =
    typeof page.title === "function" ? page.title(params) : page.title;
  if (title) {
    document.title = title + (options.titleSuffix ?? "");
  }
  if (page.head) {
    try {
      const baked = readBaked<unknown>();
      applyHead(page.head(params, baked));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mado] page.head() threw:", err);
    }
  }
}

/**
 * SYNC FAST PATH: if the page is already in moduleCache, we render it
 * right now, without loading state and without a microtask. This removes
 * blank/progress flicker on repeat navigations.
 *
 * ASYNC PATH: on a cold navigation the module still needs to be loaded.
 * To avoid flickering with a loading view on fast networks, we use
 * `loadingDelay` (default 100ms): if loading finishes within that time
 * — render the ready page immediately; otherwise show loading.
 */
function renderEntry(
  ctx: RoutesContext,
  entry: FlatEntry,
  params: RouteParams,
  options: RoutesOptions,
  seq: number,
): TemplateResult {
  // ---------- SYNC FAST PATH ----------
  const sync = tryLoadSync(ctx, entry);
  if (sync) {
    applyPageMeta(sync.page, params, options);
    try {
      return renderWithLayouts(sync.page, sync.layouts, params);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (sync.page.errorView) return sync.page.errorView(e, params);
      return options.error?.(e) ?? html`<pre>${e.message}</pre>`;
    }
  }

  // ---------- ASYNC PATH ----------
  // 'idle' — first window (until loadingDelay): render empty to avoid
  // progress-bar flicker on fast connections.
  // 'loading' — module didn't arrive in time → show loading.
  // 'ready' / 'error' — final states.
  const state = signal<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; err: Error }
    | { kind: "ready"; page: Page; layouts: Page[] }
  >({ kind: "idle" });

  let resolved = false;
  const delay = options.loadingDelay ?? 100;
  const timer =
    delay > 0
      ? setTimeout(() => {
          if (!resolved && !isStale(ctx, seq)) state.set({ kind: "loading" });
        }, delay)
      : null;
  // delay = 0 means show loading immediately.
  if (delay === 0 && !isStale(ctx, seq)) state.set({ kind: "loading" });

  Promise.all([
    loadPage(ctx, entry.loader),
    ...entry.layouts.map((l) => loadPage(ctx, l)),
  ]).then(
    ([pg, ...lts]) => {
      resolved = true;
      if (timer) clearTimeout(timer);
      if (isStale(ctx, seq)) return;
      applyPageMeta(pg, params, options);
      state.set({ kind: "ready", page: pg, layouts: lts });
    },
    (err: unknown) => {
      resolved = true;
      if (timer) clearTimeout(timer);
      if (isStale(ctx, seq)) return;
      const e = err instanceof Error ? err : new Error(String(err));
      state.set({ kind: "error", err: e });
    },
  );

  return html`${() => {
    const s = state();
    if (s.kind === "idle") return "";
    if (s.kind === "loading") {
      return options.loading?.() ?? defaultLoadingView();
    }
    if (s.kind === "error") {
      return options.error?.(s.err) ?? html`<pre>${s.err.message}</pre>`;
    }
    try {
      return renderWithLayouts(s.page, s.layouts, params);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (s.page.errorView) return s.page.errorView(e, params);
      return options.error?.(e) ?? html`<pre>${e.message}</pre>`;
    }
  }}`;
}

function isStale(ctx: RoutesContext, seq: number): boolean {
  return seq !== ctx.renderSeq;
}

/**
 * Wrap a page's view in layouts (from inner to outer).
 * Each layout receives `child` = TemplateResult of the nested page or
 * next layout — composes like a matryoshka.
 */
function renderWithLayouts(
  page: Page,
  layouts: Page[],
  params: RouteParams,
): TemplateResult {
  const baked = readBaked<unknown>();
  const data = page.load ? page.load(params, baked) : undefined;

  let view: TemplateResult = page.view({
    params,
    data,
    path: () => location.pathname,
    child: null,
  } as PageContext<RouteParams, unknown>);

  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i]!;
    const layoutData = layout.load ? layout.load(params) : undefined;
    view = layout.view({
      params,
      data: layoutData,
      path: () => location.pathname,
      child: view,
    } as PageContext<RouteParams, unknown>);
  }

  return view;
}

// ---------- Default loading view ----------
//
// Thin progress bar at the top of the screen. Style is injected once
// globally (lazy, on first show). No animations for prefers-reduced-motion.

const DEFAULT_LOADING_STYLE_ID = "mado-default-loading-style";
const DEFAULT_LOADING_CSS = `
  @keyframes mado-progress {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(0%);    }
    100% { transform: translateX(100%);  }
  }
  .mado-progress-bar {
    position: fixed; top: 0; left: 0; right: 0;
    height: 2px; background: rgba(0,0,0,.06);
    z-index: 2147483647; overflow: hidden;
    pointer-events: none;
  }
  .mado-progress-bar::after {
    content: ""; display: block; height: 100%; width: 40%;
    background: currentColor; opacity: .8;
    animation: mado-progress 1.2s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mado-progress-bar::after { animation: none; width: 100%; }
  }
`;

function ensureDefaultLoadingStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(DEFAULT_LOADING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DEFAULT_LOADING_STYLE_ID;
  style.textContent = DEFAULT_LOADING_CSS;
  document.head.appendChild(style);
}

function defaultLoadingView(): TemplateResult {
  ensureDefaultLoadingStyle();
  return html`<div class="mado-progress-bar" aria-hidden="true"></div>`;
}

/**
 * Read baked data from `<script id="bake" type="application/json">`
 * placed by `scripts/bake.mjs` during static generation. Returns
 * undefined in SPA mode.
 */
function readBaked<T>(): T | undefined {
  const el = document.getElementById("bake");
  if (!el || el.textContent == null) return undefined;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return undefined;
  }
}

// ---------- Test hooks ----------

export const _testHooks = {
  activeRoutesSize(): number {
    return activeRoutes.size;
  },
};
