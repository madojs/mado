/**
 * Wrapper around Custom Elements.
 *
 *   component('x-counter', () => {
 *     const count = signal(0);
 *     return () => html`<button @click=${() => count.update(n=>n+1)}>${count}</button>`;
 *   }, {
 *     styles: css`button { padding: .5rem }`,
 *   });
 *
 * The setup function is called once on the first connectedCallback.
 * The returned render function is called via an effect, so any signals
 * read inside it automatically re-render the template.
 *
 * Shadow DOM (open) is used by default. It can be disabled, and
 * styles will be scoped via @scope (or a tag-prefix fallback).
 */

import { signal, effect, type Signal, type Disposer } from "./signal.js";
import { html, render, type TemplateResult } from "./html.js";
import { adopt, scopeStyles, type CSSResult } from "./css.js";
import {
  createLifecycle,
  runInLifecycle,
  type LifecycleHandle,
} from "./lifecycle.js";
import { warnOnce } from "./diagnostics.js";

export interface ComponentContext {
  host: HTMLElement;
  /** Run cleanup when the component is removed. */
  onDispose(fn: Disposer): void;
  /**
   * Reactive attribute accessor. Returns a Signal<string> that updates
   * automatically whenever the attribute changes on the host element.
   *
   *   const variant = ctx.attr("variant", "primary");
   *   return () => html`<div class=${variant()}>…</div>`;
   *
   * No MutationObserver boilerplate needed. The signal updates via a
   * per-instance MutationObserver registered during setup().
   */
  attr(name: string, defaultValue?: string): Signal<string>;
}

export type SetupFn = (ctx: ComponentContext) => () => TemplateResult;

export type StyleInput = string | CSSResult | Array<string | CSSResult>;

export interface ComponentOptions {
  /** Enable Shadow DOM (default: true). */
  shadow?: boolean;
  /**
   * Component styles. Accepts:
   *   - a CSS string (quick start)
   *   - a CSSStyleSheet via `css\`...\`` (recommended — one copy in memory)
   *   - an array of the above
   */
  styles?: StyleInput;
}

