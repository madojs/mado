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
 * Shadow DOM (open, serializable) is used by default. It can be disabled for
 * advanced integration cases, and styles will be scoped via @scope
 * (or a tag-prefix fallback).
 */

import { signal, effect, type Signal, type Disposer } from "./signal.js";
import { html, render, unmount } from "./html/template.js";
import type { TemplateResult } from "./html/template-types.js";
import {
  adopt,
  createStylesheet,
  scopeStyles,
  type CSSResult,
} from "./css.js";
import {
  createLifecycle,
  runInLifecycle,
  type LifecycleHandle,
} from "./lifecycle.js";
import { warnOnce } from "./diagnostics.js";
import { emitDevtools } from "./devtools-hook.js";

/**
 * Components upgraded inside a server-side or build-time snapshot live
 * temporarily under `<#app data-mado-static>`. Their setup() is intentionally
 * NOT run yet: Mado replaces the snapshot tree atomically when the SPA
 * boots, and any work performed by setup() before takeover would leak.
 *
 * The set lets the runtime double-check, after takeover, that no deferred
 * element survives — see _flushDeferredStaticElements().
 */
const deferredStaticElements = new Set<HTMLElement>();

/**
 * Walk composed ancestry (Light DOM parentNode plus ShadowRoot.host) and
 * return true when the element lives inside a tree marked with
 * `data-mado-static`. Used to defer component activation until the SPA
 * takeover atomically removes that tree.
 */
function isInsideStaticTree(node: Node | null): boolean {
  let n: Node | null = node;
  while (n) {
    if (
      n instanceof Element &&
      (n as Element).hasAttribute &&
      (n as Element).hasAttribute("data-mado-static")
    ) {
      return true;
    }
    const parent: Node | null =
      typeof ShadowRoot !== "undefined" && n instanceof ShadowRoot
        ? n.host
        : n.parentNode;
    n = parent;
  }
  return false;
}

/** @internal */
export function _markDeferredForStatic(host: HTMLElement): void {
  deferredStaticElements.add(host);
}

/** @internal */
export function _isDeferredForStatic(host: HTMLElement): boolean {
  return deferredStaticElements.has(host);
}

/**
 * Called by render() after a root takeover has atomically replaced the
 * `data-mado-static` tree. By that time every component that was
 * mid-snapshot must either be:
 *   1. removed with the static tree (the typical case), or
 *   2. still connected but no longer under a static ancestor — in which
 *      case the SPA tree placed it live and we activate it now.
 * Any element that fails both checks is a stuck snapshot leaf; emit a
 * single diagnostic so the developer notices the orphan.
 *
 * @internal
 */
export function _flushDeferredStaticElements(): void {
  for (const el of [...deferredStaticElements]) {
    if (!el.isConnected) {
      deferredStaticElements.delete(el);
      continue;
    }
    if (!isInsideStaticTree(el)) {
      // Reset the guard so the live connectedCallback runs setup().
      deferredStaticElements.delete(el);
      // Force a clean re-enter of connectedCallback. Browsers fire that
      // callback exactly once per insertion, so we toggle the element out
      // and back in. Avoid this if the element is the document root.
      const parent = el.parentNode;
      const next = el.nextSibling;
      if (parent) {
        parent.removeChild(el);
        parent.insertBefore(el, next);
      }
    }
  }
}

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
  attr(name: string): Signal<string | null>;
  attr(name: string, defaultValue: string): Signal<string>;
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
    #attrSignals = new Map<string, Signal<string | null>>();
    #attrDefaults = new Map<string, string | null>();

    constructor() {
      super();
      this.#root = useShadow
        ? this.shadowRoot ??
          this.attachShadow({
            mode: "open",
            serializable: true,
          } as ShadowRootInit)
        : this;
    }

    connectedCallback() {
      // A keyed move (each() relocating via insertBefore) fires
      // disconnectedCallback → connectedCallback synchronously. The teardown
      // queued by disconnectedCallback is cancelled here so state survives the
      // move and setup() is NOT re-run.
      this.#teardownQueued = false;
      if (this.#connected) return;

      // Deferred activation inside a static snapshot tree. The runtime keeps
      // setup()/effect() asleep until the SPA performs root takeover; the
      // existing DSD inside shadowRoot stays as inert first-paint markup.
      // When the SPA replaces the static root, this element is either
      // removed with that tree (the common case) or re-inserted live —
      // in which case connectedCallback() runs again and reaches setup().
      if (isInsideStaticTree(this)) {
        _markDeferredForStatic(this);
        return;
      }
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("component:connect", this, { tagName });

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
      const host = this;

      const attr = ((name: string, defaultValue?: string) => {
        let s = host.#attrSignals.get(name);
        if (!s) {
          const fallback = defaultValue ?? null;
          host.#attrDefaults.set(name, fallback);
          s = signal(host.getAttribute(name) ?? fallback);
          host.#attrSignals.set(name, s);
        }
        return s;
      }) as ComponentContext["attr"];

      const ctx: ComponentContext = {
        host: this,
        // ctx.onDispose proxies to lifecycle — the single source of truth
        // for component cleanups (including auto-cleanup from
        // resource(), navigator listeners, etc.).
        onDispose: (fn) => lifecycle.onDispose(fn),
        attr,
      };

      try {
        const renderer = runInLifecycle(lifecycle, () => setup(ctx));
        if (typeof renderer !== "function") {
          throw new TypeError(`component("${tagName}") setup must return a renderer function`);
        }

        // After setup(), install a single MutationObserver for all attrs
        // registered via ctx.attr().
        if (this.#attrSignals.size > 0) {
          const attrNames = [...this.#attrSignals.keys()];
          const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
              const s = this.#attrSignals.get(m.attributeName!);
              const fallback = this.#attrDefaults.get(m.attributeName!) ?? null;
              if (s) s.set(this.getAttribute(m.attributeName!) ?? fallback);
            }
          });
          obs.observe(this, { attributes: true, attributeFilter: attrNames });
          lifecycle.onDispose(() => obs.disconnect());
        }

        const effectDispose = runInLifecycle(lifecycle, () => effect(() => {
          if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("component:render", this, { tagName });
          render(renderer(), this.#root);
        }));
        this.#renderer = renderer;
        this.#effectDispose = effectDispose;
        this.#lifecycle = lifecycle;
        this.#connected = true;
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("component:ready", this, { tagName });
      } catch (err) {
        unmount(this.#root);
        lifecycle.dispose();
        this.#renderer = null;
        this.#effectDispose = null;
        this.#lifecycle = null;
        this.#attrSignals.clear();
        this.#attrDefaults.clear();
        this.#connected = false;
        if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("component:error", this, { tagName, error: err });
        throw err;
      }
    }

    disconnectedCallback() {
      // A deferred snapshot leaf was removed by takeover before setup() ever
      // ran. Clear the deferred marker so the registry does not accumulate
      // dead references.
      deferredStaticElements.delete(this);

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
      if (typeof __MADO_DEVTOOLS__ === "undefined" || __MADO_DEVTOOLS__) emitDevtools("component:dispose", this, { tagName });
      this.#effectDispose?.();
      this.#effectDispose = null;
      unmount(this.#root);
      this.#lifecycle?.dispose();
      this.#lifecycle = null;
      this.#renderer = null;
      this.#attrSignals.clear();
      this.#attrDefaults.clear();
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
      sheet = createStylesheet(s);
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
