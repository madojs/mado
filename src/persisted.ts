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

import { signal as makeSignal, effect, type Signal } from "./signal.js";

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

  // 2) Write on each change (optionally debounced)
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  const flushWrite = (v: T) => {
    if (!storage) return;
    try {
      storage.setItem(fullKey, serialize(v));
    } catch {
      /* QuotaExceeded — skip */
    }
  };

  effect(() => {
    const v = base();
    if (options.debounce && options.debounce > 0) {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => flushWrite(v), options.debounce);
    } else {
      flushWrite(v);
    }
  });

  // 3) Cross-tab synchronisation via BroadcastChannel
  const wantSync = options.syncTabs ?? options.storage !== "session";
  let bc: BroadcastChannel | null = null;
  if (wantSync && typeof BroadcastChannel !== "undefined") {
    try {
      bc = new BroadcastChannel(`mado:persisted:${key}`);
      bc.addEventListener("message", (e) => {
        try {
          base.set(e.data as T);
        } catch {
          /* noop */
        }
      });
      // publish changes
      effect(() => {
        const v = base();
        // peek-exclusion to avoid infinite loop: we don't read from bc-source
        bc?.postMessage(v);
      });
    } catch {
      bc = null;
    }
  }

  const out = base as PersistedSignal<T>;
  out.destroy = () => {
    if (storage) {
      try {
        storage.removeItem(fullKey);
      } catch {
        /* noop */
      }
    }
    bc?.close();
  };
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
