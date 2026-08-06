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
 * mutation(fetcher) — a lifecycle-owned wrapper for POST/PUT/DELETE. After a
 * successful run it can invalidate specified resource keys (exact match or
 * prefix-glob 'users/*'). Module-scoped mutations remain explicitly shared.
 *
 * No runtime dependencies: only fetch + AbortController + signals.
 */

import { signal, effect, untracked, type Signal } from "./signal.js";
import { getCurrentLifecycle } from "./lifecycle.js";
import { reportError, warnOnce } from "./diagnostics.js";
import { trackStatic } from "./static-runtime.js";
import { emitDevtools } from "./devtools-hook.js";

// ---------- Global cache ----------


interface CacheEntry<T> {
  data: T;
  timestamp: number;
  retentionTime: number;
  expires: ReturnType<typeof setTimeout> | null;
}

type ResourceFetcher<T> = (key: string, signal: AbortSignal) => Promise<T>;

interface InFlightEntry<T> {
  controller: AbortController;
  promise: Promise<T>;
  consumers: number;
  generation: number;
  invalidationId: number | null;
  cacheRetention: number;
  settled: boolean;
  retired: boolean;
}

interface FetcherState {
  cache: Map<string, CacheEntry<unknown>>;
  inFlight: Map<string, InFlightEntry<unknown>>;
  pending: Set<InFlightEntry<unknown>>;
  generations: Map<string, number>;
}

const fetcherStates = new Map<ResourceFetcher<unknown>, FetcherState>();
const invalidators = new Set<(pattern: string, invalidationId: number) => void>();
let nextInvalidationId = 0;

type RequestCause =
  | { kind: "normal" }
  | { kind: "refresh" }
  | { kind: "invalidation"; id: number };

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
  if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:invalidate", undefined, { pattern });
  for (const [fetcher, state] of fetcherStates) {
    for (const [key, entry] of state.cache) {
      if (matchesPattern(key, pattern)) {
        if (entry.expires) clearTimeout(entry.expires);
        state.cache.delete(key);
      }
    }
    releaseFetcherState(fetcher, state);
  }
  const invalidationId = ++nextInvalidationId;
  for (const fn of invalidators) {
    try {
      fn(pattern, invalidationId);
    } catch (err) {
      try {
        reportError(
          "resource",
          "invalidate-listener",
          `resource invalidation listener threw for pattern ${JSON.stringify(pattern)}`,
          err,
        );
      } catch {
        // Invalidation is fan-out. Diagnostics must not prevent later live
        // resources from observing the same event.
      }
    }
  }
}

// ---------- resource ----------


export interface ResourceOptions {
  /** How many ms the data is considered fresh (fetch is skipped). */
  staleTime?: number;
  /** Initial value shown immediately. */
  initialData?: unknown;
  /**
   * Keep the previous key's data visible while a new reactive key loads.
   * Defaults to true. Set false for identity-, permission-, or filter-scoped
   * projections where data from the previous key must disappear immediately.
   * Cached data for the new key is still applied synchronously.
   */
  retainPreviousData?: boolean;
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
  /** Force a request. Rejects while the empty key keeps the resource disabled. */
  refresh(): Promise<T>;
  /**
   * Locally replace the data (optimistic update).
   * The cache is also updated for the current non-empty key. While the empty
   * key keeps the resource disabled, the replacement remains local only.
   */
  mutate(next: T | ((prev: T | undefined) => T)): void;
  /** Stop key tracking, invalidation and the current request. Idempotent. */
  dispose(): void;
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
  const debugTarget = {};
  if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:create", debugTarget);

  let releaseInFlight: (() => void) | null = null;
  let requestSeq = 0;
  let lastKey = "";
  let hasKey = false;
  let disposed = false;

  // if inside component-setup — auto-cleanup on unmount.
  // if outside — print a warning so the developer knows
  // about the potential leak.
  const lifecycle = getCurrentLifecycle();
  if (!lifecycle) {
    warnOnce(
      "resource-outside-lifecycle",
      "resource() called outside of a managed page/component lifecycle. " +
        "Invalidator subscriptions will not be cleaned up automatically — " +
        "this is a leak unless resource.dispose() is called. Use resource() " +
        "inside page/component setup, call dispose(), or manage a shared lifecycle.",
    );
  }

