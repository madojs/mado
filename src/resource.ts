/**
 * Reactive fetch + cache. Replaces React-Query / SWR.
 *
 * Core idea:
 *   1. resource(keyFn, fetcher) — keyFn reads signals like a normal effect.
 *      When dependencies change the key is recomputed, and if the key
 *      actually differs — a new fetch starts (the old one is cancelled via
 *      AbortController).
 *   2. Data is cached by key in a global Map.
 *   3. resource returns three signals: data/error/loading, plus
 *      refresh()/mutate()/invalidate().
 *
 * mutation(fetcher) — a wrapper for POST/PUT/DELETE. After a successful run
 * it can invalidate specified resource keys (exact match or prefix-glob 'users/*').
 *
 * No runtime dependencies: only fetch + AbortController + signals.
 */

import { signal, effect, untracked, type Signal } from "./signal.js";
import { getCurrentLifecycle } from "./lifecycle.js";
import { reportError, warnOnce } from "./diagnostics.js";
import { trackStatic } from "./static-runtime.js";

// ---------- Global cache ----------


interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires: ReturnType<typeof setTimeout> | null;
}

type ResourceFetcher<T> = (key: string, signal: AbortSignal) => Promise<T>;

interface InFlightEntry<T> {
  controller: AbortController;
  promise: Promise<T>;
  consumers: number;
}

interface FetcherState {
  cache: Map<string, CacheEntry<unknown>>;
  inFlight: Map<string, InFlightEntry<unknown>>;
}

const fetcherStates = new Map<ResourceFetcher<unknown>, FetcherState>();
const invalidators = new Set<(pattern: string) => void>();

/**
 * Remove from cache all keys matching the pattern, and force
 * all live resource() instances with that key to re-fetch.
 *
 * Only a trailing `*` is supported for prefix-match:
 *   invalidate('users/42')   → exact match
 *   invalidate('users/*')    → everything starting with 'users/'
 *   invalidate('*')          → drop the ENTIRE cache (use intentionally)
 *
 * NOT supported: glob-in-middle (`users/* /posts`), regex, multi-star.
 * For more complex cases call invalidate() multiple times with different prefixes,
 * or iterate your own keys manually.
 */
export function invalidate(pattern: string): void {
  for (const [fetcher, state] of fetcherStates) {
    for (const [key, entry] of state.cache) {
      if (matchesPattern(key, pattern)) {
        if (entry.expires) clearTimeout(entry.expires);
        state.cache.delete(key);
      }
    }
    releaseFetcherState(fetcher, state);
  }
  for (const fn of invalidators) fn(pattern);
}

// ---------- resource ----------


export interface ResourceOptions {
  /** How many ms the data is considered fresh (fetch is skipped). */
  staleTime?: number;
  /** Initial value shown immediately. */
  initialData?: unknown;
}

export interface Resource<T> {
  /** Signal: data or undefined */
  data: () => T | undefined;
  /** Signal: error or null */
  error: () => Error | null;
  /** Signal: whether a request is in progress */
  loading: () => boolean;
  /** Signal: current key (useful for debugging and DI) */
  key: () => string;
  /** Force re-run the request. */
  refresh(): Promise<T>;
  /**
   * Locally replace the data (optimistic update).
   * The cache is also updated.
   */
  mutate(next: T | ((prev: T | undefined) => T)): void;
}

