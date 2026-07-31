/**
 * Wrapper around Custom Elements.
 *
 *   component('x-counter', () => {
 *     const count = signal(0);
 *     return html`<button @click=${() => count.update(n=>n+1)}>${count}</button>`;
 *   }, {
 *     styles: css`button { padding: .5rem }`,
 *   });
 *
 * The setup function is called once on the first connectedCallback.
 * Reactivity lives in template slots: signals and reactive getters create
 * their own fine-grained bindings without re-running setup.
 *
 * Shadow DOM (open, serializable) is used by default. It can be disabled for
 * advanced integration cases, and styles will be scoped via @scope
 * (or a tag-prefix fallback).
 */
import { type Signal, type Disposer } from "./signal.js";
import { html } from "./html/template.js";
import { type TemplateResult } from "./html/template-types.js";
import { type CSSResult } from "./css.js";
export interface ComponentContext {
    host: HTMLElement;
    /** Run cleanup when the component is removed. */
    onDispose(fn: Disposer): void;
    /**
     * Reactive attribute accessor. Returns a Signal<string> that updates
     * automatically whenever the attribute changes on the host element.
     *
     *   const variant = ctx.attr("variant", "primary");
     *   return html`<div class=${variant}>…</div>`;
     *
     * No MutationObserver boilerplate needed. The signal updates via a
     * per-instance MutationObserver registered during setup().
     */
    attr(name: string): Signal<string | null>;
    attr(name: string, defaultValue: string): Signal<string>;
}
export type SetupFn = (ctx: ComponentContext) => TemplateResult;
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
export declare function component(tagName: string, setup: SetupFn, options?: ComponentOptions): void;
export { html };
