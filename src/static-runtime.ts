import { flushSync } from "./signal.js";
import { stripBase } from "./router/base.js";
import type { JsonValue } from "./page.js";

export interface StaticDiagnostics {
  routeReady: boolean;
  pending: string[];
  lastRouterState: string | null;
  errors: string[];
  expectedPathname: string | null;
}

export interface WhenStableOptions {
  /**
   * Cap on time to wait for the route to call `routeReady()`. Defaults
   * to 15s — long enough to load and render even a slow code-split
   * route, short enough that a deadlocked one fails loudly.
   */
  routeReadyMs?: number;
  /**
   * Cap on time to wait for tracked resources (initial fetches, lazy
   * imports created before `routeReady()`) to settle once the route is
   * ready. Defaults to 15s.
   */
  resourcesMs?: number;
  /**
   * Cap on time to wait for `document.fonts.ready`. Web fonts that
   * never resolve must not block the snapshot pipeline indefinitely.
   * Defaults to 5s. We log a diagnostic and proceed on timeout.
   */
  fontsMs?: number;
  /**
   * Cap on time to wait for two paint frames so async style or layout
   * effects can flush before serialization. Defaults to 1s.
   */
  paintMs?: number;
}

export interface MadoStaticRuntime {
  beginRoute(pathname: string): void;
  routeReady(state?: string): void;
  track<T>(promise: Promise<T>, label: string): Promise<T>;
  whenStable(options?: WhenStableOptions): Promise<void>;
  diagnostics(): StaticDiagnostics;
  setRouterState(state: string): void;
  recordError(error: unknown): void;
}

declare global {
  interface Window {
    /**
     * Build-time signal that this document is being rendered by the static
     * snapshot capture harness. Set by Mado runtime when the document
     * carries the `data-mado-static-capture` attribute. CSP-safe: it does
     * NOT come from an inline script.
     */
    __MADO_STATIC_MODE__?: boolean;
    __MADO_STATIC__?: MadoStaticRuntime;
  }
}

/**
 * Consume the build-time seed for the active route exactly once.
 *
 * Lifecycle: discovery encodes the seed into the snapshot as a
 * `<script type="application/json" data-mado-static-data>` element. On the
 * first client boot of a static route the router calls
 * `consumeStaticSeed(pathname)` from a single place.
 *
 *   - In production (no capture marker): the script element is removed
 *     after parsing so subsequent SPA navigations cannot resurrect a stale
 *     seed.
 *   - During build-time capture (data-mado-static-capture present): the
 *     script element is preserved so the serializer can keep it in the
 *     final snapshot HTML — that way the real client boot receives the
 *     same seed once again.
 *
 * Returns `undefined` if no seed is present, the JSON is malformed, or the
 * pathname does not match. The router passes the result into both
 * `page.head(params, seed)` and `page.load(params, seed)`.
 */
export function consumeStaticSeed(
  pathname: string,
): JsonValue | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector<HTMLScriptElement>(
    'script[type="application/json"][data-mado-static-data]',
  );
  if (!el || el.textContent == null) return undefined;
  // The attribute MAY carry the pathname it was emitted for; an empty or
  // missing value means "the only seed in this document", and we accept it
  // for the active route. A non-empty mismatch indicates a stale fragment
  // from a previous route — drop it.
  const elPath = el.getAttribute("data-mado-static-data");
  if (elPath && elPath !== pathname) return undefined;
  const preserve =
    document.documentElement.hasAttribute("data-mado-static-capture");
  try {
    const value = JSON.parse(el.textContent) as JsonValue;
    if (!preserve) el.remove();
    return value;
  } catch {
    if (!preserve) el.remove();
    return undefined;
  }
}

function detectCaptureMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-mado-static-capture");
}

export function getStaticRuntime(): MadoStaticRuntime | null {
  if (typeof window === "undefined") return null;
  if (window.__MADO_STATIC__) return window.__MADO_STATIC__;
  const enabled =
    window.__MADO_STATIC_MODE__ === true || detectCaptureMode();
  if (!enabled) return null;
  window.__MADO_STATIC_MODE__ = true;
  window.__MADO_STATIC__ = createStaticRuntime();
  return window.__MADO_STATIC__;
}

export function trackStatic<T>(promise: Promise<T>, label: string): Promise<T> {
  return getStaticRuntime()?.track(promise, label) ?? promise;
}

export function beginStaticRoute(pathname: string): void {
  getStaticRuntime()?.beginRoute(pathname);
}

export function markStaticRouteReady(state = "ready"): void {
  getStaticRuntime()?.routeReady(state);
}

