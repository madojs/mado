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

import { signal } from "../signal.js";
import { html } from "../html/template.js";
import type { TemplateResult } from "../html/template-types.js";
import type { Guard, GuardResult, Page, PageContext } from "../page.js";
import { applyHead } from "../head.js";
import {
  createLifecycle,
  getCurrentLifecycle,
  runInLifecycle,
  type LifecycleHandle,
} from "../lifecycle.js";
import {
  flatten,
  patternToRegex,
  type FlatEntry,
  type RouteParams,
  type Routes,
  type RoutesMap,
} from "./match.js";
import { navigate, router, type RouterApi } from "./navigation.js";
import {
  beginStaticRoute,
  consumeStaticSeed,
  markStaticRouteReady,
  recordStaticError,
  setStaticRouterState,
  trackStatic,
} from "../static-runtime.js";
import type { JsonValue } from "../page.js";

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
 * Internal state for one routes() instance. Previously these Maps
 * were global — two routes() calls interfered. Now each
 * routes() has its own context.
 */
interface RoutesContext {
  moduleCache: Map<unknown, Page>;
  pathToFlat: Map<string, FlatEntry>;
  compiledForPrefetch: Array<{ regex: RegExp; entry: FlatEntry }>;
  renderSeq: number;
  /**
   * Lifecycle of the page currently visible on screen. Disposed and
   * replaced on every navigation so that resource() / effect() / persisted()
   * subscriptions created inside page.view() are cleaned up exactly when
   * the page leaves — no leak, no "resource-outside-lifecycle" warning.
   */
  activeLifecycle: LifecycleHandle | null;
  /**
   * Build-time seed for the current render pass. Consumed exactly once per
   * route commit from `<script data-mado-static-data>` (see consumeStaticSeed)
   * and passed to both `page.head(params, seed)` and `page.load(params, seed)`.
   * Cleared on every new render so SPA navigations never see stale data.
   */
  currentSeed: JsonValue | undefined;
}

/**
 * Registry of active RoutesContexts. Used by the global
 * prefetchPath() — iterates over all active instances. On router.dispose()
 * the corresponding context is removed from the registry.
 */
const activeRoutes = new Set<RoutesContext>();
const MAX_GUARD_REDIRECTS_PER_TICK = 10;
let guardRedirectsThisTick = 0;
let guardRedirectResetScheduled = false;

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
    activeLifecycle: null,
    currentSeed: undefined,
  };
  activeRoutes.add(ctx);

  const flat = flatten(manifest);
  const lowLevel: Routes = {};
  for (const [pattern, entry] of flat) {
    lowLevel[pattern] = (params) => {
      // One canonical place where the build-time seed is consumed for a
      // route commit; both head() and load() then receive the same value.
      const pathname =
        typeof location !== "undefined" ? location.pathname : "/";
      ctx.currentSeed = consumeStaticSeed(pathname);
      beginStaticRoute(pathname);
      return renderEntry(ctx, entry, params, options, ++ctx.renderSeq);
    };
    ctx.pathToFlat.set(pattern, entry);
    if (pattern !== "*") {
      ctx.compiledForPrefetch.push({ regex: patternToRegex(pattern), entry });
    }
  }

  const api = router(lowLevel, {
    viewTransitions: options.viewTransitions,
    scrollRestoration: options.scrollRestoration,
    focusManagement: options.focusManagement,
    // Raise prefetch into sub-router: hover on a link → find matching FlatEntry → load loader + layouts.
    prefetch: (pathname) => prefetchPathInContext(ctx, pathname),
  });
  const origDispose = api.dispose;
  api.dispose = () => {
    activeRoutes.delete(ctx);
    // Tear down the last page's lifecycle so its resource()/effect()
    // subscriptions are released when the whole router is disposed
    // (test isolation, hot reload, etc.).
    ctx.activeLifecycle?.dispose();
    ctx.activeLifecycle = null;
    origDispose();
  };
  return api;
}

