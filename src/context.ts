/**
 * Context (DI) without props drilling. A native pattern from Lit / Open Web Components.
 *
 *   const ThemeCtx = createContext<'light'|'dark'>('light');
 *
 *   component('x-app', ({ host }) => {
 *     provide(host, ThemeCtx, signal('dark'));
 *     return () => html`<x-child/>`;
 *   });
 *
 *   component('x-child', ({ host }) => {
 *     const theme = inject(host, ThemeCtx);   // signal: () => 'dark' | 'light'
 *     return () => html`<div data-theme=${theme}>...</div>`;
 *   });
 *
 * How it works:
 *   provide() listens for the 'mado:context' event on the host — when a child
 *   component dispatches it (bubbles), the parent writes the current signal
 *   into the event detail and calls preventDefault.
 *   inject() dispatches the event and reads the result.
 *   This fully conforms to the Web Components Community Context Protocol.
 */

import { signal, type Signal } from "./signal.js";

const CONTEXT_EVENT = "mado:context";

export interface Context<T> {
  readonly _ctx: true;
  readonly key: symbol;
  readonly defaultValue: T;
}

export function createContext<T>(defaultValue: T): Context<T> {
  return {
    _ctx: true,
    key: Symbol("madoctx"),
    defaultValue,
  };
}

interface ContextEventDetail {
  key: symbol;
  value?: Signal<unknown>;
}

/**
 * Declare that this host provides a value for the given context.
 * Returns the signal itself so the provider can update it.
 */
export function provide<T>(
  host: HTMLElement,
  ctx: Context<T>,
  initial: T | Signal<T>,
): Signal<T> {
  const sig: Signal<T> =
    typeof initial === "function"
      ? (initial as Signal<T>)
      : signal(initial as T);

  const handler = (e: Event) => {
    const ce = e as CustomEvent<ContextEventDetail>;
    if (ce.detail.key !== ctx.key) return;
    ce.detail.value = sig as Signal<unknown>;
    e.stopPropagation();
  };
  host.addEventListener(CONTEXT_EVENT, handler);

  return sig;
}

/**
 * Request a context value. Walks up the DOM tree (including
 * Shadow DOM via composed) to the first provider. If not found —
 * returns the defaultValue wrapped in a signal.
 */
export function inject<T>(host: HTMLElement, ctx: Context<T>): Signal<T> {
  const detail: ContextEventDetail = { key: ctx.key };
  host.dispatchEvent(
    new CustomEvent(CONTEXT_EVENT, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
  if (detail.value) return detail.value as Signal<T>;
  return signal(ctx.defaultValue);
}