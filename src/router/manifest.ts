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
import { reportError } from "../diagnostics.js";
import { emitDevtools } from "../devtools-hook.js";
import { html } from "../html/template.js";
import type { TemplateResult } from "../html/template-types.js";
import type { Guard, GuardResult, HeadMeta, Page, PageContext } from "../page.js";
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
import { stripBase } from "./base.js";
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
  guardRedirects: number;
  /**
   * Lifecycle of the page currently visible on screen. Disposed and
   * replaced on every navigation so that resource() / effect() / persisted()
   * subscriptions created inside page.view() are cleaned up exactly when
   * the page leaves — no leak, no "resource-outside-lifecycle" warning.
   */
  activeLifecycle: LifecycleHandle | null;
  /**
   * Build-time seed for the current route commit. Consumed exactly once per
   * pathname from `<script data-mado-static-data>` (see consumeStaticSeed)
   * and held here for the duration of the route's render passes so both
   * head() and load() receive the same value — `routes()` may re-evaluate
   * `view()` several times (idle → ready, layout re-runs) and re-calling
   * `consumeStaticSeed()` would return undefined because the script element
   * is removed on first read.
   *
   * Cleared the moment we observe a navigation to a different pathname,
   * which guarantees SPA navigations never inherit a stale seed.
   */
  seedForPathname: { pathname: string; value: JsonValue | undefined } | null;
}

/**
 * Registry of active RoutesContexts. Used by the global
 * prefetchPath() — iterates over all active instances. On router.dispose()
 * the corresponding context is removed from the registry.
 */