  const run = (key: string, cause: RequestCause): Promise<T> => {
    releaseInFlight?.();
    releaseInFlight = null;
    const seq = ++requestSeq;
    if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:request", debugTarget, { key, seq, cause: cause.kind });

    // A caller's staleTime is a read policy. It never deletes or weakens a
    // shared cache entry that another resource may still consider fresh.
    const state = getFetcherState(fetcher);
    const cached = state.cache.get(key) as CacheEntry<T> | undefined;
    const readerRetention = normalizeStaleTime(options.staleTime ?? 0);
    if (
      cached &&
      cause.kind === "normal" &&
      (readerRetention === Infinity ||
        Date.now() - cached.timestamp < readerRetention)
    ) {
      promoteCacheRetention(
        fetcher,
        state,
        key,
        cached,
        readerRetention,
      );
      data.set(cached.data);
      error.set(null);
      loading.set(false);
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:cache-hit", debugTarget, { key });
      return Promise.resolve(cached.data);
    }

    loading.set(true);
    error.set(null);

    const retained = retainInFlight(
      key,
      fetcher,
      cause,
      options.staleTime ?? 0,
    );
    // A fetcher is allowed to synchronously call back into refresh(). The
    // nested run owns the current release token; the displaced outer run must
    // release itself instead of overwriting that newer token on unwind.
    if (!disposed && seq === requestSeq && key === lastKey) {
      releaseInFlight = retained.release;
    } else {
      retained.release();
    }

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
        data.set(result);
        loading.set(false);
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:success", debugTarget, { key, seq, result });
      },
      (err: unknown) => {
        retained.release();
        if (seq !== requestSeq) return;
        if (key !== lastKey) return;
        error.set(err instanceof Error ? err : new Error(String(err)));
        loading.set(false);
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("resource:error", debugTarget, { key, seq, error: err });
      },
    );
    return retained.promise;
  };

  const enterDisabledState = (keyChanged: boolean): void => {
    releaseInFlight?.();
    releaseInFlight = null;
    requestSeq++;
    if (keyChanged && options.retainPreviousData === false) {
      data.set(undefined);
    }
    lastKey = "";
    hasKey = true;
    error.set(null);
    loading.set(false);
  };

  // subscribe to key changes
  const stopKeyEffect = effect(() => {
    const key = keyFn();
    keySig.set(key);
    const keyChanged = hasKey && key !== lastKey;
    if (key === "") {
      if (!hasKey || keyChanged) enterDisabledState(keyChanged);
      return;
    }
    if (!hasKey || keyChanged) {
      if (keyChanged && options.retainPreviousData === false) {
        data.set(undefined);
      }
      lastKey = key;
      hasKey = true;
      void run(key, { kind: "normal" });
    }
  });

  // subscribe to global invalidation
  const onInv = (pattern: string, invalidationId: number) => {
    if (disposed) return;
    const key = untracked(keyFn);
    const keyChanged = hasKey && key !== lastKey;
    keySig.set(key);
    if (key === "") {
      if (!hasKey || keyChanged) enterDisabledState(keyChanged);
      return;
    }
    if (!matchesPattern(key, pattern)) return;
    if (keyChanged && options.retainPreviousData === false) {
      data.set(undefined);
    }
    lastKey = key;
    hasKey = true;
    void run(key, { kind: "invalidation", id: invalidationId });
  };
  invalidators.add(onInv);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    requestSeq++;
    stopKeyEffect();
    invalidators.delete(onInv);
    releaseInFlight?.();
    releaseInFlight = null;
    loading.set(false);
    if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) {
      emitDevtools("resource:dispose", debugTarget, { key: lastKey });
    }
  };

  // Automatic for page/component ownership; still public for standalone
  // resources and integration layers that own their lifetime explicitly.
  lifecycle?.onDispose(dispose);

  return {
    data,
    error,
    loading,
    key: keySig,
    refresh() {
      if (disposed) {
        return Promise.reject(new Error("[mado:resource] resource is disposed"));
      }
      // read key without tracking — otherwise we'd end up inside someone else's effect
      const key = untracked(keyFn);
      const keyChanged = hasKey && key !== lastKey;
      keySig.set(key);
      if (key === "") {
        enterDisabledState(keyChanged);
        return Promise.reject(
          new Error(
            "[mado:resource] cannot refresh while the key is empty; an empty string disables the resource",
          ),
        );
      }
      if (keyChanged && options.retainPreviousData === false) {
        data.set(undefined);
      }
      lastKey = key;
      hasKey = true;
      return run(key, { kind: "refresh" });
    },
    mutate(next) {
      if (disposed) {
        throw new Error("[mado:resource] resource is disposed");
      }
      const prev = data.peek();
      const value =
        typeof next === "function"
          ? (next as (p: T | undefined) => T)(prev)
          : next;
      data.set(value);
      const key = untracked(keyFn);
      if (hasKey && key !== "" && key === lastKey) {
        const state = getFetcherState(fetcher);
        writeCache(
          fetcher,
          state,
          key,
          value,
          options.staleTime ?? 0,
        );
      }
    },
    dispose,
  };
}

