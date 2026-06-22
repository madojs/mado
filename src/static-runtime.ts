import { flushSync } from "./signal.js";
import type { JsonValue } from "./page.js";

export interface StaticDiagnostics {
  routeReady: boolean;
  pending: string[];
  lastRouterState: string | null;
  errors: string[];
  expectedPathname: string | null;
}

export interface MadoStaticRuntime {
  beginRoute(pathname: string): void;
  routeReady(state?: string): void;
  track<T>(promise: Promise<T>, label: string): Promise<T>;
  whenStable(): Promise<void>;
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

  const currentPathname = (): string | null =>
    typeof location !== "undefined" ? location.pathname : null;

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
    async whenStable() {
      const started = Date.now();
      const timeoutMs = 30_000;
      let quietPasses = 0;

      while (Date.now() - started < timeoutMs) {
        try {
          flushSync();
        } catch {
          /* best effort: diagnostics will report page errors separately */
        }
        await microtask();

        if (routeReady && pending.size === 0 && errors.length === 0) {
          quietPasses++;
          if (quietPasses >= 2) return;
        } else {
          quietPasses = 0;
        }
        await delay(10);
      }

      const d = diagnostics();
      throw new Error(
        `[mado:static] route did not become stable. ` +
          `state=${d.lastRouterState ?? "unknown"} ` +
          `pending=${d.pending.join(", ") || "none"} ` +
          `errors=${d.errors.join(" | ") || "none"}`,
      );
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