export function component(
  tagName: string,
  setup: SetupFn,
  options: ComponentOptions = {},
): void {
  if (!tagName.includes("-")) {
    warnOnce(
      `component-invalid-tag-${tagName}`,
      `component("${tagName}") skipped: Custom Element names must contain a hyphen.`,
    );
    return;
  }

  const existingMeta = registered.get(tagName);
  if (customElements.get(tagName)) {
    if (
      !existingMeta ||
      existingMeta.setup !== setup ||
      !sameComponentOptions(existingMeta.options, options)
    ) {
      warnOnce(
        `component-duplicate-${tagName}`,
        `component("${tagName}") is already registered. Re-registration with different setup/options is ignored.`,
      );
    }
    return; // idempotent hot-reload
  }

  const useShadow = options.shadow !== false;

  // Normalize styles to an array of CSSStyleSheet once.
  // Sheets are shared across all instances — memory is not duplicated.
  const stylesheets: CSSResult[] = normalizeStyles(
    options.styles,
    tagName,
    useShadow,
  );

  class MadoElement extends HTMLElement {
    #root: Element | ShadowRoot;
    #renderer: (() => TemplateResult) | null = null;
    #effectDispose: Disposer | null = null;
    #lifecycle: LifecycleHandle | null = null;
    #connected = false;
    // True while a teardown is queued on the microtask after a
    // disconnectedCallback. Used to cancel teardown when the element is
    // re-inserted in the same tick (a keyed move via insertBefore).
    #teardownQueued = false;
    #attrSignals = new Map<string, Signal<string>>();
    #attrDefaults = new Map<string, string>();

    constructor() {
      super();
      this.#root = useShadow ? this.attachShadow({ mode: "open" }) : this;
    }

    connectedCallback() {
      // A keyed move (each() relocating via insertBefore) fires
      // disconnectedCallback → connectedCallback synchronously. The teardown
      // queued by disconnectedCallback is cancelled here so state survives the
      // move and setup() is NOT re-run.
      this.#teardownQueued = false;
      if (this.#connected) return;
      this.#connected = true;

      if (stylesheets.length > 0) {
        if (useShadow) {
          adopt(this.#root as ShadowRoot, ...stylesheets);
        } else {
          installGlobalSheets(stylesheets);
        }
      }

      // create a lifecycle for this component. Any function
      // called from setup() (resource, ...) will see it via
      // getCurrentLifecycle() and register its own cleanup.
      const lifecycle = createLifecycle();
      this.#lifecycle = lifecycle;

      const host = this;

      const ctx: ComponentContext = {
        host: this,
        // ctx.onDispose proxies to lifecycle — the single source of truth
        // for component cleanups (including auto-cleanup from
        // resource(), navigator listeners, etc.).
        onDispose: (fn) => lifecycle.onDispose(fn),
        attr(name: string, defaultValue = ""): Signal<string> {
          let s = host.#attrSignals.get(name);
          if (!s) {
            host.#attrDefaults.set(name, defaultValue);
            s = signal(host.getAttribute(name) ?? defaultValue);
            host.#attrSignals.set(name, s);
          }
          return s;
        },
      };

      this.#renderer = runInLifecycle(lifecycle, () => setup(ctx));

      // After setup(), install a single MutationObserver for all attrs
      // registered via ctx.attr().
      if (this.#attrSignals.size > 0) {
        const attrNames = [...this.#attrSignals.keys()];
        const obs = new MutationObserver((mutations) => {
          for (const m of mutations) {
            const s = this.#attrSignals.get(m.attributeName!);
            const fallback = this.#attrDefaults.get(m.attributeName!) ?? "";
            if (s) s.set(this.getAttribute(m.attributeName!) ?? fallback);
          }
        });
        obs.observe(this, { attributes: true, attributeFilter: attrNames });
        lifecycle.onDispose(() => obs.disconnect());
      }

      this.#effectDispose = effect(() => {
        render(this.#renderer!(), this.#root);
      });
    }

    disconnectedCallback() {
      // Defer teardown to a microtask. A keyed move (each() relocating a node
      // via insertBefore) fires disconnectedCallback → connectedCallback in the
      // same tick; connectedCallback clears #teardownQueued so the teardown is
      // skipped and component state survives the move. A genuine removal leaves
      // the element disconnected, so the microtask tears it down.
      if (this.#teardownQueued) return;
      this.#teardownQueued = true;
      queueMicrotask(() => {
        if (!this.#teardownQueued) return; // re-inserted in the same tick
        this.#teardownQueued = false;
        if (this.isConnected) return; // moved back into the document
        this.#teardown();
      });
    }

    /** Synchronously dispose effects and lifecycle. */
    #teardown() {
      this.#effectDispose?.();
      this.#effectDispose = null;
      this.#lifecycle?.dispose();
      this.#lifecycle = null;
      this.#connected = false;
    }

  }

  customElements.define(tagName, MadoElement);
  registered.set(tagName, { setup, options });
}

// ---------- helpers ----------

function normalizeStyles(
  input: StyleInput | undefined,
  tagName: string,
  useShadow: boolean,
): CSSResult[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr.map((s) => {
    let sheet: CSSResult;
    if (typeof s === "string") {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(s);
    } else {
      sheet = s;
    }
    // light DOM: scope by tag name
    return useShadow ? sheet : scopeStyles(tagName, sheet);
  });
}

const installedGlobal = new WeakSet<CSSResult>();
const registered = new Map<
  string,
  { setup: SetupFn; options: ComponentOptions }
>();

function sameComponentOptions(
  a: ComponentOptions,
  b: ComponentOptions,
): boolean {
  if (a.shadow !== b.shadow) return false;
  if (a.styles !== b.styles) return false;
  return true;
}

function installGlobalSheets(sheets: CSSResult[]): void {
  const toAdd = sheets.filter((s) => !installedGlobal.has(s));
  if (toAdd.length === 0) return;
  for (const s of toAdd) installedGlobal.add(s);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...toAdd];
}

// Convenience re-export.
export { html };
