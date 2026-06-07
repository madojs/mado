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

import { effect, type Disposer } from "./signal.js";
import { html, render, type TemplateResult } from "./html.js";
import { adopt, scopeStyles, type CSSResult } from "./css.js";
import { createLifecycle, runInLifecycle, type LifecycleHandle } from "./lifecycle.js";
import { warnOnce } from "./diagnostics.js";

export interface ComponentContext {
  host: HTMLElement;
  /** Run cleanup when the component is removed. */
  onDispose(fn: Disposer): void;
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
  /**
   * List of observed attributes.
   *
   * v0.3: this is plain reflection into host[attr], without a reactive props API.
   * If you need to re-render the component when an attribute changes, create a signal()
   * inside setup() and update it manually from your own wrapper/event.
   */
  observedAttributes?: readonly string[];
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
  const observed = options.observedAttributes ?? [];

  // Normalize styles to an array of CSSStyleSheet once.
  // Sheets are shared across all instances — memory is not duplicated.
  const stylesheets: CSSResult[] = normalizeStyles(
    options.styles,
    tagName,
    useShadow,
  );

  class MadoElement extends HTMLElement {
    static get observedAttributes() {
      return [...observed];
    }

    #root: Element | ShadowRoot;
    #renderer: (() => TemplateResult) | null = null;
    #effectDispose: Disposer | null = null;
    #lifecycle: LifecycleHandle | null = null;
    #connected = false;

    constructor() {
      super();
      this.#root = useShadow ? this.attachShadow({ mode: "open" }) : this;
    }

    connectedCallback() {
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

      const ctx: ComponentContext = {
        host: this,
        // ctx.onDispose proxies to lifecycle — the single source of truth
        // for component cleanups (including auto-cleanup from
        // resource(), navigator listeners, etc.).
        onDispose: (fn) => lifecycle.onDispose(fn),
      };

      this.#renderer = runInLifecycle(lifecycle, () => setup(ctx));

      this.#effectDispose = effect(() => {
        render(this.#renderer!(), this.#root);
      });
    }

    disconnectedCallback() {
      this.#effectDispose?.();
      this.#effectDispose = null;
      this.#lifecycle?.dispose();
      this.#lifecycle = null;
      this.#connected = false;
    }

    attributeChangedCallback(
      name: string,
      _old: string | null,
      value: string | null,
    ) {
      // reflect attribute to property — user can bind a signal to it
      (this as unknown as Record<string, unknown>)[name] = value;
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
  const aa = a.observedAttributes ?? [];
  const bb = b.observedAttributes ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every((name, i) => name === bb[i]);
}

function installGlobalSheets(sheets: CSSResult[]): void {
  const toAdd = sheets.filter((s) => !installedGlobal.has(s));
  if (toAdd.length === 0) return;
  for (const s of toAdd) installedGlobal.add(s);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...toAdd];
}

// Convenience re-export.
export { html };