const activeRoutes = new Set<RoutesContext>();
const MAX_GUARD_REDIRECTS = 10;

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
    guardRedirects: 0,
    activeLifecycle: null,
    seedForPathname: null,
  };
  activeRoutes.add(ctx);

  const flat = flatten(manifest);
  const lowLevel: Routes = {};
  for (const [pattern, entry] of flat) {
    lowLevel[pattern] = (params) => {
      // Use the ROUTE pathname (Vite base already stripped) so the seed
      // attribute written at capture time matches the lookup at runtime
      // boot regardless of which base the app deploys under.
      const pathname =
        typeof location !== "undefined" ? stripBase(location.pathname) : "/";
      // Seed lifecycle: consume exactly once per pathname (the script is
      // removed on first read), then keep the value in ctx so subsequent
      // render passes for the same route commit see the same seed. A new
      // pathname triggers begin-route + a fresh consume; navigating back
      // to a previous static URL returns undefined because the script is
      // already gone from the document.
      if (ctx.seedForPathname?.pathname !== pathname) {
        ctx.seedForPathname = {
          pathname,
          value: consumeStaticSeed(pathname),
        };
        beginStaticRoute(pathname);
      }
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
function disposeActiveLifecycle(ctx: RoutesContext): void {
  ctx.activeLifecycle?.dispose();
  ctx.activeLifecycle = null;
}

function renderInPageLifecycle<T>(ctx: RoutesContext, render: () => T): T {
  const lc = createLifecycle();
  try {
    const value = runInLifecycle(lc, render);
    ctx.activeLifecycle = lc;
    return value;
  } catch (err) {
    lc.dispose();
    throw err;
  }
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
  const pageTitle =
    typeof page.title === "function" ? page.title(params) : page.title;
  let head: HeadMeta = {};
  if (!page.head) {
    applyHead({});
  } else {
    try {
      head = page.head(params, seed);
      applyHead(head);
    } catch (err) {
      applyHead({});
      recordStaticError(err);
      reportError("router", "page-head", "page.head() threw", err);
    }
  }
  const title = head.title ?? pageTitle;
  document.title = title ? title + (options.titleSuffix ?? "") : "";
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
  if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:navigation", ctx, {
    seq,
    path: typeof location !== "undefined" ? location.pathname + location.search : "/",
    params,
  });
  // Navigation owns the currently visible page lifecycle. Dispose it before
  // loaders/guards begin so halted, redirected and failed navigations cannot
  // leave the previous page's effects alive behind a loading shell.
  disposeActiveLifecycle(ctx);

  // ---------- SYNC FAST PATH ----------
  // Only available when (a) the page+layouts are cached AND (b) there are no
  // guards OR every guard is synchronous and returns void. Anything more
  // complex (async guards, redirects) must take the async path so we never
  // render a route the guard would have stopped.
  const sync = tryLoadSync(ctx, entry);
  const hasGuards = !!sync && (
    entry.guards.length > 0 || collectPageGuards(sync.page).length > 0
  );
  if (sync && !hasGuards) {
    setStaticRouterState("render:sync");
    const seed = ctx.seedForPathname?.value;
    try {
      const view = renderInPageLifecycle(ctx, () =>
        renderWithLayouts(sync.page, sync.layouts, params, seed),
      );
      applyPageMeta(sync.page, params, seed, options);
      ctx.guardRedirects = 0;
      markStaticRouteReady("ready");
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:ready", ctx, { seq, params, mode: "sync" });
      return view;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      recordStaticError(e);
      markStaticRouteReady("error");
      return renderError(e, params, options, sync.page);
    }
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
    | { kind: "guard" }
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
        state.set({ kind: "guard" });
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:guard", ctx, { seq, verdict });
        applyGuardVerdict(ctx, verdict);
        if (verdict.kind === "halt") {
          ctx.guardRedirects = 0;
          markStaticRouteReady("halted");
        }
        // The guard state removes any immediate loading view; a redirect starts
        // a fresh route transaction, while halt remains intentionally blank.
        return;
      }
      applyPageMeta(pg as Page, params, ctx.seedForPathname?.value, options);
      state.set({ kind: "ready", page: pg as Page, layouts: lts as Page[] });
    } catch (err: unknown) {
      resolved = true;
      if (timer) clearTimeout(timer);
      if (isStale(ctx, seq)) return;
      const e = err instanceof Error ? err : new Error(String(err));
      ctx.guardRedirects = 0;
      recordStaticError(e);
      markStaticRouteReady("error");
      state.set({ kind: "error", err: e });
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:error", ctx, { seq, error: e });
    }
  })();

  return html`${() => {
    const s = state();
    if (s.kind === "idle") return "";
    if (s.kind === "loading") {
      return options.loading?.() ?? defaultLoadingView();
    }
    if (s.kind === "guard") return "";
    if (s.kind === "error") {
      return renderError(s.err, params, options);
    }
    try {
      const seed = ctx.seedForPathname?.value;
      const view = renderInPageLifecycle(ctx, () =>
        renderWithLayouts(s.page, s.layouts, params, seed),
      );
      ctx.guardRedirects = 0;
      markStaticRouteReady("ready");
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:ready", ctx, { seq, params, mode: "async" });
      return view;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      disposeActiveLifecycle(ctx);
      applyHead({});
      document.title = "";
      recordStaticError(e);
      markStaticRouteReady("error");
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("router:error", ctx, { seq, error: e });
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
      reportError("router", "guard", "guard threw", err);
      return { kind: "halt" };
    }
    const verdict = normalizeGuardResult(v);
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
  ctx: RoutesContext,
  v: { kind: "redirect"; to: string; replace?: boolean } | { kind: "halt" },
): void {
  if (v.kind === "redirect") {
    navigateFromGuard(ctx, v.to, v.replace);
  }
  // "halt" — render nothing; caller already aborted.
}

function navigateFromGuard(
  ctx: RoutesContext,
  to: string,
  replace?: boolean,
): void {
  ctx.guardRedirects++;
  if (ctx.guardRedirects > MAX_GUARD_REDIRECTS) {
    reportError(
      "router",
      "guard-redirect-loop",
      `guard redirect loop detected: more than ${MAX_GUARD_REDIRECTS} consecutive redirects; halted at ${to}`,
      undefined,
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
  assertSynchronousLoad(data, "page.load");

  // Expose onDispose to page views so they can clean up timers, manual
  // subscriptions, etc. that aren't auto-managed by resource()/effect().
  const lc = getCurrentLifecycle();
  const onDispose = lc ? (fn: () => void) => lc.onDispose(fn) : undefined;

  // Expose ROUTE pathname (base stripped) to user views so they receive
  // the same value the matcher works with.
  const routePath = () => stripBase(location.pathname);
  let view: TemplateResult = page.view({
    params,
    data,
    path: routePath,
    child: null,
    onDispose,
  } as PageContext<RouteParams, unknown>);

  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i]!;
    const layoutData = layout.load ? layout.load(params) : undefined;
    assertSynchronousLoad(layoutData, "layout.load");
    view = layout.view({
      params,
      data: layoutData,
      path: routePath,
      child: view,
      onDispose,
    } as PageContext<RouteParams, unknown>);
  }

  return view;
}

function assertSynchronousLoad(value: unknown, label: string): void {
  if (value && typeof (value as PromiseLike<unknown>).then === "function") {
    throw new TypeError(
      `[mado:router] ${label} must return a synchronous value or Resource; ` +
        "use resource() for asynchronous data",
    );
  }
}

function trackIfPromise<T>(value: T | Promise<T>, label: string): Promise<T> {
  return value && typeof (value as Promise<T>).then === "function"
    ? trackStatic(value as Promise<T>, label)
    : Promise.resolve(value as T);
}

// ---------- Default loading view ----------
//
// Thin progress bar at the top of the screen.

function defaultLoadingView(): TemplateResult {
  return html`<div aria-hidden="true" style="position:fixed;inset:0 0 auto;height:2px;background:currentColor;opacity:.65;z-index:2147483647;pointer-events:none"></div>`;
}

// ---------- Test hooks ----------

/** @internal */
export const _testHooks = {
  activeRoutesSize(): number {
    return activeRoutes.size;
  },
};
