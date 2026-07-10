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

import { reportError } from "./diagnostics.js";

type Subscriber = () => void;

const MAX_FLUSH_RUNS_PER_SUBSCRIBER = 100;

/**
 * Subscriber with metadata.
 *   - sync=true → when a dep changes, run() is called SYNCHRONOUSLY
 *     (used by computed: dirty is marked without delay);
 *   - sync=false → run() is scheduled via the microtask scheduler
 *     (used by effect: renders are batched).
 */
interface SubscriberEntry {
  run: Subscriber;
  sync: boolean;
}

interface Tracker {
  deps: Set<SubscriberSet>;
  entry: SubscriberEntry;
}

let activeTracker: Tracker | null = null;

class SubscriberSet extends Set<SubscriberEntry> {
  private emptyScheduled = false;

  constructor(private readonly onEmpty?: () => void) {
    super();
  }

  override add(entry: SubscriberEntry): this {
    super.add(entry);
    this.emptyScheduled = false;
    return this;
  }

  override delete(entry: SubscriberEntry): boolean {
    const deleted = super.delete(entry);
    if (deleted) this.queueEmpty();
    return deleted;
  }

  override clear(): void {
    const hadEntries = this.size > 0;
    super.clear();
    if (hadEntries) this.queueEmpty();
  }

  private queueEmpty(): void {
    if (!this.onEmpty || this.size > 0 || this.emptyScheduled) return;
    this.emptyScheduled = true;
    queueMicrotask(() => {
      this.emptyScheduled = false;
      if (this.size === 0) this.onEmpty?.();
    });
  }
}

function cleanupTracker(tracker: Tracker): void {
  for (const dep of tracker.deps) dep.delete(tracker.entry);
  tracker.deps.clear();
}

// ---------- Scheduler ----------

const pending = new Set<Subscriber>();
// Reconciles for observed `equals`-computeds whose deps changed inside a batch.
// Deferred to batch end so they recompute once, on fully-applied (consistent)
// state, instead of eagerly inside each set() on half-applied state.
// (FABLE_REPORT.md finding #4)
const deferredEquals = new Set<Subscriber>();
let batchDepth = 0;
let flushScheduled = false;

/** Run all deferred equals-computed reconciles; cascades may enqueue more. */
function drainDeferredEquals(): void {
  while (deferredEquals.size > 0) {
    const items = [...deferredEquals];
    deferredEquals.clear();
    for (const fn of items) {
      try {
        fn();
      } catch (err) {
        reportError("reactivity", "computed-reconcile", "deferred computed reconcile threw", err);
      }
    }
  }
}


function schedule(sub: Subscriber): void {
  pending.add(sub);
  if (batchDepth > 0) return;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
}

function flush(): void {
  flushScheduled = false;
  // Defensive: reconcile any deferred equals-computeds before running effects,
  // so effects always observe settled computed values.
  drainDeferredEquals();
  const runCounts = new Map<Subscriber, number>();

  // guard against Set modification during iteration
  while (pending.size > 0) {
    const subs = [...pending];
    pending.clear();
    for (const sub of subs) {
      const runs = (runCounts.get(sub) ?? 0) + 1;
      runCounts.set(sub, runs);
      if (runs > MAX_FLUSH_RUNS_PER_SUBSCRIBER) {
        reportError(
          "reactivity",
          "effect-cycle",
          `effect cycle detected: subscriber re-ran more than ${MAX_FLUSH_RUNS_PER_SUBSCRIBER} times in one flush`,
          undefined,
        );
        continue;
      }
      try {
        sub();
      } catch (err) {
        // a subscriber must not crash the others
        reportError("reactivity", "effect-run", "effect threw", err);
      }
    }
  }
}

/**
 * Group multiple signal changes into a single subscriber pass.
 * Supports arbitrary nesting.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      // Reconcile deferred equals-computeds now that all sets are applied and
      // state is consistent. This may enqueue effects into `pending`.
      drainDeferredEquals();
      if (pending.size > 0 && !flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    }
  }

}

/**
 * Forcefully flush pending effects right now (synchronously).
 * Useful in tests: removes the need to wait for a microtask.
 */
export function flushSync(): void {
  flush();
}

// ---------- signal ----------


export interface Signal<T> {
  (): T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  peek(): T;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subscribers = new SubscriberSet();

  const read = (() => {
    if (activeTracker) {
      subscribers.add(activeTracker.entry);
      activeTracker.deps.add(subscribers);
    }
    return value;
  }) as Signal<T>;

  read.set = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    // snapshot: a subscriber may re-subscribe in run(), mutating the Set
    const snapshot = [...subscribers];
    // sync subscribers (computed) first — mark dirty before effects read;
    // then async via the scheduler.
    for (const e of snapshot) {
      if (e.sync) {
        try {
          e.run();
        } catch (err) {
          reportError("reactivity", "sync-subscriber", "sync subscriber threw", err);
        }
      }
    }
    for (const e of snapshot) {
      if (!e.sync) schedule(e.run);
    }
  };

  read.update = (fn: (prev: T) => T) => read.set(fn(value));
  read.peek = () => value;
  debugInfo.set(read, { subscribers });

  return read;
}