function retainInFlight<T>(
  key: string,
  fetcher: ResourceFetcher<T>,
  cause: RequestCause,
  staleTime: number,
): { promise: Promise<T>; release: () => void } {
  const state = getFetcherState(fetcher);
  const current = state.inFlight.get(key) as InFlightEntry<T> | undefined;
  let entry =
    cause.kind === "normal" ||
    (cause.kind === "invalidation" &&
      current?.invalidationId === cause.id)
      ? current
      : undefined;

  if (!entry) {
    const controller = new AbortController();
    const generation = (state.generations.get(key) ?? 0) + 1;
    state.generations.set(key, generation);
    let resolveFetch!: (value: T | PromiseLike<T>) => void;
    let rejectFetch!: (reason?: unknown) => void;
    const fetchPromise = new Promise<T>((resolve, reject) => {
      resolveFetch = resolve;
      rejectFetch = reject;
    });
    const createdEntry: InFlightEntry<T> = {
      controller,
      consumers: 0,
      generation,
      invalidationId: cause.kind === "invalidation" ? cause.id : null,
      cacheRetention: normalizeStaleTime(staleTime),
      settled: false,
      retired: false,
      promise: trackStatic(fetchPromise, `resource ${key}`),
    };
    entry = createdEntry;
    // Publish the complete placeholder before calling user code. A
    // synchronous reentrant refresh can now displace this entry, and the outer
    // call cannot overwrite the newer in-flight owner when it unwinds.
    state.pending.add(createdEntry as InFlightEntry<unknown>);
    state.inFlight.set(key, createdEntry as InFlightEntry<unknown>);
    try {
      resolveFetch(fetcher(key, controller.signal));
    } catch (err) {
      rejectFetch(err);
    }
    createdEntry.promise.then(
      (result) => {
        if (createdEntry.settled) return;
        createdEntry.settled = true;
        const authoritative =
          !createdEntry.retired &&
          state.inFlight.get(key) === createdEntry &&
          state.generations.get(key) === createdEntry.generation;
        removeCurrentInFlight(state, key, createdEntry);
        if (authoritative) {
          writeCache(
            fetcher,
            state,
            key,
            result,
            createdEntry.cacheRetention,
          );
        }
        state.pending.delete(createdEntry as InFlightEntry<unknown>);
        releaseFetcherState(fetcher, state);
      },
      () => {
        if (createdEntry.settled) return;
        createdEntry.settled = true;
        removeCurrentInFlight(state, key, createdEntry);
        state.pending.delete(createdEntry as InFlightEntry<unknown>);
        releaseFetcherState(fetcher, state);
      },
    );
  } else {
    entry.cacheRetention = maxStaleTime(
      entry.cacheRetention,
      normalizeStaleTime(staleTime),
    );
  }

  entry.consumers++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.consumers--;
    if (entry.consumers === 0 && !entry.settled) {
      // Do not retain an ownerless request forever when a user fetcher ignores
      // AbortSignal or never settles. Retire and unlink it synchronously;
      // eventual settlement remains fenced by identity + `retired`.
      entry.retired = true;
      removeCurrentInFlight(state, key, entry);
      state.pending.delete(entry as InFlightEntry<unknown>);
      releaseFetcherState(fetcher, state);
      entry.controller.abort();
    }
  };

  return { promise: entry.promise, release };
}

