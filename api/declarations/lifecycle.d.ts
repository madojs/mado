/**
 * Lifecycle context for auto-cleanup of resources inside a component.
 *
 * Core idea: when a component-setup runs, we push the current
 * "lifecycle" — an object with onDispose() — onto a module-local stack.
 * Any function like resource() that creates long-lived subscriptions
 * (timers, listeners, network subscriptions) can call getCurrentLifecycle()
 * and register its own cleanup.
 *
 * This avoids leaks on component unmount — without explicitly threading
 * ComponentContext into every helper.
 *
 * Usage:
 *
 *   // in component.ts
 *   runInLifecycle(myLifecycle, () => setup(ctx));
 *
 *   // in resource.ts
 *   const lc = getCurrentLifecycle();
 *   if (lc) lc.onDispose(() => abort.abort());
 *   else console.warn('[mado] resource() outside component — cleanup must be manual');
 */
import type { Disposer } from "./signal.js";
export interface Lifecycle {
    /** Register a cleanup function. Called when the lifecycle is disposed. */
    onDispose(fn: Disposer): void;
}
/**
 * Return the currently active lifecycle, or null if code runs
 * outside a component setup.
 */
export declare function getCurrentLifecycle(): Lifecycle | null;
/**
 * Execute fn with the given lifecycle set. Supports nesting:
 * the previous lifecycle is restored after fn returns (including exceptions).
 */
export declare function runInLifecycle<T>(lc: Lifecycle, fn: () => T): T;
/**
 * Create a new lifecycle. Returns the Lifecycle interface and a
 * dispose() method that runs all registered cleanup callbacks.
 */
export interface LifecycleHandle extends Lifecycle {
    dispose(): void;
}
export declare function createLifecycle(): LifecycleHandle;