export function setStaticRouterState(state: string): void {
  getStaticRuntime()?.setRouterState(state);
}

export function recordStaticError(error: unknown): void {
  getStaticRuntime()?.recordError(error);
}

function createStaticRuntime(): MadoStaticRuntime {
  let nextId = 1;
  let routeReady = false;
  let lastRouterState: string | null = null;
  let expectedPathname: string | null = null;
  const pending = new Map<number, string>();
  const errors: string[] = [];

  const diagnostics = (): StaticDiagnostics => ({
    routeReady,
    pending: [...pending.values()].sort(),
    lastRouterState,
    errors: [...errors],
    expectedPathname,
  });

  // Both `beginRoute()` callers and the `routeReady()` comparison live on
  // the BASE-FREE pathname (the route key the matcher uses). Strip the
  // active Vite base so capture under any deployment shape compares
  // apples to apples.
  const currentPathname = (): string | null =>
    typeof location !== "undefined" ? stripBase(location.pathname) : null;

  const runtime: MadoStaticRuntime = {
    beginRoute(pathname: string) {
      expectedPathname = pathname;
      routeReady = false;
      lastRouterState = "begin";
    },
    routeReady(state = "ready") {
      // If the runtime moved to a different pathname (effect-driven redirect,
      // guard verdict), only acknowledge readiness for the active path; the
      // capture harness compares pathname before serialization.
      const here = currentPathname();
      if (expectedPathname != null && here != null && here !== expectedPathname) {
        // Stale completion of an old route; do not mark as ready.
        return;
      }
      routeReady = true;
      lastRouterState = state;
    },
    track<T>(promise: Promise<T>, label: string): Promise<T> {
      const id = nextId++;
      pending.set(id, label);
      return Promise.resolve(promise).finally(() => {
        pending.delete(id);
      });
    },
    async whenStable(options: WhenStableOptions = {}) {
      const routeReadyMs = options.routeReadyMs ?? 15_000;
      const resourcesMs = options.resourcesMs ?? 15_000;

      // 1) Route ready: wait until the router calls `markStaticRouteReady`
      //    for the active pathname. Resources, fonts and paint frames are
      //    irrelevant until the route itself has committed.
      await waitFor(
        () => routeReady && errors.length === 0,
        routeReadyMs,
        () => {
          const d = diagnostics();
          return (
            `[mado:static] route did not become ready in ${routeReadyMs}ms. ` +
            `state=${d.lastRouterState ?? "unknown"} ` +
            `pending=${d.pending.join(", ") || "none"} ` +
            `errors=${d.errors.join(" | ") || "none"}`
          );
        },
      );

      // 2) Tracked resources: any `resource()` created before route ready
      //    is part of the initial render contract; the snapshot waits for
      //    it. Resources created after `routeReady` count as background
      //    work and are NOT awaited — they would otherwise let a stray
      //    `setInterval` keep capture pinned forever.
      await waitFor(
        () => pending.size === 0 && errors.length === 0,
        resourcesMs,
        () => {
          const d = diagnostics();
          return (
            `[mado:static] route ready but resources did not settle in ${resourcesMs}ms. ` +
            `pending=${d.pending.join(", ") || "none"} ` +
            `errors=${d.errors.join(" | ") || "none"}`
          );
        },
      );

      // 3) One last quiet pass: flushSync + microtask drain to ensure
      //    any final reactive effect committed during step 2 has
      //    rendered before the caller serializes the document.
      try {
        flushSync();
      } catch {
        /* best effort; diagnostics already capture page errors */
      }
      await microtask();
    },
    diagnostics,
    setRouterState(state: string) {
      lastRouterState = state;
    },
    recordError(error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
    },
  };

  return runtime;
}

function microtask(): Promise<void> {
  return Promise.resolve();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `predicate` until it returns true or `timeoutMs` elapses. Calls
 * `flushSync()` once per pass so reactive effects scheduled during the
 * tick get a chance to commit before the next check. On timeout throws
 * the message returned by `describe()` so each phase of `whenStable`
 * produces a phase-specific diagnostic.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  describe: () => string,
): Promise<void> {
  const started = Date.now();
  // Two consecutive quiet ticks before we declare success: the predicate
  // can transition transiently while a microtask flush rebuilds the
  // route view.
  let quietPasses = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      flushSync();
    } catch {
      /* page errors surface separately via recordError */
    }
    await microtask();
    if (predicate()) {
      quietPasses++;
      if (quietPasses >= 2) return;
    } else {
      quietPasses = 0;
    }
    await delay(10);
  }
  throw new Error(describe());
}
