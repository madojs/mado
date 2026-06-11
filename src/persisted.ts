/**
 * persisted() wraps a signal in localStorage / sessionStorage.
 *
 * Useful for:
 *   - theme (light/dark)
 *   - selected language
 *   - last viewed product
 *   - form drafts
 *
 *   const theme = persisted('theme', signal<'light'|'dark'>('light'));
 *   const draft = persisted('newPost.draft', signal(''),
 *     { storage: 'session', debounce: 300 });
 *
 * Returns the same Signal API. Reads from storage on startup; writes on every
 * change (optionally debounced). Synchronizes across tabs via BroadcastChannel.
 *
 * Notes:
 *   - JSON.parse/stringify; Date/Map/Set need a custom serializer.
 *   - On QuotaExceeded or private-mode failures it silently falls back to memory.
 *   - destroy() optionally closes the BroadcastChannel subscription.
 */

import { effect, type Disposer, type Signal } from "./signal.js";
import { getCurrentLifecycle } from "./lifecycle.js";


export interface PersistedOptions<T> {
  /** "local" (default) or "session". */
  storage?: "local" | "session";
  /** Write delay in ms. Default 0 (synchronous). */
  debounce?: number;
  /**
   * Key prefix. Default "mado:". Helps avoid collisions
   * with other scripts on the page.
   */
  keyPrefix?: string;
  /** Custom serialiser. Default JSON.stringify. */
  serialize?: (value: T) => string;
  /** Custom deserialiser. Default JSON.parse. */
  deserialize?: (raw: string) => T;
  /**
   * Cross-tab synchronisation via BroadcastChannel.
   * Default true for "local", false for "session".
   */
  syncTabs?: boolean;
}

export interface PersistedSignal<T> extends Signal<T> {
  /** Remove the value from storage and unsubscribe from the bus. */
  destroy(): void;
}

export function persisted<T>(
  key: string,
  base: Signal<T>,
  options: PersistedOptions<T> = {},
): PersistedSignal<T> {
  const prefix = options.keyPrefix ?? "mado:";
  const fullKey = prefix + key;
  const storage =
    options.storage === "session"
      ? safeStorage("sessionStorage")
      : safeStorage("localStorage");
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize =
    options.deserialize ?? ((s: string) => JSON.parse(s) as T);

  // 1) Read initial value
  if (storage) {
    try {
      const raw = storage.getItem(fullKey);
      if (raw != null) base.set(deserialize(raw));
    } catch {
      /* corrupt JSON — ignore */
    }
  }

  // Echo guard: the serialized form of the last value we either received from
  // the channel or published to it. For object/array values, structured clone
  // gives a new identity on every cross-tab hop, so Object.is inside signal.set
  // never suppresses the echo — without this guard two tabs ping-pong forever.
  // Seeded with the current value so the creation-time publish is a no-op.
  let lastSync = serialize(base.peek());
  let destroyed = false;

  // Collected so destroy() actually tears everything down. The original code
  // dropped these disposers, so destroy() left the write effect alive and the
  // next set() re-created the storage key.
  const disposers: Disposer[] = [];

  // 2) Write on each change (optionally debounced)
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  const flushWrite = (v: T) => {
    if (!storage || destroyed) return;
    try {
      storage.setItem(fullKey, serialize(v));
    } catch {
      /* QuotaExceeded — skip */
    }
  };

  disposers.push(
    effect(() => {
      const v = base();
      if (options.debounce && options.debounce > 0) {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => flushWrite(v), options.debounce);
      } else {
        flushWrite(v);
      }
    }),
  );

  // 3) Cross-tab synchronisation via BroadcastChannel
  const wantSync = options.syncTabs ?? options.storage !== "session";
  let bc: BroadcastChannel | null = null;
  if (wantSync && typeof BroadcastChannel !== "undefined") {
    try {
      bc = new BroadcastChannel(`mado:persisted:${key}`);
      const onMessage = (e: MessageEvent) => {
        try {
          // Record what arrived BEFORE applying it, so the publisher effect
          // below recognises this value as remote-origin and does not echo it.
          lastSync = serialize(e.data as T);
          base.set(e.data as T);
        } catch {
          /* noop */
        }
      };
      bc.addEventListener("message", onMessage as EventListener);
      // publish changes — but never re-publish a value that just arrived from
      // another tab (which is what created the infinite loop).
      disposers.push(
        effect(() => {
          const v = base();
          const s = serialize(v);
          if (s === lastSync) return; // unchanged or remote-origin → no echo
          lastSync = s;
          bc?.postMessage(v);
        }),
      );
    } catch {
      bc = null;
    }
  }

  const out = base as PersistedSignal<T>;
  out.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    // Dispose the write + publish effects so later set() calls are inert.
    for (const d of disposers.splice(0)) d();
    if (storage) {
      try {
        storage.removeItem(fullKey);
      } catch {
        /* noop */
      }
    }
    bc?.close();
    bc = null;
  };

  // Tie destroy() to the surrounding component/page lifecycle when present, so
  // a persisted() created inside setup() does not leak its effects/channel.
  getCurrentLifecycle()?.onDispose(() => out.destroy());

  return out;
}


function safeStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    const s = (globalThis as unknown as Record<string, Storage | undefined>)[
      name
    ];
    if (!s) return null;
    // Some browsers throw on storage access in private mode.
    const probe = "__madoprobe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
