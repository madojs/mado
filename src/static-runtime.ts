import { flushSync } from "./signal.js";

export interface StaticDiagnostics {
  routeReady: boolean;
  pending: string[];
  lastRouterState: string | null;
  errors: string[];
}

export interface MadoStaticRuntime {
  routeReady(state?: string): void;
  track<T>(promise: Promise<T>, label: string): Promise<T>;
  whenStable(): Promise<void>;
  diagnostics(): StaticDiagnostics;
  setRouterState(state: string): void;
  recordError(error: unknown): void;
}

declare global {
  interface Window {
    __MADO_STATIC_MODE__?: boolean;
    __MADO_STATIC__?: MadoStaticRuntime;
  }
}

let staticData:
  | { path: string; parsed: true; value: unknown }
  | { path: string; parsed: false; value: undefined }
  | null = null;

export function readStaticData<T>(): T | undefined {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return undefined;
  }
  if (staticData && staticData.path === location.pathname) {
    return staticData.parsed ? (staticData.value as T) : undefined;
  }
  if (staticData && staticData.path !== location.pathname) return undefined;

  const el = document.querySelector<HTMLScriptElement>(
    'script[type="application/json"][data-mado-static-data]',
  );
  if (!el || el.textContent == null) {
    staticData = { path: location.pathname, parsed: false, value: undefined };
    return undefined;
  }

  el.setAttribute("data-mado-static-data-consumed", "");
  try {
    const value = JSON.parse(el.textContent) as T;
    staticData = { path: location.pathname, parsed: true, value };
    return value;
  } catch {
    staticData = { path: location.pathname, parsed: false, value: undefined };
    return undefined;
  }
}

export function getStaticRuntime(): MadoStaticRuntime | null {
  if (typeof window === "undefined") return null;
  if (window.__MADO_STATIC__) return window.__MADO_STATIC__;
  if (window.__MADO_STATIC_MODE__ !== true) return null;
  window.__MADO_STATIC__ = createStaticRuntime();
  return window.__MADO_STATIC__;
}

export function trackStatic<T>(promise: Promise<T>, label: string): Promise<T> {
  return getStaticRuntime()?.track(promise, label) ?? promise;
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
  const pending = new Map<number, string>();
  const errors: string[] = [];

  const diagnostics = (): StaticDiagnostics => ({
    routeReady,
    pending: [...pending.values()].sort(),
    lastRouterState,
    errors: [...errors],
  });

  const runtime: MadoStaticRuntime = {
    routeReady(state = "ready") {
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

        if (routeReady && pending.size === 0) {
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
          `state=${d.lastRouterState ?? "unknown"} pending=${d.pending.join(", ") || "none"}`,
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