function getFetcherState<T>(fetcher: ResourceFetcher<T>): FetcherState {
  let state = fetcherStates.get(fetcher as ResourceFetcher<unknown>);
  if (!state) {
    state = {
      cache: new Map(),
      inFlight: new Map(),
      pending: new Set(),
      generations: new Map(),
    };
    fetcherStates.set(fetcher as ResourceFetcher<unknown>, state);
  }
  return state;
}

function releaseFetcherState(
  fetcher: ResourceFetcher<unknown>,
  state: FetcherState,
): void {
  if (
    fetcherStates.get(fetcher) === state &&
    state.cache.size === 0 &&
    state.pending.size === 0
  ) {
    fetcherStates.delete(fetcher);
  }
}

function removeCurrentInFlight<T>(
  state: FetcherState,
  key: string,
  entry: InFlightEntry<T>,
): boolean {
  if (state.inFlight.get(key) !== entry) return false;
  state.inFlight.delete(key);
  if (state.generations.get(key) === entry.generation) {
    state.generations.delete(key);
  }
  return true;
}

function writeCache<T>(
  fetcher: ResourceFetcher<T>,
  state: FetcherState,
  key: string,
  data: T,
  staleTime: number,
): void {
  const previous = state.cache.get(key) as CacheEntry<T> | undefined;
  const retentionTime = maxStaleTime(
    previous?.retentionTime ?? 0,
    normalizeStaleTime(staleTime),
  );
  if (retentionTime <= 0) {
    releaseFetcherState(fetcher as ResourceFetcher<unknown>, state);
    return;
  }
  if (previous?.expires) clearTimeout(previous.expires);
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    retentionTime,
    expires: null,
  };
  state.cache.set(key, entry as CacheEntry<unknown>);
  scheduleCacheExpiry(fetcher, state, key, entry);
}

function promoteCacheRetention<T>(
  fetcher: ResourceFetcher<T>,
  state: FetcherState,
  key: string,
  entry: CacheEntry<T>,
  staleTime: number,
): void {
  const retentionTime = maxStaleTime(entry.retentionTime, staleTime);
  if (retentionTime === entry.retentionTime) return;
  entry.retentionTime = retentionTime;
  // Promotion extends the original data lifetime. It deliberately does not
  // rewrite `timestamp`: reading cached data is not a new server result.
  scheduleCacheExpiry(fetcher, state, key, entry);
}

