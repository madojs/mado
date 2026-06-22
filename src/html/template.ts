/**
 * Template instantiation + public `html\`\`` tag + `render()`.
 *
 * Data flow:
 *   html`...`              → TemplateResult { strings, values }
 *   parseTemplate(strings) → ParsedTemplate { template, bindings }   (cached by strings)
 *   instantiate(result)    → InstantiatedTemplate { fragment, nodes, update, dispose }
 *   render(result, host)   → clones or reuses instance in host
 *
 * Only the glue lives here: parser and bindings are in neighbour files.
 */

import type { Disposer } from "../signal.js";
import { warnOnce } from "../diagnostics.js";
import {
  parseTemplate,
  resolvePath,
  type AttrBindingSpec,
} from "./parser.js";
import {
  bindAttr,
  bindChild,
  createChildState,
  disposeChildState,
  type ChildState,
} from "./bindings.js";
import type {
  InstantiatedTemplate,
  TemplateResult,
} from "./template-types.js";
import { _flushDeferredStaticElements } from "../component.js";

/**
 * `html\`<div>${value}</div>\`` → template descriptor.
 *
 * By itself renders and parses NOTHING — this simply captures
 * { strings, values } from the tagged-template literal. The heavy work
 * (parsing + cloning) happens on the first `render()` /
 * `instantiate()` call and is cached by `strings` identity.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): TemplateResult {
  return { _mado: true, strings, values };
}

/**
 * Create a ready template instance: clones the pre-parsed template,
 * resolves all BindingSpec → concrete DOM nodes of the clone, binds
 * initial values. The returned object is self-contained: update(values)
 * patches only what actually changed, dispose() cleans up effects
 * and removes nodes from the DOM.
 *
 * Exported (not only used from render()) so that
 * keyed `each` reconciliation can manage instance lifetimes directly.
 */
export function instantiate(result: TemplateResult): InstantiatedTemplate {
  const parsed = parseTemplate(result.strings);
  const fragment = parsed.template.content.cloneNode(true) as DocumentFragment;

  const disposers: Disposer[] = [];
  const childStates: Map<number, ChildState> = new Map();
  const attrBound: Map<number, { el: Element; spec: AttrBindingSpec }> =
    new Map();

  // Resolve all BindingSpec.path → concrete nodes of the cloned
  // fragment. This is done ONCE, in the instance creation phase.
  for (const b of parsed.bindings) {
    if (b.type === "child") {
      const parent = resolvePath(fragment, b.path);
      const placeholder = parent.childNodes[b.childIndex] as Comment;
      childStates.set(b.id, createChildState(placeholder));
    } else {
      const el = resolvePath(fragment, b.path) as Element;
      attrBound.set(b.id, { el, spec: b });
    }
  }

  const update = (values: readonly unknown[]) => {
    // Before each update unsubscribe from the previous pass's subscriptions.
    // This is needed because one of the values might have been a signal
    // but now is not (or vice versa), and we need a fresh re-subscribe.
    for (const d of disposers.splice(0)) d();

    for (const b of parsed.bindings) {
      if (b.type === "child") {
        const st = childStates.get(b.id)!;
        bindChild(st, values[b.slot], disposers, instantiate);
      } else {
        const ab = attrBound.get(b.id)!;
        bindAttr(ab.el, ab.spec, values, disposers);
      }
    }
  };

  update(result.values);

  const nodes = [...fragment.childNodes];

  return {
    fragment,
    nodes,
    update,
    dispose() {
      for (const d of disposers.splice(0)) d();
      for (const st of childStates.values()) disposeChildState(st);
      for (const n of nodes) n.parentNode?.removeChild(n);
    },
    _strings: result.strings,
  };
}

// ---------- Public render ----------


const rendered = new WeakMap<Element | ShadowRoot, InstantiatedTemplate>();

/**
 * Render a TemplateResult into a container.
 *
 * Semantics:
 *   - first call → instantiate + appendChild;
 *   - repeated call with the same tagged literal (same strings identity) →
 *     update(values), DOM is not recreated;
 *   - repeated call with a different literal → dispose old + new instantiate.
 *
 * Container can be either an Element or a ShadowRoot (used
 * in component() for rendering into a shadow tree).
 */
export function render(
  result: TemplateResult,
  container: Element | ShadowRoot,
): void {
  const existing = rendered.get(container);
  if (existing && existing.nodes[0]?.parentNode === container) {
    if (existing._strings === result.strings) {
      existing.update(result.values);
      return;
    }
    existing.dispose();
  }

  // Static snapshots write first-paint markup into #app and mark the
  // container. That markup is not hydrated: once the client app starts, Mado
  // owns the container again and atomically replaces it with live bindings.
  const isStaticContainer =
    !existing &&
    "hasAttribute" in container &&
    container.hasAttribute("data-mado-static");

  if (!isStaticContainer && !existing && container.childNodes.length > 0) {
    warnOnce(
      "render-unmanaged-dom",
      "render() called on a container with existing DOM that was not created by Mado. It will remain alongside the new render output.",
    );
  }

  // Build the live fragment OFF-DOM first. This guarantees that:
  //   - any new Custom Element inside the fragment is parsed and constructed
  //     but its connectedCallback() does not fire until insertion,
  //   - the old static tree (whose deferred children skipped setup()) is
  //     still in the DOM as inert first-paint markup,
  //   - we then swap children atomically with replaceChildren(), avoiding
  //     any frame where the container is visibly empty.
  const inst = instantiate(result);
  if (isStaticContainer) {
    // Order matters: remove the marker BEFORE inserting the live fragment so
    // newly-connecting Custom Elements no longer see a static ancestor and
    // run setup() exactly once.
    container.removeAttribute("data-mado-static");
    container.replaceChildren(inst.fragment);
    _flushDeferredStaticElements();
  } else {
    container.appendChild(inst.fragment);
  }
  rendered.set(container, inst);
}
