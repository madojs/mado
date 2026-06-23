/**
 * Browser integration: History API, click interception, hover-prefetch,
 * View Transitions, queryParam.
 *
 * Everything that touches `window` / `document` / `history` lives here,
 * so match.ts remains clean and testable without jsdom.
 */

import { signal, type Signal } from "./../signal.js";
import { html } from "../html/template.js";
import {
  compile,
  matchRoute,
  type CompiledRoute,
  type RouteParams,
  type Routes,
} from "./match.js";
import { appBase, stripBase, withBase } from "./base.js";
import type { TemplateResult } from "../html/template-types.js";

// ---------- router() ----------

export interface RouterApi {
  /** Signal function that returns the current TemplateResult. */
  view: () => TemplateResult;
  /** Current path as a signal. */
  path: () => string;
  /** Programmatic navigation. */
  navigate(to: string, opts?: { replace?: boolean }): void;
  /** Remove all listeners and release resources. */
  dispose(): void;
}

export interface RouterOptions {
  /**
   * Use the View Transitions API on navigation (smooth crossfade).
   * Default `true` — if the browser doesn't support it, safely
   * falls back to a plain set().
   */
  viewTransitions?: boolean;
  /**
   * Hook for hover prefetch. Receives the pathname of the candidate
   * (without origin, query/hash stripped). Used by routes()
   * to register loaders; raw router() doesn't normally need this.
   */
  prefetch?: (pathname: string) => void;
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
 * Minimal History API router.
 *
 *   const route = router({
 *     '/':          () => html`<x-home/>`,
 *     '/users/:id': ({ id }) => html`<x-user .id=${id}/>`,
 *     '*':          () => html`<x-404/>`,
 *   });
 *
 *   html`<main>${route.view}</main>`
 *
 * Lifecycle: subscribes to popstate + intercepts clicks
 * on `<a data-link>` + hover-prefetch (if hook given). All this
 * is removed in `dispose()` — mandatory to call in tests and
 * dev-overlay, otherwise listener leak.
 */
export function router(
  routes: Routes,
  options: RouterOptions = {},
): RouterApi {
  const useViewTransitions = options.viewTransitions !== false;
  const useScrollRestoration = options.scrollRestoration !== false;
  const useFocusManagement = options.focusManagement !== false;
  const compiled = Object.entries(routes).map(([p, h]) => compile(p, h));
  const fallback =
    compiled.find((r) => r.pattern === "*") ?? defaultFallback();

  // Route pathname = browser pathname with the active Vite base stripped.
  // The route matcher, route signal and any `path()` consumer always see
  // base-free paths; `withBase()` re-adds it when we touch history.
  const path = signal(stripBase(location.pathname));
  const cleanups: Array<() => void> = [];
  const scrollPositions = new Map<string, { top: number; left: number }>();
  let currentScrollKey = locationKey();
  let disposed = false;

  const hist = history as History & { scrollRestoration?: "auto" | "manual" };
  const previousScrollRestoration = hist.scrollRestoration;
  if (useScrollRestoration && "scrollRestoration" in hist) {
    try {
      hist.scrollRestoration = "manual";
      cleanups.push(() => {
        hist.scrollRestoration = previousScrollRestoration;
      });
    } catch {
      /* noop */
    }
  }

  // -- popstate
  const onPop = () => {
    if (disposed) return;
    if (useScrollRestoration) saveScroll(scrollPositions, currentScrollKey);
    currentScrollKey = locationKey();
    path.set(stripBase(location.pathname));
    if (useScrollRestoration) restoreScroll(scrollPositions, currentScrollKey);
    if (useFocusManagement) scheduleFocusReset();
  };
  window.addEventListener("popstate", onPop);
  cleanups.push(() => window.removeEventListener("popstate", onPop));

  // -- global click interception on <a data-link>
  const onClick = (e: Event) => {
    if (disposed) return;
    const a = findAnchor(e, "a[data-link]");
    if (!a) return;
    if ((e as MouseEvent).defaultPrevented) return;
    if ((e as MouseEvent).button !== 0) return;
    const me = e as MouseEvent;
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
    // Respect intentional non-SPA links: opening in a new tab/window or a
    // download must keep native behaviour. (FABLE_REPORT.md finding #9)
    const target = a.getAttribute("target");
    if (target && target !== "_self") return;
    if (a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    // Foreign-base links escape SPA navigation entirely so the browser
    // performs a real document load (avoids matching "/other/..." against
    // routes registered under base "/mado/").
    const b = appBase;
    if (b !== "/" && !(url.pathname === b.slice(0, -1) || url.pathname.startsWith(b))) {
      return;
    }
    e.preventDefault();
    const routePath = stripBase(url.pathname);
    api.navigate(routePath + url.search + url.hash);
  };
  document.addEventListener("click", onClick);
  cleanups.push(() => document.removeEventListener("click", onClick));

  // -- hover-prefetch (>=50ms on <a data-link:not([data-no-prefetch])>)
  let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  const onMouseOver = (e: Event) => {
    if (disposed) return;
    if (!options.prefetch) return;
    const a = findAnchor(e, "a[data-link]:not([data-no-prefetch])");
    if (!a) return;
    if (prefetchTimer) clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        // Foreign-base links escape SPA prefetch entirely — the manifest
        // only knows base-free route paths and would never match
        // "/mado/docs". Mirrors the click-interception check above.
        const b = appBase;
        if (b !== "/" && !(url.pathname === b.slice(0, -1) || url.pathname.startsWith(b))) {
          return;
        }
        // The prefetch hook is fed manifest-shaped paths (no base),
        // matching the route signal and loader registry.
        options.prefetch!(stripBase(url.pathname));
      } catch {
        /* noop */
      }
    }, 50);
  };
  const onMouseOut = () => {
    if (prefetchTimer) {
      clearTimeout(prefetchTimer);
      prefetchTimer = null;
    }
  };
  document.addEventListener("mouseover", onMouseOver);
  document.addEventListener("mouseout", onMouseOut);
  cleanups.push(() => {
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("mouseout", onMouseOut);
    if (prefetchTimer) clearTimeout(prefetchTimer);
  });

  const api: RouterApi = {
    view: () => {
      const p = path();
      const m = matchRoute(p, compiled);
      if (m) return m.route.handler(m.params);
      return fallback.handler({});
    },
    path,
    navigate(to, opts) {
      // `to` is a ROUTE path (no base). Re-add the active base before we
      // touch history so the browser URL has the correct prefix.
      const url = toBrowserUrl(to);
      const apply = () => {
        if (useScrollRestoration) saveScroll(scrollPositions, currentScrollKey);
        if (opts?.replace) history.replaceState(null, "", url);
        else history.pushState(null, "", url);
        currentScrollKey = locationKey();
        path.set(stripBase(location.pathname));
        // An in-page #hash must scroll to its target even when the pathname is
        // unchanged (signal dedup would otherwise swallow the navigation and
        // leave anchor links dead). (FABLE_REPORT.md finding #9)
        if (location.hash) scrollToHash(location.hash);
        else if (useScrollRestoration) scrollToTop();
        if (useFocusManagement) scheduleFocusReset();
      };

      // View Transitions API: smooth crossfade between pages,
      // if the browser supports it. Psychologically removes flashing
      // even if the new page renders in 50-100ms.
      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      if (useViewTransitions && typeof doc.startViewTransition === "function") {
        doc.startViewTransition(apply);
      } else {
        apply();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of cleanups.splice(0)) {
        try {
          c();
        } catch {
          /* noop */
        }
      }
    },
  };

  return api;
}