/**
 * Open a fresh page lifecycle for the current render, disposing the
 * previous page's lifecycle. Called right before any page.view() or
 * layout.view() runs so that resource()/effect() created inside view
 * find a `getCurrentLifecycle()` and register their cleanup with it.
 *
 * This is the single canonical place where page-level lifecycle is
 * opened — `page.view()` is the documented place to create resources
 * (see pitfalls + starter examples). Without this wrapper, calling
 * `resource()` in view emits a [mado:resource-outside-lifecycle]
 * warning even when used correctly.
 */
function openPageLifecycle(ctx: RoutesContext): LifecycleHandle {
  ctx.activeLifecycle?.dispose();
  const lc = createLifecycle();
  ctx.activeLifecycle = lc;
  return lc;
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
  const loaded = loader();
  const p = await trackIfPromise(loaded, "route module");
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
 *
 * `seed` is the build-time static seed consumed once per route commit and
 * passed through both head() and load(); it is `undefined` for SPA
 * navigations and for non-static routes.
 */
function applyPageMeta(
  page: Page,
  params: RouteParams,
  seed: JsonValue | undefined,
  options: RoutesOptions,
): void {
  const title =
    typeof page.title === "function" ? page.title(params) : page.title;
  if (title) {
    document.title = title + (options.titleSuffix ?? "");
  }
  if (!page.head) {
    applyHead({});
    return;
  }
  try {
    applyHead(page.head(params, seed));
  } catch (err) {
    applyHead({});
    recordStaticError(err);
    // eslint-disable-next-line no-console
    console.error("[mado] page.head() threw:", err);
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
  // Only available when (a) the page+layouts are cached AND (b) there are no
  // guards OR every guard is synchronous and returns void. Anything more
  // complex (async guards, redirects) must take the async path so we never
  // render a route the guard would have stopped.
  const sync = tryLoadSync(ctx, entry);
  const syncGuardVerdict =
    sync && entry.guards.length === 0
      ? null
      : sync
        ? trySyncGuards(entry.guards, params)
        : undefined;
  if (sync && syncGuardVerdict === null) {
    setStaticRouterState("render:sync");
    const seed = ctx.currentSeed;
    applyPageMeta(sync.page, params, seed, options);
    try {
      // Combine sync layouts with any guard-injected page guards' layouts is
      // a future concern; today guards never return a layout.
      // Combine guards' page-level guards as a fast-path check.
      const pageGuards = collectPageGuards(sync.page);
      if (pageGuards.length > 0) {
        const v = trySyncGuards(pageGuards, params);
        // `v === undefined` would mean an async page-guard slipped past the
        // outer sync check; today that can't happen, but bail to async path
        // defensively.
        if (v) return renderGuardVerdictSync(v, options);
        if (v === undefined) {
          // Fall through to async path by skipping the sync return; rebuild
          // the render via a fresh entry-render call would be ideal, but for
          // now log and render nothing. Pages with async guards will not hit
          // sync fast path because trySyncGuards on entry.guards already
          // returned undefined and we never enter this block in that case.
          return html``;
        }
      }
      const lc = openPageLifecycle(ctx);
      const view = runInLifecycle(lc, () =>
        renderWithLayouts(sync.page, sync.layouts, params, seed),
      );
      // Seed is one-shot; SPA-navigated re-renders must not see it again.
      ctx.currentSeed = undefined;
      markStaticRouteReady("ready");
      return view;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      recordStaticError(e);
      markStaticRouteReady("error");
      return renderError(e, params, options, sync.page);
    }
  }
  if (sync && syncGuardVerdict) {
    setStaticRouterState("guard");
    return renderGuardVerdictSync(syncGuardVerdict, options);
  }

  // ---------- ASYNC PATH ----------
  setStaticRouterState("loading");
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

  (async () => {
    try {
      const [pg, ...lts] = await Promise.all([
        loadPage(ctx, entry.loader),
        ...entry.layouts.map((l) => loadPage(ctx, l)),
      ]);
      if (isStale(ctx, seq)) {
        resolved = true;
        if (timer) clearTimeout(timer);
        return;
      }
      // Guards: parent-group guards (entry.guards) first, then the page's own.
      // Fast path: skip the await entirely when there are no guards, so we do
      // not introduce an extra microtask versus the pre-guards behavior.
      const pageGuards = collectPageGuards(pg as Page);
      let verdict:
        | { kind: "redirect"; to: string; replace?: boolean }
        | { kind: "halt" }
        | null = null;
      if (entry.guards.length > 0 || pageGuards.length > 0) {
        verdict = await trackStatic(
          runGuards([...entry.guards, ...pageGuards], params),
          "route guards",
        );
      }
      resolved = true;
      if (timer) clearTimeout(timer);
      if (isStale(ctx, seq)) return;
      if (verdict) {
        setStaticRouterState(`guard:${verdict.kind}`);
        applyGuardVerdict(verdict);
        if (verdict.kind === "halt") markStaticRouteReady("halted");
        // After a redirect we leave `idle` so nothing flashes; the new route
        // will start its own render cycle.
        return;
      }
      applyPageMeta(pg as Page, params, ctx.currentSeed, options);
      state.set({ kind: "ready", page: pg as Page, layouts: lts as Page[] });
      markStaticRouteReady("ready");
    } catch (err: unknown) {
      resolved = true;
      if (timer) clearTimeout(timer);
      if (isStale(ctx, seq)) return;
      const e = err instanceof Error ? err : new Error(String(err));
      recordStaticError(e);
      markStaticRouteReady("error");
      state.set({ kind: "error", err: e });
    }
  })();

  return html`${() => {
    const s = state();
    if (s.kind === "idle") return "";
    if (s.kind === "loading") {
      return options.loading?.() ?? defaultLoadingView();
    }
    if (s.kind === "error") {
      return renderError(s.err, params, options);
    }
    try {
      const lc = openPageLifecycle(ctx);
      const seed = ctx.currentSeed;
      const view = runInLifecycle(lc, () =>
        renderWithLayouts(s.page, s.layouts, params, seed),
      );
      ctx.currentSeed = undefined;
      return view;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      recordStaticError(e);
      markStaticRouteReady("error");
      return renderError(e, params, options, s.page);
    }
  }}`;
}

function isStale(ctx: RoutesContext, seq: number): boolean {
  return seq !== ctx.renderSeq;
}

function renderError(
  err: Error,
  params: RouteParams,
  options: RoutesOptions,
  page?: Page,
): TemplateResult {
  if (page?.errorView) return page.errorView(err, params);
  if (options.errorPage) return options.errorPage(err, params);
  return options.error?.(err) ?? html`<pre>${err.message}</pre>`;
}

// ---------- Guards ----------

function collectPageGuards(page: Page): Guard[] {
  if (!page.guard) return [];
  return Array.isArray(page.guard) ? page.guard : [page.guard];
}

/**
 * Run guards in order and return the first non-pass verdict, or `null` if all
 * pass. Async-aware.
 */
async function runGuards(
  guards: Guard[],
  params: RouteParams,
): Promise<{ kind: "redirect"; to: string; replace?: boolean } | { kind: "halt" } | null> {
  const path =
    typeof location !== "undefined" ? location.pathname + location.search : "/";
  for (const g of guards) {
    let v;
    try {
      v = await g({ params, path });
    } catch (err) {
      // A guard that throws is treated like "halt" — surface the error to the
      // console but do not render the page.
      // eslint-disable-next-line no-console
      console.error("[mado] guard threw:", err);
      return { kind: "halt" };
    }
    const verdict = normalizeGuardResult(v);
    if (!verdict) continue;
    return verdict;
  }
  return null;
}

/**
 * Fast-path: run synchronous guards only. Returns:
 *   null      → all passed
 *   verdict   → first non-pass verdict
 *   undefined → at least one guard is async, fall through to async path
 */
function trySyncGuards(
  guards: Guard[],
  params: RouteParams,
):
  | { kind: "redirect"; to: string; replace?: boolean }
  | { kind: "halt" }
  | null
  | undefined {
  const path =
    typeof location !== "undefined" ? location.pathname + location.search : "/";
  for (const g of guards) {
    let v;
    try {
      v = g({ params, path });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[mado] guard threw:", err);
      return { kind: "halt" };
    }
    if (v && typeof (v as Promise<unknown>).then === "function") return undefined;
    const verdict = normalizeGuardResult(v as GuardResult);
    if (!verdict) continue;
    return verdict;
  }
  return null;
}

function normalizeGuardResult(
  verdict: GuardResult,
): { kind: "redirect"; to: string; replace?: boolean } | { kind: "halt" } | null {
  if (verdict === undefined || verdict === true) return null;
  if (verdict === false) return { kind: "halt" };
  if (typeof verdict === "string") return { kind: "redirect", to: verdict };
  if ("redirect" in verdict) {
    return { kind: "redirect", to: verdict.redirect, replace: verdict.replace };
  }
  if (verdict.halt) return { kind: "halt" };
  return null;
}

function applyGuardVerdict(
  v: { kind: "redirect"; to: string; replace?: boolean } | { kind: "halt" },
): void {
  if (v.kind === "redirect") {
    navigateFromGuard(v.to, v.replace);
  }
  // "halt" — render nothing; caller already aborted.
}

function renderGuardVerdictSync(
  v: { kind: "redirect"; to: string; replace?: boolean } | { kind: "halt" },
  _options: RoutesOptions,
): TemplateResult {
  // We can't synchronously navigate during the same render frame without
  // re-entering router code; queue a microtask so the current render
  // finishes cleanly, then redirect.
  if (v.kind === "redirect") {
    queueMicrotask(() => navigateFromGuard(v.to, v.replace));
  }
  return html``;
}

function navigateFromGuard(to: string, replace?: boolean): void {
  if (!guardRedirectResetScheduled) {
    guardRedirectResetScheduled = true;
    setTimeout(() => {
      guardRedirectsThisTick = 0;
      guardRedirectResetScheduled = false;
    }, 0);
  }

  guardRedirectsThisTick++;
  if (guardRedirectsThisTick > MAX_GUARD_REDIRECTS_PER_TICK) {
    // eslint-disable-next-line no-console
    console.error(
      "[mado] guard redirect loop detected: more than " +
        `${MAX_GUARD_REDIRECTS_PER_TICK} redirects in one tick; halted at ${to}.`,
    );
    return;
  }

  navigate(to, { replace: replace ?? true });
}

/**
 * Wrap a page's view in layouts (from inner to outer).
 * Each layout receives `child` = TemplateResult of the child page or
 * next layout — composes like a matryoshka.
 *
 * `seed` is the build-time static seed (or undefined for SPA navigation).
 * It is passed to `page.load(params, seed)`; if no `load` is declared the
 * seed itself becomes the view's data so static-only pages render their
 * initial data without needing a runtime loader.
 */
function renderWithLayouts(
  page: Page,
  layouts: Page[],
  params: RouteParams,
  seed: JsonValue | undefined,
): TemplateResult {
  // Contract: page.load receives the seed; when no load is declared the
  // seed itself is the runtime data (otherwise static-only pages would
  // lose their initial data after head() has consumed it).
  const data = page.load ? page.load(params, seed) : (seed as unknown);

  // Expose onDispose to page views so they can clean up timers, manual
  // subscriptions, etc. that aren't auto-managed by resource()/effect().
  const lc = getCurrentLifecycle();
  const onDispose = lc ? (fn: () => void) => lc.onDispose(fn) : undefined;

  let view: TemplateResult = page.view({
    params,
    data,
    path: () => location.pathname,
    child: null,
    onDispose,
  } as PageContext<RouteParams, unknown>);

  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i]!;
    const layoutData = layout.load ? layout.load(params) : undefined;
    view = layout.view({
      params,
      data: layoutData,
      path: () => location.pathname,
      child: view,
      onDispose,
    } as PageContext<RouteParams, unknown>);
  }

  return view;
}

function trackIfPromise<T>(value: T | Promise<T>, label: string): Promise<T> {
  return value && typeof (value as Promise<T>).then === "function"
    ? trackStatic(value as Promise<T>, label)
    : Promise.resolve(value as T);
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

// ---------- Test hooks ----------

/** @internal */
export const _testHooks = {
  activeRoutesSize(): number {
    return activeRoutes.size;
  },
};
