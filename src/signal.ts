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

type Subscriber = () => void;

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
  deps: Set<Set<SubscriberEntry>>;
  entry: SubscriberEntry;
}

let activeTracker: Tracker | null = null;

// ---------- Scheduler ----------

const pending = new Set<Subscriber>();
let batchDepth = 0;
let flushScheduled = false;

function schedule(sub: Subscriber): void {
  pending.add(sub);
  if (batchDepth > 0) return;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flush);
}

function flush(): void {
  flushScheduled = false;
  // guard against Set modification during iteration
  while (pending.size > 0) {
    const subs = [...pending];
    pending.clear();
    for (const sub of subs) {
      try {
        sub();
      } catch (err) {
        // a subscriber must not crash the others
        // eslint-disable-next-line no-console
        console.error("[mado] effect threw:", err);
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
    if (batchDepth === 0 && pending.size > 0 && !flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flush);
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
  const subscribers = new Set<SubscriberEntry>();

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
          // eslint-disable-next-line no-console
          console.error("[mado] sync subscriber threw:", err);
        }
      }
    }
    for (const e of snapshot) {
      if (!e.sync) schedule(e.run);
    }
  };

  read.update = (fn: (prev: T) => T) => read.set(fn(value));
  read.peek = () => value;

  return read;
}

// ---------- computed (lazy, dirty-flag) ----------


export interface Computed<T> {
  (): T;
  peek(): T;
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
export function computed<T>(fn: () => T): Computed<T> {
  const subscribers = new Set<SubscriberEntry>();
  let value: T = undefined as unknown as T;
  let dirty = true;

  const onInvalidate: Subscriber = () => {
    // dep changed → mark dirty synchronously and cascade.
    // Sync subscribers (other computed) are triggered immediately — they also
    // set dirty without delay. Async (effects) go through the scheduler.
    if (dirty) return;
    dirty = true;
    const snapshot = [...subscribers];
    for (const e of snapshot) {
      if (e.sync) {
        try {
          e.run();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[mado] sync subscriber threw:", err);
        }
      } else {
        schedule(e.run);
      }
    }
  };

  const tracker: Tracker = {
    deps: new Set(),
    entry: { run: onInvalidate, sync: true },
  };

  const recompute = (): void => {
    for (const dep of tracker.deps) dep.delete(tracker.entry);
    tracker.deps.clear();

    const prev = activeTracker;
    activeTracker = tracker;
    try {
      value = fn();
    } finally {
      activeTracker = prev;
    }
    dirty = false;
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

  return read;
}

// ---------- effect ----------

export type Disposer = () => void;

export function effect(fn: () => void | Disposer): Disposer {
  let cleanup: Disposer | void;

  const run: Subscriber = () => {
    for (const dep of tracker.deps) dep.delete(tracker.entry);
    tracker.deps.clear();

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
    for (const dep of tracker.deps) dep.delete(tracker.entry);
    tracker.deps.clear();
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
