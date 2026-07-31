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
import { type Signal } from "./signal.js";
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
    /** Stop storage/channel subscriptions while preserving the stored value. */
    dispose(): void;
    /** Remove the stored value without disposing the signal. */
    clear(): void;
    /** Remove the stored value and dispose all persistence subscriptions. */
    destroy(): void;
}
export declare function persisted<T>(key: string, base: Signal<T>, options?: PersistedOptions<T>): PersistedSignal<T>;
