/** Context DI implemented through the Web Components Context Protocol. */
import { type Disposer, type Signal } from "./signal.js";
export interface Context<T> {
    readonly _ctx: true;
    readonly key: symbol;
    readonly defaultValue: T;
}
export interface ContextRequestEventDetail<T = unknown> {
    context: unknown;
    callback(value: T, unsubscribe?: Disposer): void;
    subscribe?: boolean;
}
export declare function createContext<T>(defaultValue: T): Context<T>;
/**
 * Provide a context value from a host. The returned signal updates protocol
 * subscribers. Listener/effect cleanup follows the current Mado lifecycle.
 */
export declare function provide<T>(host: HTMLElement, context: Context<T>, initial: T | Signal<T>): Signal<T>;
/** Request the nearest provider and expose its current value as a Signal. */
export declare function inject<T>(host: HTMLElement, context: Context<T>): Signal<T>;
