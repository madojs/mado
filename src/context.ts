/** Context DI implemented through the Web Components Context Protocol. */

import { effect, signal, type Disposer, type Signal } from "./signal.js";
import { getCurrentLifecycle } from "./lifecycle.js";
import { warnOnce } from "./diagnostics.js";

const CONTEXT_EVENT = "context-request";

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

export function createContext<T>(defaultValue: T): Context<T> {
  return {
    _ctx: true,
    key: Symbol("mado-context"),
    defaultValue,
  };
}

/**
 * Provide a context value from a host. The returned signal updates protocol
 * subscribers. Listener/effect cleanup follows the current Mado lifecycle.
 */
export function provide<T>(
  host: HTMLElement,
  context: Context<T>,
  initial: T | Signal<T>,
): Signal<T> {
  const source = isSignal<T>(initial) ? initial : signal(initial as T);
  const subscribers = new Set<(value: T, unsubscribe?: Disposer) => void>();
  let disposed = false;

  const handler = (event: Event): void => {
    const request = event as CustomEvent<ContextRequestEventDetail<T>>;
    if (request.detail?.context !== context.key) return;
    event.stopPropagation();

    if (!request.detail.subscribe) {
      request.detail.callback(source.peek());
      return;
    }

    const callback = request.detail.callback;
    let active = true;
    const unsubscribe = (): void => {
      if (!active) return;
      active = false;
      subscribers.delete(callback);
    };
    subscribers.add(callback);
    callback(source.peek(), unsubscribe);
  };

  host.addEventListener(CONTEXT_EVENT, handler);
  const stopPublish = effect(() => {
    const value = source();
    for (const callback of [...subscribers]) callback(value);
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    host.removeEventListener(CONTEXT_EVENT, handler);
    subscribers.clear();
    stopPublish();
  };
  const lifecycle = getCurrentLifecycle();
  if (lifecycle) lifecycle.onDispose(dispose);
  else {
    warnOnce(
      "context-provider-outside-lifecycle",
      "provide() called outside a component/page lifecycle; its event listener cannot be cleaned up automatically.",
    );
  }

  return source;
}

/** Request the nearest provider and expose its current value as a Signal. */
export function inject<T>(host: HTMLElement, context: Context<T>): Signal<T> {
  const value = signal(context.defaultValue);
  let unsubscribe: Disposer | undefined;
  const detail: ContextRequestEventDetail<T> = {
    context: context.key,
    subscribe: true,
    callback(next, dispose) {
      value.set(next);
      if (dispose) unsubscribe = dispose;
    },
  };

  host.dispatchEvent(
    new CustomEvent<ContextRequestEventDetail<T>>(CONTEXT_EVENT, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );

  getCurrentLifecycle()?.onDispose(() => {
    unsubscribe?.();
    unsubscribe = undefined;
  });
  return value;
}

function isSignal<T>(value: T | Signal<T>): value is Signal<T> {
  return typeof value === "function" &&
    typeof (value as Partial<Signal<T>>).set === "function" &&
    typeof (value as Partial<Signal<T>>).peek === "function";
}
