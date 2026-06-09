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
import { warnOnce } from "./diagnostics.js";

// ---------- Global cache ----------


interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const invalidators = new Set<(key: string) => void>();

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
  const isGlob = pattern.endsWith("*");
  const prefix = isGlob ? pattern.slice(0, -1) : pattern;

  const toDelete: string[] = [];
  for (const key of cache.keys()) {
    if (isGlob ? key.startsWith(prefix) : key === pattern) {
      toDelete.push(key);
    }
  }
  for (const k of toDelete) cache.delete(k);

  for (const fn of invalidators) {
    for (const k of toDelete) fn(k);
  }
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
  refresh(): void;
  /**
   * Locally replace the data (optimistic update).
   * The cache is also updated.
   */
  mutate(next: T | ((prev: T | undefined) => T)): void;
}

export function resource<T>(
  keyFn: () => string,
  fetcher: (key: string, signal: AbortSignal) => Promise<T>,
  options: ResourceOptions = {},
): Resource<T> {
  const data = signal<T | undefined>(options.initialData as T | undefined);
  const error = signal<Error | null>(null);
  const loading = signal(false);
  const keySig = signal<string>("");

  let abort: AbortController | null = null;
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

  const run = (key: string) => {
    abort?.abort();
    const ac = new AbortController();
    abort = ac;

    // if there is a fresh cache and not forced — use it
    const cached = cache.get(key) as CacheEntry<T> | undefined;
    if (
      cached &&
      !force &&
      (!options.staleTime || Date.now() - cached.timestamp < options.staleTime)
    ) {
      data.set(cached.data);
      error.set(null);
      loading.set(false);
      return;
    }

    loading.set(true);
    error.set(null);
    force = false;

    fetcher(key, ac.signal).then(
      (result) => {
        // Two-layer staleness check:
        //   1. ac.signal.aborted — fetcher honored the AbortSignal
        //      (jsonFetcher does; user fetchers may not).
        //   2. key !== lastKey — defensive guard for fetchers that ignore
        //      the AbortSignal and resolve after a newer run() has started.
        //      Without this, a slow stale response can overwrite the data
        //      from a faster newer one when the key changes rapidly.
        if (ac.signal.aborted) return;
        if (key !== lastKey) return;
        cache.set(key, { data: result, timestamp: Date.now() });
        data.set(result);
        loading.set(false);
      },
      (err: unknown) => {
        if (ac.signal.aborted) return;
        if (key !== lastKey) return;
        error.set(err instanceof Error ? err : new Error(String(err)));
        loading.set(false);
      },
    );
  };

  // subscribe to key changes
  const stopKeyEffect = effect(() => {
    const key = keyFn();
    keySig.set(key);
    if (key !== lastKey || force) {
      lastKey = key;
      run(key);
    }
  });

  // subscribe to global invalidation
  const onInv = (invKey: string) => {
    if (invKey === lastKey) {
      force = true;
      run(lastKey);
    }
  };
  invalidators.add(onInv);

  // auto-cleanup if inside a component
  if (lifecycle) {
    lifecycle.onDispose(() => {
      stopKeyEffect();
      invalidators.delete(onInv);
      abort?.abort();
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
      run(key);
    },
    mutate(next) {
      const prev = data.peek();
      const value =
        typeof next === "function"
          ? (next as (p: T | undefined) => T)(prev)
          : next;
      data.set(value);
      if (lastKey) cache.set(lastKey, { data: value, timestamp: Date.now() });
    },
  };
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
  let abort: AbortController | null = null;

  return {
    loading,
    error,
    data,
    async run(args) {
      abort?.abort();
      const ac = new AbortController();
      abort = ac;
      loading.set(true);
      error.set(null);
      try {
        const result = await fetcher(args, ac.signal);
        if (ac.signal.aborted) {
          throw new DOMException("aborted", "AbortError");
        }
        data.set(result);
        loading.set(false);
        const inv = options.invalidates;
        if (inv) {
          let patterns: readonly string[] = [];
          try {
            patterns = typeof inv === "function" ? inv(result, args) : inv;
          } catch (err) {
            // Invalidation is best-effort. Don't fail the mutation because of it.
            // eslint-disable-next-line no-console
            console.error("[mado] mutation.invalidates threw:", err);
          }
          for (const p of patterns) invalidate(p);
        }
        return result;
      } catch (err) {
        if (!ac.signal.aborted) {
          error.set(err instanceof Error ? err : new Error(String(err)));
          loading.set(false);
        }
        throw err;
      }
    },
    reset() {
      abort?.abort();
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

export const _testHooks = {
  invalidatorsSize(): number {
    return invalidators.size;
  },
  cacheSize(): number {
    return cache.size;
  },
  clearCache(): void {
    cache.clear();
  },
};