function findAnchor(e: Event, selector: string): HTMLAnchorElement | null {
  const fromElement = (node: unknown): HTMLAnchorElement | null => {
    if (!(node instanceof Element)) return null;
    const match = node.matches(selector) ? node : node.closest(selector);
    if (!match || !("href" in match)) return null;
    return match as HTMLAnchorElement;
  };

  const direct = fromElement(e.target);
  if (direct) return direct;

  if (typeof e.composedPath !== "function") return null;
  for (const node of e.composedPath()) {
    const found = fromElement(node);
    if (found) return found;
  }
  return null;
}

/** Default 404, if the manifest had no `'*'`. */
function defaultFallback(): CompiledRoute {
  return compile("*", () => html`<pre>404: ${location.pathname}</pre>`);
}

// ---------- navigate() ----------

/**
 * Global helper for programmatic navigation. Equivalent to
 * `api.navigate(to)` for any active router — updates the URL
 * via History API and dispatches `popstate`, which all
 * active routers on the page will pick up.
 *
 *   import { navigate } from "@madojs/mado";
 *   navigate("/users/42");
 *
 * Used inside form handlers / events when you don't have
 * direct access to RouterApi (e.g. inside a component's setup function
 * that didn't receive the router as a parameter).
 */
export function navigate(to: string, opts?: { replace?: boolean }): void {
  if (typeof history === "undefined" || typeof window === "undefined") return;
  const url = toBrowserUrl(to);
  if (opts?.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  // popstate is NOT dispatched automatically on pushState/replaceState,
  // so we dispatch it manually — all active routers will hear and update.
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (location.hash) scrollToHash(location.hash);
  else scrollToTop();
  scheduleFocusReset();
}

function locationKey(): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/**
 * Convert a route path + optional query/hash into a full browser URL with
 * the active Vite base re-applied. Pure: no DOM access beyond the
 * resolved `appBase` constant.
 */
function toBrowserUrl(to: string): string {
  if (!to) return withBase("/");
  let path = to;
  let suffix = "";
  const hashAt = path.indexOf("#");
  if (hashAt >= 0) {
    suffix = path.slice(hashAt) + suffix;
    path = path.slice(0, hashAt);
  }
  const queryAt = path.indexOf("?");
  if (queryAt >= 0) {
    suffix = path.slice(queryAt) + suffix;
    path = path.slice(0, queryAt);
  }
  if (!path) path = "/";
  return withBase(path) + suffix;
}

function saveScroll(
  positions: Map<string, { top: number; left: number }>,
  key: string,
): void {
  const maybeWindow = window as Window & {
    scrollX?: number;
    scrollY?: number;
    pageXOffset?: number;
    pageYOffset?: number;
  };
  positions.set(key, {
    left: maybeWindow.scrollX ?? maybeWindow.pageXOffset ?? 0,
    top: maybeWindow.scrollY ?? maybeWindow.pageYOffset ?? 0,
  });
}

function restoreScroll(
  positions: Map<string, { top: number; left: number }>,
  key: string,
): void {
  const pos = positions.get(key) ?? { top: 0, left: 0 };
  scrollTo(pos);
}

function scrollToTop(): void {
  scrollTo({ top: 0, left: 0 });
}

function scrollToHash(hash: string): void {
  const scroll = () => {
    const target = hashTarget(hash);
    if (!target) return false;
    try {
      target.scrollIntoView({ block: "start", inline: "nearest" });
    } catch {
      try {
        target.scrollIntoView();
      } catch {
        /* noop */
      }
    }
    return true;
  };

  if (scroll()) return;
  // New-route hash targets are often rendered by the reactive route effect
  // after `path.set()`, so try once more on the next microtask.
  queueMicrotask(() => {
    scroll();
  });
}

function hashTarget(hash: string): HTMLElement | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    /* keep raw hash text */
  }
  return document.getElementById(id);
}