function scheduleCacheExpiry<T>(
  fetcher: ResourceFetcher<T>,
  state: FetcherState,
  key: string,
  entry: CacheEntry<T>,
): void {
  if (entry.expires) clearTimeout(entry.expires);
  entry.expires = null;
  if (entry.retentionTime === Infinity) return;
  const remaining = Math.max(
    0,
    entry.timestamp + entry.retentionTime - Date.now(),
  );
  entry.expires = setTimeout(() => {
    if (state.cache.get(key) === entry) state.cache.delete(key);
    releaseFetcherState(fetcher as ResourceFetcher<unknown>, state);
  }, remaining);
  (entry.expires as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

function normalizeStaleTime(staleTime: number): number {
  if (staleTime === Infinity) return Infinity;
  return Math.max(0, staleTime);
}

function maxStaleTime(left: number, right: number): number {
  return left === Infinity || right === Infinity
    ? Infinity
    : Math.max(left, right);
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
   * Invalidation runs AFTER a successful request. Any error while resolving or
   * applying its patterns is logged, but the mutation success is preserved
   * (invalidation is best-effort).
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
  /** Abort active runs, clear state and keep this mutation reusable. */
  reset(): void;
  /** Abort active runs, clear state and permanently release this mutation. */
  dispose(): void;
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
  let disposed = false;
  const debugTarget = {};
  if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("mutation:create", debugTarget);

  const abortError = (): DOMException =>
    new DOMException("The operation was aborted.", "AbortError");

  const clear = (): void => {
    generation++;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    inFlight = 0;
    loading.set(false);
    error.set(null);
    data.set(undefined);
  };

  const isCurrent = (
    controller: AbortController,
    runGeneration: number,
  ): boolean =>
    !disposed &&
    !controller.signal.aborted &&
    runGeneration === generation;

  const settle = (ac: AbortController, runGeneration: number): void => {
    // A run can enter catch after its success path settled (for example when
    // a hostile invalidation iterator throws). Settlement must stay exactly
    // once or the shared counter can go negative and poison later runs.
    if (!controllers.delete(ac)) return;
    // `abortPrevious` cancels an older controller without advancing the
    // generation, so that run must still leave the shared in-flight count.
    // reset()/dispose() advance the generation and already reset the count.
    if (disposed || runGeneration !== generation) return;
    inFlight--;
    if (inFlight === 0) loading.set(false);
  };

  const instance: Mutation<TArgs, TResult> = {
    loading,
    error,
    data,
    async run(args) {
      if (disposed) {
        throw new Error("[mado:mutation] mutation is disposed");
      }
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
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("mutation:request", debugTarget, { args, generation });
      error.set(null);
      try {
        const result = await fetcher(args, ac.signal);
        if (!isCurrent(ac, runGeneration)) throw abortError();
        data.set(result);
        if (!isCurrent(ac, runGeneration)) throw abortError();
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("mutation:success", debugTarget, { args, result, generation });
        settle(ac, runGeneration);
        if (!isCurrent(ac, runGeneration)) throw abortError();
        const inv = options.invalidates;
        if (inv) {
          try {
            const patterns = typeof inv === "function" ? inv(result, args) : inv;
            if (!isCurrent(ac, runGeneration)) throw abortError();
            for (const p of patterns) {
              invalidate(p);
              if (!isCurrent(ac, runGeneration)) throw abortError();
            }
          } catch (err) {
            // Disposal/reset wins over best-effort invalidation: callers must
            // observe that this owner no longer accepts the result.
            if (!isCurrent(ac, runGeneration)) throw abortError();
            try {
              reportError(
                "resource",
                "mutation-invalidates",
                "mutation invalidation threw",
                err,
              );
            } catch {
              // Diagnostics are best-effort too; never convert an already
              // committed write into a failure because a devtools hook threw.
            }
            // Diagnostics are synchronous extension points. A listener may
            // dispose/reset the mutation while observing this failure.
            if (!isCurrent(ac, runGeneration)) throw abortError();
          }
        }
        return result;
      } catch (err) {
        const failure = isCurrent(ac, runGeneration) ? err : abortError();
        if (isCurrent(ac, runGeneration)) {
          error.set(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
        }
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("mutation:error", debugTarget, { args, error: failure, generation });
        settle(ac, runGeneration);
        throw failure;
      }
    },
    reset() {
      if (disposed) return;
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("mutation:reset", debugTarget, { generation });
      clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) {
        emitDevtools("mutation:dispose", debugTarget, { generation });
      }
    },
  };

  // Page/component mutations are owned by that lifecycle. Mutations created
  // at module scope have no active lifecycle and remain explicitly shared.
  getCurrentLifecycle()?.onDispose(instance.dispose);

  return instance;
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
 * `T` is a compile-time assertion only. This helper calls Response.json() but
 * does not validate Content-Type, an API envelope, or the runtime DTO shape.
 * APIs that require a strict transport contract must provide an
 * application-owned fetcher/parser and validate their untrusted response.
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
  hasFetcherState(fetcher: ResourceFetcher<unknown>): boolean {
    return fetcherStates.has(fetcher);
  },
  pendingSize(fetcher: ResourceFetcher<unknown>): number {
    return fetcherStates.get(fetcher)?.pending.size ?? 0;
  },
  generationSize(fetcher: ResourceFetcher<unknown>): number {
    return fetcherStates.get(fetcher)?.generations.size ?? 0;
  },
  cacheInfo(
    fetcher: ResourceFetcher<unknown>,
    key: string,
  ): { timestamp: number; retentionTime: number } | null {
    const entry = fetcherStates.get(fetcher)?.cache.get(key);
    return entry
      ? { timestamp: entry.timestamp, retentionTime: entry.retentionTime }
      : null;
  },
  clearCache(): void {
    for (const state of fetcherStates.values()) {
      for (const entry of state.cache.values()) {
        if (entry.expires) clearTimeout(entry.expires);
      }
      for (const entry of state.pending) entry.controller.abort();
    }
    fetcherStates.clear();
  },
};