// ---------- computed (lazy, dirty-flag) ----------


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
export function computed<T>(
  fn: () => T,
  options: ComputedOptions<T> = {},
): Computed<T> {
  let value: T = undefined as unknown as T;
  let dirty = true;
  let hasValue = false;
  let computing = false;

  // Recompute an observed equals-computed and notify only if the value
  // actually changed. Extracted so it can run eagerly (outside a batch) or
  // deferred to batch end (inside a batch), where it sees consistent state.
  const reconcileEquals = (): void => {
    if (subscribers.size === 0) {
      dirty = true;
      suspend();
      return;
    }
    const prevValue = value;
    recompute();
    if (hasValue && options.equals!(prevValue, value)) return;
    notifySubscribers();
  };

  const onInvalidate: Subscriber = () => {
    // dep changed → mark dirty synchronously and cascade.
    // Sync subscribers (other computed) are triggered immediately — they also
    // set dirty without delay. Async (effects) go through the scheduler.
    if (dirty) return;
    if (subscribers.size === 0) {
      dirty = true;
      suspend();
      return;
    }
    if (options.equals && hasValue) {
      // Inside a batch, defer the recompute+compare to batch end so it runs
      // once on fully-applied state instead of eagerly on half-applied state
      // (which would observe a mixed snapshot and could notify spuriously or
      // run O(number of sets) times). (FABLE_REPORT.md finding #4)
      if (batchDepth > 0) {
        deferredEquals.add(reconcileEquals);
        return;
      }
      reconcileEquals();
      return;
    }
    dirty = true;
    notifySubscribers();
  };


  const tracker: Tracker = {
    deps: new Set(),
    entry: { run: onInvalidate, sync: true },
  };

  const subscribers = new SubscriberSet(() => {
    suspend();
  });

  const suspend = (): void => {
    if (subscribers.size > 0) return;
    cleanupTracker(tracker);
    dirty = true;
  };

  const queueSuspendIfUnobserved = (): void => {
    if (subscribers.size > 0) return;
    queueMicrotask(() => {
      if (subscribers.size === 0) suspend();
    });
  };

  const notifySubscribers = (): void => {
    const snapshot = [...subscribers];
    for (const e of snapshot) {
      if (e.sync) {
        try {
          e.run();
        } catch (err) {
          reportError("reactivity", "sync-subscriber", "sync subscriber threw", err);
        }
      } else {
        schedule(e.run);
      }
    }
  };

  const recompute = (): void => {
    if (computing) {
      throw new Error("[mado] computed cycle detected");
    }
    cleanupTracker(tracker);

    const prev = activeTracker;
    activeTracker = tracker;
    computing = true;
    try {
      value = fn();
    } finally {
      computing = false;
      activeTracker = prev;
    }
    dirty = false;
    hasValue = true;
    queueSuspendIfUnobserved();
  };

  const read = (() => {
    if (activeTracker) {
      subscribers.add(activeTracker.entry);
      activeTracker.deps.add(subscribers);
    }
    if (dirty) recompute();
    return value;
  }) as Computed<T>;

  read.peek = () => {
    if (dirty) recompute();
    return value;
  };

  debugInfo.set(read, { subscribers, tracker });
  return read;
}

// ---------- effect ----------

export type Disposer = () => void;

export function effect(fn: () => void | Disposer): Disposer {
  let cleanup: Disposer | void;

  const run: Subscriber = () => {
    cleanupTracker(tracker);

    if (typeof cleanup === "function") cleanup();

    const prev = activeTracker;
    activeTracker = tracker;
    try {
      cleanup = fn();
    } finally {
      activeTracker = prev;
    }
  };

  const tracker: Tracker = {
    deps: new Set(),
    entry: { run, sync: false },
  };

  run();

  return () => {
    cleanupTracker(tracker);
    if (typeof cleanup === "function") cleanup();
  };
}

/**
 * Execute a function outside of tracking — reading signals will not create a subscription.
 */
export function untracked<T>(fn: () => T): T {
  const prev = activeTracker;
  activeTracker = null;
  try {
    return fn();
  } finally {
    activeTracker = prev;
  }
}

interface DebugInfo {
  subscribers: SubscriberSet;
  tracker?: Tracker;
}

const debugInfo = new WeakMap<object, DebugInfo>();

/** @internal */
export const _testHooks = {
  subscriberCount(source: object): number {
    return debugInfo.get(source)?.subscribers.size ?? 0;
  },
  dependencyCount(source: object): number {
    return debugInfo.get(source)?.tracker?.deps.size ?? 0;
  },
};