function scrollTo(options: ScrollToOptions): void {
  const maybeWindow = window as Window & {
    scrollTo?: (options: ScrollToOptions) => void;
  };
  if (typeof maybeWindow.scrollTo !== "function") return;
  try {
    maybeWindow.scrollTo(options);
  } catch {
    /* noop */
  }
}

function scheduleFocusReset(): void {
  queueMicrotask(() => {
    const target = document.querySelector(
      "[data-mado-focus], main, [role='main'], h1",
    );
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try {
      target.focus({ preventScroll: true });
    } catch {
      try {
        target.focus();
      } catch {
        /* noop */
      }
    }
  });
}

// ---------- queryParam ----------
//
// Reactive wrapper over ?foo=bar. Reading → signal, .set() → replaceState.
// All queryParams in the app are synchronised via a shared signal bus.
// The bus is lazily initialised on first queryParam() call, because
// in SSR/test environments window/location may be connected later.

let queryBus: Signal<string> | null = null;

function ensureQueryBus(): Signal<string> {
  if (queryBus) return queryBus;
  queryBus = signal(location.search);
  window.addEventListener("popstate", () => queryBus!.set(location.search));
  return queryBus;
}

function syncQuery(next: URLSearchParams, push: boolean): void {
  const url = `${location.pathname}?${next.toString()}${location.hash}`.replace(
    /\?$/,
    "",
  );
  if (push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  ensureQueryBus().set(location.search);
}

export interface QueryParam {
  (): string;
  set(value: string | null, opts?: { push?: boolean }): void;
}

/**
 * Reactive query parameter.
 *
 *   const page = queryParam('page', '1');
 *   page();              // '1' (or current URL value)
 *   page.set('2');       // history.replaceState and re-render
 *   page.set(null);      // delete the parameter
 */
export function queryParam(name: string, defaultValue = ""): QueryParam {
  const bus = ensureQueryBus();
  const read = (() => {
    const search = bus();
    const params = new URLSearchParams(search);
    return params.get(name) ?? defaultValue;
  }) as QueryParam;

  read.set = (value, opts) => {
    const params = new URLSearchParams(location.search);
    if (value === null || value === "") params.delete(name);
    else params.set(name, value);
    syncQuery(params, opts?.push ?? false);
  };

  return read;
}

/**
 * For typing purposes — same characteristics as Signal<string>.
 * Convenient in places that expect a plain signal.
 */
export type QuerySignal = Signal<string>;