export function resource<T>(
  keyFn: () => string,
  fetcher: ResourceFetcher<T>,
  options: ResourceOptions = {},
): Resource<T> {
  const data = signal<T | undefined>(options.initialData as T | undefined);
  const error = signal<Error | null>(null);
  const loading = signal(false);
  const keySig = signal<string>("");

  let releaseInFlight: (() => void) | null = null;
  let requestSeq = 0;
  let lastKey = "";
  let force = false;

  // if inside component-setup — auto-cleanup on unmount.
  // if outside — print a warning so the developer knows
  // about the potential leak.
  const lifecycle = getCurrentLifecycle();
  if (!lifecycle) {
    warnOnce(
      "resource-outside-lifecycle",
      "resource() called outside of component-setup. " +
        "Invalidator subscriptions will not be cleaned up automatically — " +
        "this is a leak. Use resource() inside component(...), or " +
        "manage the lifecycle manually via createLifecycle()/runInLifecycle().",
    );
  }

  const run = (key: string): Promise<T> => {
    releaseInFlight?.();
    releaseInFlight = null;
    const seq = ++requestSeq;

    // if there is a fresh cache and not forced — use it
    const cached = getFetcherState(fetcher).cache.get(key) as CacheEntry<T> | undefined;
    if (
      cached &&
      !force &&
      (options.staleTime === Infinity ||
        Date.now() - cached.timestamp < (options.staleTime ?? 0))
    ) {
      data.set(cached.data);
      error.set(null);
      loading.set(false);
      return Promise.resolve(cached.data);
    }

    loading.set(true);
    error.set(null);

    const retained = retainInFlight(key, fetcher, force);
    releaseInFlight = retained.release;
    force = false;

    retained.promise.then(
      (result) => {
        // Two-layer staleness check:
        //   1. seq !== requestSeq — this resource has moved to a newer run().
        //   2. key !== lastKey — defensive guard for fetchers that ignore
        //      the AbortSignal and resolve after a newer run() has started.
        //      Without this, a slow stale response can overwrite the data
        //      from a faster newer one when the key changes rapidly.
        retained.release();
        if (seq !== requestSeq) return;
        if (key !== lastKey) return;
        writeCache(fetcher, key, result, options.staleTime ?? 0);
        data.set(result);
        loading.set(false);
      },
      (err: unknown) => {
        retained.release();
        if (seq !== requestSeq) return;
        if (key !== lastKey) return;
        error.set(err instanceof Error ? err : new Error(String(err)));
        loading.set(false);
      },
    );
    return retained.promise;
  };

  // subscribe to key changes
  const stopKeyEffect = effect(() => {
    const key = keyFn();
    keySig.set(key);
    if (key !== lastKey || force) {
      lastKey = key;
      void run(key);
    }
  });

  // subscribe to global invalidation
  const onInv = (pattern: string) => {
    if (matchesPattern(lastKey, pattern)) {
      force = true;
      void run(lastKey);
    }
  };
  invalidators.add(onInv);

  // auto-cleanup if inside a component
  if (lifecycle) {
    lifecycle.onDispose(() => {
      requestSeq++;
      stopKeyEffect();
      invalidators.delete(onInv);
      releaseInFlight?.();
      releaseInFlight = null;
    });
  }

  return {
    data,
    error,
    loading,
    key: keySig,
    refresh() {
      force = true;
      // read key without tracking — otherwise we'd end up inside someone else's effect
      const key = untracked(keyFn);
      lastKey = key;
      keySig.set(key);
      return run(key);
    },
    mutate(next) {
      const prev = data.peek();
      const value =
        typeof next === "function"
          ? (next as (p: T | undefined) => T)(prev)
          : next;
      data.set(value);
      if (lastKey) writeCache(fetcher, lastKey, value, options.staleTime ?? 0);
    },
  };
}

function retainInFlight<T>(
  key: string,
  fetcher: ResourceFetcher<T>,
  force: boolean,
): { promise: Promise<T>; release: () => void } {
  const state = getFetcherState(fetcher);
  let entry = (!force ? state.inFlight.get(key) : undefined) as
    | InFlightEntry<T>
    | undefined;

  if (!entry) {
    const controller = new AbortController();
    entry = {
      controller,
      consumers: 0,
      promise: trackStatic(fetcher(key, controller.signal), `resource ${key}`),
    };
    entry.promise.then(
      () => {
        if (state.inFlight.get(key) === entry) state.inFlight.delete(key);
        releaseFetcherState(fetcher, state);
      },
      () => {
        if (state.inFlight.get(key) === entry) state.inFlight.delete(key);
        releaseFetcherState(fetcher, state);
      },
    );
    state.inFlight.set(key, entry as InFlightEntry<unknown>);
  }

  entry.consumers++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.consumers--;
    if (entry.consumers === 0 && state.inFlight.get(key) === entry) {
      entry.controller.abort();
      state.inFlight.delete(key);
      releaseFetcherState(fetcher, state);
    }
  };

  return { promise: entry.promise, release };
}

