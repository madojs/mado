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
import { type Signal } from "./signal.js";
type ResourceFetcher<T> = (key: string, signal: AbortSignal) => Promise<T>;
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
export declare function invalidate(pattern: string): void;
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
export declare function resource<T>(keyFn: () => string, fetcher: ResourceFetcher<T>, options?: ResourceOptions): Resource<T>;
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
    invalidates?: readonly string[] | ((result: TResult, args: TArgs) => readonly string[]);
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
export declare function mutation<TArgs, TResult>(fetcher: (args: TArgs, signal: AbortSignal) => Promise<TResult>, options?: MutationOptions<TArgs, TResult>): Mutation<TArgs, TResult>;
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
export declare class HttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    readonly body: unknown;
    constructor(status: number, statusText: string, url: string, body: unknown);
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
export declare function jsonFetcher<T>(init?: RequestInit): (url: string, signal: AbortSignal) => Promise<T>;
export {};
