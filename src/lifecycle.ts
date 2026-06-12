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

let current: Lifecycle | null = null;

/**
 * Return the currently active lifecycle, or null if code runs
 * outside a component setup.
 */
export function getCurrentLifecycle(): Lifecycle | null {
  return current;
}

/**
 * Execute fn with the given lifecycle set. Supports nesting:
 * the previous lifecycle is restored after fn returns (including exceptions).
 */
export function runInLifecycle<T>(lc: Lifecycle, fn: () => T): T {
  const prev = current;
  current = lc;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/**
 * Create a new lifecycle. Returns the Lifecycle interface and a
 * dispose() method that runs all registered cleanup callbacks.
 */
export interface LifecycleHandle extends Lifecycle {
  dispose(): void;
}

export function createLifecycle(): LifecycleHandle {
  const disposers: Disposer[] = [];
  let disposed = false;
  return {
    onDispose(fn) {
      // If the lifecycle is already disposed, run the cleanup immediately
      // rather than dropping it silently. Async page code that registers a
      // cleanup after navigation (e.g. in a resolved promise) still gets torn
      // down. Matches Solid/Vue. (FABLE_REPORT.md finding #9)
      if (disposed) {
        try {
          fn();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[mado] cleanup threw:", err);
        }
        return;
      }
      disposers.push(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // reverse order — LIFO, like a stack
      for (let i = disposers.length - 1; i >= 0; i--) {
        try {
          disposers[i]!();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[mado] cleanup threw:", err);
        }
      }
      disposers.length = 0;
    },
  };
}