function getFetcherState<T>(fetcher: ResourceFetcher<T>): FetcherState {
  let state = fetcherStates.get(fetcher as ResourceFetcher<unknown>);
  if (!state) {
    state = { cache: new Map(), inFlight: new Map() };
    fetcherStates.set(fetcher as ResourceFetcher<unknown>, state);
  }
  return state;
}

function releaseFetcherState(
  fetcher: ResourceFetcher<unknown>,
  state: FetcherState,
): void {
  if (state.cache.size === 0 && state.inFlight.size === 0) {
    fetcherStates.delete(fetcher);
  }
}

function writeCache<T>(
  fetcher: ResourceFetcher<T>,
  key: string,
  data: T,
  staleTime: number,
): void {
  const state = getFetcherState(fetcher);
  const previous = state.cache.get(key);
  if (previous?.expires) clearTimeout(previous.expires);
  if (staleTime <= 0) {
    state.cache.delete(key);
    releaseFetcherState(fetcher as ResourceFetcher<unknown>, state);
    return;
  }
  const entry: CacheEntry<T> = { data, timestamp: Date.now(), expires: null };
  if (staleTime !== Infinity) {
    entry.expires = setTimeout(() => {
      if (state.cache.get(key) === entry) state.cache.delete(key);
      releaseFetcherState(fetcher as ResourceFetcher<unknown>, state);
    }, staleTime);
    (entry.expires as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  }
  state.cache.set(key, entry as CacheEntry<unknown>);
}

function matchesPattern(key: string, pattern: string): boolean {
  return pattern.endsWith("*")
    ? key.startsWith(pattern.slice(0, -1))
    : key === pattern;
}

// ---------- mutation ----------


export interface MutationOptions<TArgs = unknown, TResult = unknown> {
  /**
   * Invalidate cache by these patterns after success.
   *
   * Can be:
   *   - a static array:  `['users/*']`
   *   - a function of result and args:
   *     `(result, args) => [${'`'}posts/${result.id}${'`'}, 'feed/*']`
   *
   * The function is called AFTER a successful request. If it throws — the error
   * is logged to console, but the mutation success is preserved (invalidation is best-effort).
   *
   * Only `*` at the END of a pattern is supported (see invalidate()).
   */
  invalidates?:
    | readonly string[]
    | ((result: TResult, args: TArgs) => readonly string[]);
  /**
   * Abort the previous in-flight run when a new run starts.
   *
   * Default: `false`. Mutations (POST/PUT/DELETE) are concurrent by default —
   * two quick submits of different entities must both complete; client-side
   * aborting the first would drop its `invalidates` even though the server
   * likely applied it. Set `true` only for last-write-wins flows like
   * search-as-you-type, where stale in-flight requests should be cancelled.
   */
  abortPrevious?: boolean;
}


export interface Mutation<TArgs, TResult> {
  /** Signal: request in progress */
  loading: Signal<boolean>;
  /** Signal: error */
  error: Signal<Error | null>;
  /** Signal: last received data */
  data: Signal<TResult | undefined>;
  /** Execute. Returns a Promise. */
  run(args: TArgs): Promise<TResult>;
  /** Reset error/data state. */
  reset(): void;
}

export function mutation<TArgs, TResult>(
  fetcher: (args: TArgs, signal: AbortSignal) => Promise<TResult>,
  options: MutationOptions<TArgs, TResult> = {},
): Mutation<TArgs, TResult> {
  const loading = signal(false);
  const error = signal<Error | null>(null);
  const data = signal<TResult | undefined>(undefined);
  // Track every controller so reset() can abort them all; `inFlight` is a
  // counter so `loading` stays true while ANY concurrent run is pending.
  const controllers = new Set<AbortController>();
  let inFlight = 0;
  let generation = 0;

  const settle = (ac: AbortController, runGeneration: number): void => {
    controllers.delete(ac);
    if (runGeneration !== generation) return;
    inFlight--;
    if (inFlight === 0) loading.set(false);
  };

  return {
    loading,
    error,
    data,
    async run(args) {
      // Mutations are concurrent by default — only abort the previous run when
      // explicitly opted in (search-as-you-type). (FABLE_REPORT.md finding #6)
      if (options.abortPrevious) {
        for (const c of controllers) c.abort();
      }
      const ac = new AbortController();
      const runGeneration = generation;
      controllers.add(ac);
      inFlight++;
      loading.set(true);
      error.set(null);
      try {
        const result = await fetcher(args, ac.signal);
        if (ac.signal.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        data.set(result);
        settle(ac, runGeneration);
        const inv = options.invalidates;
        if (inv) {
          let patterns: readonly string[] = [];
          try {
            patterns = typeof inv === "function" ? inv(result, args) : inv;
          } catch (err) {
            // Invalidation is best-effort. Don't fail the mutation because of it.
            reportError("resource", "mutation-invalidates", "mutation invalidation threw", err);
          }
          for (const p of patterns) invalidate(p);
        }
        return result;
      } catch (err) {
        if (!ac.signal.aborted) {
          error.set(err instanceof Error ? err : new Error(String(err)));
        }
        settle(ac, runGeneration);
        throw err;
      }
    },
    reset() {
      generation++;
      for (const c of controllers) c.abort();
      controllers.clear();
      inFlight = 0;
      loading.set(false);
      error.set(null);
      data.set(undefined);
    },
  };
}


// ---------- Utilities ----------


/**
 * Extended HTTP error thrown by jsonFetcher() on `!response.ok`.
 *
 * Unlike a plain `Error("HTTP 422")`, it preserves:
 *   - `status` / `statusText` — for UI discrimination ("422 → show form errors")
 *   - `url` — which endpoint failed
 *   - `body` — parsed response body (JSON if possible, then text, then null)
 *
 *   try {
 *     await api.save(user);
 *   } catch (err) {
 *     if (err instanceof HttpError && err.status === 422) {
 *       // err.body may contain { errors: { email: 'taken' } }
 *     }
 *   }
 */
export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown;

  constructor(
    status: number,
    statusText: string,
    url: string,
    body: unknown,
  ) {
    super(`HTTP ${status} ${statusText} ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}

/**
 * Simple JSON fetcher for resource. Throws HttpError on `!response.ok`,
 * with a parsed body (JSON → text → null) for proper UI error handling.
 *
 *   const user = resource(() => `/api/users/${id()}`, jsonFetcher());
 */
export function jsonFetcher<T>(
  init: RequestInit = {},
): (url: string, signal: AbortSignal) => Promise<T> {
  return async (url, signal) => {
    const res = await fetch(url, { ...init, signal });
    if (!res.ok) {
      let body: unknown = null;
      // Try to read the body: JSON first, then text. Don't fail if that doesn't work.
      try {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          body = await res.json();
        } else {
          body = await res.text();
        }
      } catch {
        body = null;
      }
      throw new HttpError(res.status, res.statusText, url, body);
    }
    return (await res.json()) as T;
  };
}

// ---------- Test hooks ----------
//
// Not public API. Used by tests to inspect lifecycle cleanup.

/** @internal */
export const _testHooks = {
  invalidatorsSize(): number {
    return invalidators.size;
  },
  cacheSize(): number {
    let size = 0;
    for (const state of fetcherStates.values()) size += state.cache.size;
    return size;
  },
  clearCache(): void {
    for (const state of fetcherStates.values()) {
      for (const entry of state.cache.values()) {
        if (entry.expires) clearTimeout(entry.expires);
      }
      for (const entry of state.inFlight.values()) entry.controller.abort();
    }
    fetcherStates.clear();
  },
};
