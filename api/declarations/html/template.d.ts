/**
 * Template instantiation + public `html\`\`` tag + `render()`.
 *
 * Data flow:
 *   html`...`              → TemplateResult { strings, values }
 *   parseTemplate(strings) → ParsedTemplate { template, bindings }   (cached by strings)
 *   instantiate(result)    → InstantiatedTemplate { fragment, nodes, commit, update, dispose }
 *   render(result, host)   → clones or reuses instance in host
 *
 * Only the glue lives here: parser and bindings are in neighbour files.
 */
import type { Disposer } from "../signal.js";
import { type InstantiatedTemplate, type TemplateResult } from "./template-types.js";
/**
 * `html\`<div>${value}</div>\`` → template descriptor.
 *
 * By itself renders and parses NOTHING — this simply captures
 * { strings, values } from the tagged-template literal. The heavy work
 * (parsing + cloning) happens on the first `render()` /
 * `instantiate()` call and is cached by `strings` identity.
 */
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;
/**
 * Create a ready template instance: clones the pre-parsed template,
 * resolves all BindingSpec → concrete DOM nodes of the clone, binds
 * initial values. Mount-sensitive work remains queued until commit() is called
 * after insertion. The returned object is self-contained: update(result)
 * patches only what actually changed and transfers internal ownership,
 * while dispose() cleans up effects and removes nodes from the DOM.
 *
 * Exported (not only used from render()) so that
 * keyed `each` reconciliation can manage instance lifetimes directly.
 */
export declare function instantiate(result: TemplateResult): InstantiatedTemplate;
/**
 * Render a TemplateResult into a container.
 *
 * Semantics:
 *   - first call → instantiate + appendChild;
 *   - repeated call with the same tagged literal (same strings identity) →
 *     update(result), DOM is not recreated;
 *   - repeated call with a different literal → dispose old + new instantiate.
 *
 * Container can be either an Element or a ShadowRoot (used
 * in component() for rendering into a shadow tree).
 */
export declare function render(result: TemplateResult, container: Element | ShadowRoot): Disposer;
/** Dispose the template currently owned by a render container. */
export declare function unmount(container: Element | ShadowRoot): void;
