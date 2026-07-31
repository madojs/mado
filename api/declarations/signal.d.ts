/**
 * Reactivity via signals.
 *
 * Idea: a signal is a getter-function that also has .set / .update.
 * When a signal is read inside an effect/computed, we record "who read it"
 * and notify subscribers when the value changes. No proxies, no Virtual DOM.
 *
 * Performance:
 *   - effect runs are deduplicated and scheduled via queueMicrotask,
 *     so multiple .set() calls in a row produce a single subscriber pass;
 *   - batch(fn) explicitly groups changes (supports arbitrary nesting);
 *   - flushSync() — flush pending effects right now (useful in tests).
 *
 * API:
 *   const count = signal(0);
 *   count();            // get
 *   count.set(5);       // set
 *   count.update(n=>n+1);
 *
 *   const doubled = computed(() => count() * 2);
 *
 *   effect(() => console.log(count()));
 *
 *   batch(() => { a.set(1); b.set(2); });
 */
/**
 * Group multiple signal changes into a single subscriber pass.
 * Supports arbitrary nesting.
 */
export declare function batch<T>(fn: () => T): T;
/**
 * Forcefully flush pending effects right now (synchronously).
 * Useful in tests: removes the need to wait for a microtask.
 */
export declare function flushSync(): void;
export interface Signal<T> {
    (): T;
    set(value: T): void;
    update(updater: (prev: T) => T): void;
    peek(): T;
}
export declare function signal<T>(initial: T): Signal<T>;
export interface Computed<T> {
    (): T;
    peek(): T;
}
export interface ComputedOptions<T> {
    /**
     * Equality check used when an observed computed is invalidated.
     *
     * If the new value is equal to the previous value, subscribers are not
     * notified. Defaults to always notifying on dependency invalidation, which
     * preserves the classic lazy dirty-flag behavior.
     */
    equals?: (prev: T, next: T) => boolean;
}
/**
 * Lazy computed based on a dirty-flag:
 *   - fn is NOT called until the computed is read;
 *   - if none of the deps changed since the last read — cached value is returned;
 *   - when a dep changes the computed is marked dirty (NOT recomputed),
 *     and triggers its own subscribers via schedule(). Subscribers
 *     (an effect or another computed) will read our value on their next run
 *     → fn is recomputed exactly once.
 *
 * Implementation: computed = "signal source" (has subscribers) +
 * "tracker" (has deps). When a dep calls the tracker's run(),
 * instead of actually recomputing we mark ourselves dirty and
 * propagate to subscribers.
 */
export declare function computed<T>(fn: () => T, options?: ComputedOptions<T>): Computed<T>;
export type Disposer = () => void;
export declare function effect(fn: () => void | Disposer): Disposer;
/**
 * Execute a function outside of tracking — reading signals will not create a subscription.
 */
export declare function untracked<T>(fn: () => T): T;
