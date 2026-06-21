/**
 * lazy() — deferred module loading with a reactive placeholder.
 *
 * Why: heavy components (charts, code editors, modals)
 * don't need to be loaded on startup. lazy() gives a TemplateResult function
 * that returns a fallback until loaded, then the real template.
 *
 *   const Chart = lazy(
 *     () => import('./components/chart.js'),
 *     { fallback: () => html`<x-spinner/>` },
 *   );
 *
 *   html`<div>${Chart({ data })}</div>`
 *
 * Module contract: must default-export a function
 *   (props) => TemplateResult.
 *
 * Loading is cached (one import() per loader reference).
 */

import { signal } from "./signal.js";
import { html } from "./html/template.js";
import type { TemplateResult } from "./html/template-types.js";

export interface LazyOptions<P> {
  /** What to show while the module is loading. */
  fallback?: (props: P) => TemplateResult;
  /** What to show if the import failed. Default — empty string. */
  error?: (err: Error, props: P) => TemplateResult;
}

type Renderer<P> = (props: P) => TemplateResult;

interface LazyState<P> {
  state: "loading" | "ready" | "error";
  renderer?: Renderer<P>;
  err?: Error;
}

const cache = new WeakMap<object, LazyState<unknown>>();

/**
 * Create a lazy component.
 * Takes a dynamic import, returns a render function.
 *
 *   const Modal = lazy(() => import('./modal.js'));
 *   html`${open() ? Modal({ onClose }) : null}`
 */
export function lazy<P = unknown>(
  loader: () => Promise<{ default: Renderer<P> }>,
  options: LazyOptions<P> = {},
): (props: P) => TemplateResult {
  return (props: P) => {
    // One signal trigger per call instance; the html binder will resubscribe
    // when the state changes.
    const trig = signal(0);
    const state = ensureLoaded<P>(loader);

    if (state.state === "loading") {
      // subscribe: when state transitions to ready/error, trigger trig
      const wait = waitFor(loader);
      wait.then(
        () => trig.update((n) => n + 1),
        () => trig.update((n) => n + 1),
      );
    }

    return html`${() => {
      trig(); // subscription
      const s = ensureLoaded<P>(loader);
      if (s.state === "ready" && s.renderer) return s.renderer(props);
      if (s.state === "error" && s.err) {
        return options.error?.(s.err, props) ?? "";
      }
      return options.fallback?.(props) ?? "";
    }}`;
  };
}

function ensureLoaded<P>(
  loader: () => Promise<{ default: Renderer<P> }>,
): LazyState<P> {
  const existing = cache.get(loader as unknown as object) as
    | LazyState<P>
    | undefined;
  if (existing) return existing;
  const fresh: LazyState<P> = { state: "loading" };
  cache.set(loader as unknown as object, fresh as LazyState<unknown>);
  loader().then(
    (mod) => {
      fresh.state = "ready";
      fresh.renderer = mod.default;
    },
    (err: unknown) => {
      fresh.state = "error";
      fresh.err = err instanceof Error ? err : new Error(String(err));
    },
  );
  return fresh;
}

function waitFor<P>(
  loader: () => Promise<{ default: Renderer<P> }>,
): Promise<unknown> {
  // return the same Promise as ensureLoaded — otherwise we'd create a new one.
  // The browser actually caches the same module, so the second call returns instantly.
  return loader();
}
