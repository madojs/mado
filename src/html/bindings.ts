/**
 * Bindings: how values end up in DOM nodes after template cloning.
 * All binding types are described in one place so that adding
 * a new one (e.g. `??=` or `style.<prop>`) is intentional and visible.
 *
 * Split into two groups:
 *   - bindChild  — child binding (text / node / array / TemplateResult / each)
 *   - bindAttr   — attribute / event / DOM property / boolean
 *
 * Reactivity: if a value is a function (signal/computed), we wrap it
 * in effect(); the returned Disposer goes into the instance's disposers list
 * so that on update()/dispose() everything is properly cleaned up.
 */

import { effect, type Disposer } from "../signal.js";
import { isEachResult, type EachKey, type EachResult } from "../each.js";
import { warnOnce } from "../diagnostics.js";
import type { AttrBindingSpec } from "./parser.js";
import {
  isTemplateResult,
  type TemplateResult,
  type InstantiatedTemplate,
} from "./template-types.js";

// ---------- Directives ----------

type DirectiveKind = "unsafeHTML" | "ref" | "classMap" | "styleMap";

interface DirectiveBase {
  readonly _madoDirective: DirectiveKind;
}

export interface UnsafeHTMLDirective extends DirectiveBase {
  readonly _madoDirective: "unsafeHTML";
  readonly value: string;
}

export type RefCallback<T extends Element = Element> = (
  el: T | null,
) => void | Disposer;

export interface RefDirective<T extends Element = Element>
  extends DirectiveBase {
  readonly _madoDirective: "ref";
  readonly callback: RefCallback<T>;
}

export type ClassMap = Record<string, unknown>;

export interface ClassMapDirective extends DirectiveBase {
  readonly _madoDirective: "classMap";
  readonly value: ClassMap;
}

export type StyleMap = Record<string, string | number | null | undefined | false>;

export interface StyleMapDirective extends DirectiveBase {
  readonly _madoDirective: "styleMap";
  readonly value: StyleMap;
}

export type HtmlDirective =
  | UnsafeHTMLDirective
  | RefDirective
  | ClassMapDirective
  | StyleMapDirective;

/**
 * Render a trusted HTML string as DOM nodes in child position.
 *
 * This intentionally does not sanitize. Only pass strings you own or have
 * sanitized elsewhere.
 */
export function unsafeHTML(value: string): UnsafeHTMLDirective {
  return { _madoDirective: "unsafeHTML", value };
}

/**
 * Call `callback(element)` when the element is bound, and clean it up on
 * disposal. Use as `ref=${ref((el) => { ... })}`.
 */
export function ref<T extends Element = Element>(
  callback: RefCallback<T>,
): RefDirective<T> {
  return { _madoDirective: "ref", callback };
}

/** Toggle CSS classes by object keys. Truthy values add, falsy values remove. */
export function classMap(value: ClassMap): ClassMapDirective {
  return { _madoDirective: "classMap", value };
}

/** Apply inline styles from an object and remove stale keys on updates. */
export function styleMap(value: StyleMap): StyleMapDirective {
  return { _madoDirective: "styleMap", value };
}

export function isHtmlDirective(v: unknown): v is HtmlDirective {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { _madoDirective?: unknown })._madoDirective === "string"
  );
}

// ---------- Child binding ----------

/**
 * Entry for a node in keyed-each: reference to the template instance
 * and its top-level DOM nodes. Stored in ChildState.eachEntries
 * between updates so reconciliation can reuse DOM.
 */
interface EachEntry {
  inst: InstantiatedTemplate;
  /** Top-level nodes that must move during reorder. */
  nodes: Node[];
}

export interface ChildState {
  anchor: Comment;
  /**
   * Current content. Used only by the normal branch (non-each).
   * each uses eachEntries instead.
   */
  current: Node[];
  /**
   * Nested TemplateResult instances created by the normal branch.
   * They must be disposed before replacement/removal because they can own
   * deeper child bindings that insert additional DOM nodes.
   */
  currentInsts: InstantiatedTemplate[];
  /**
   * Whether each mode is currently active. Switching between each and normal
   * mode first clears the previous content.
   */
  isEach: boolean;
  /** Current entries by key. */
  eachEntries: Map<EachKey, EachEntry>;
  /** Current key order in the DOM before the anchor. */
  eachOrder: EachKey[];
}

/**
 * Ownership invariant:
 * - ChildState owns everything inserted before its anchor for that binding.
 * - Plain nodes are tracked in current.
 * - Nested TemplateResult instances are tracked in currentInsts and must be
 *   dispose()'d before removing current nodes, because they can own deeper
 *   anchors/effects/nodes not visible to the parent instance.
 * - each() owns its own InstantiatedTemplate entries through eachEntries.
 */

export function createChildState(anchor: Comment): ChildState {
  return {
    anchor,
    current: [],
    currentInsts: [],
    isEach: false,
    eachEntries: new Map(),
    eachOrder: [],
  };
}

export function disposeChildState(st: ChildState): void {
  if (st.isEach) {
    for (const entry of st.eachEntries.values()) entry.inst.dispose();
    st.eachEntries.clear();
    st.eachOrder = [];
    st.isEach = false;
  }
  clearCurrent(st);
}

/**
 * Bind a value to a child binding. If value is a function (signal),
 * subscribe via effect(); otherwise render once.
 *
 * instantiateFn is passed as a parameter to avoid circular
 * dependency bindings ↔ template.
 */
export function bindChild(
  st: ChildState,
  value: unknown,
  disposers: Disposer[],
  instantiateFn: (r: TemplateResult) => InstantiatedTemplate,
): void {
  if (typeof value === "function") {
    const d = effect(() => {
      renderChild(st, (value as () => unknown)(), instantiateFn);
    });
    disposers.push(d);
    return;
  }
  renderChild(st, value, instantiateFn);
}

function renderChild(
  st: ChildState,
  value: unknown,
  instantiateFn: (r: TemplateResult) => InstantiatedTemplate,
): void {
  // each result: apply keyed reconciliation
  if (isEachResult(value)) {
    applyEach(st, value, instantiateFn);
    return;
  }

  // switching from each mode to normal: remove each entries
  if (st.isEach) {
    for (const entry of st.eachEntries.values()) entry.inst.dispose();
    st.eachEntries.clear();
    st.eachOrder = [];
    st.isEach = false;
  }

  // Reuse fast-path: when the previous content was exactly one nested template
  // instance and the new value is a TemplateResult with the SAME strings, patch
  // it in place via update() instead of clear+instantiate. This mirrors the
  // reuse already done by each() and render(), and preserves DOM identity (and
  // therefore focus / <input> value / listeners) inside conditional blocks.
  // The length check guards against extra sibling nodes (e.g. a previous array
  // value), in which case a full rebuild is still required. (FABLE_REPORT #3)
  if (
    isTemplateResult(value) &&
    st.currentInsts.length === 1 &&
    st.current.length === st.currentInsts[0]!.nodes.length &&
    st.currentInsts[0]!._strings === value.strings
  ) {
    st.currentInsts[0]!.update(value.values);
    return;
  }

  // normal branch: clear + recreate
  clearCurrent(st);


  const parent = st.anchor.parentNode;
  if (!parent) return;

  const append = (node: Node) => {
    parent.insertBefore(node, st.anchor);
    st.current.push(node);
  };

  const handle = (v: unknown) => {
    if (v == null || v === false || v === true) return;
    if (v instanceof Node) {
      append(v);
      return;
    }
    if (isHtmlDirective(v)) {
      if (v._madoDirective !== "unsafeHTML") {
        throw new Error(
          `[mado] ${v._madoDirective} directive cannot be used in child position.`,
        );
      }
      appendUnsafeHTML(st, v.value);
      return;
    }
    if (isTemplateResult(v)) {
      const inst = instantiateFn(v);
      const inserted = [...inst.fragment.childNodes];
      parent.insertBefore(inst.fragment, st.anchor);
      st.currentInsts.push(inst);
      for (const n of inserted) st.current.push(n);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) handle(item);
      return;
    }
    append(document.createTextNode(String(v)));
  };

  handle(value);
}

function appendUnsafeHTML(st: ChildState, value: string): void {
  const parent = st.anchor.parentNode;
  if (!parent) return;

  const tpl = document.createElement("template");
  tpl.innerHTML = value;
  const nodes = [...tpl.content.childNodes];
  parent.insertBefore(tpl.content, st.anchor);
  st.current.push(...nodes);
}

function clearCurrent(st: ChildState): void {
  for (const inst of st.currentInsts.splice(0)) inst.dispose();
  for (const n of st.current) n.parentNode?.removeChild(n);
  st.current = [];
}

/**
 * Keyed reconciliation: apply an EachResult to a ChildState.
 *
 * Algorithm (simple and readable, O(n) by keys):
 * 1. If switched from "normal" mode — first clear old content.
 * 2. Build new Map nextEntries: for each item
 *      - if key existed — reuse entry, call inst.update(values).
 *      - if key is new — instantiate(template).
 * 3. Remove entries for keys no longer in the new list.
 * 4. Place nodes in the correct order via insertBefore(node, refNode).
 *    refNode is determined by position: iterate from the end to start,
 *    ref = top node of the next entry (or st.anchor for the last).
 */
function applyEach(
  st: ChildState,
  result: EachResult,
  instantiateFn: (r: TemplateResult) => InstantiatedTemplate,
): void {
  // Switching from the normal branch to each: clear previous content first.
  if (!st.isEach && (st.current.length > 0 || st.currentInsts.length > 0)) {
    clearCurrent(st);
  }
  st.isEach = true;

  const parent = st.anchor.parentNode;
  if (!parent) return;

  const items = result.items;
  const keyOf = result.keyOf as (item: unknown, index: number) => EachKey;
  const renderFn = result.render as (
    item: unknown,
    index: number,
  ) => TemplateResult;

  // 1) Build new keys and entries.
  const newEntries = new Map<EachKey, EachEntry>();
  const newOrder: EachKey[] = [];
  const seen = new Set<EachKey>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let key = keyOf(item, i);
    if (seen.has(key)) {
      warnOnce(
        "each-duplicate-key",
        `each() received duplicate key "${String(key)}". Duplicate keys ` +
          "usually mean the list data is not uniquely identifiable; Mado will " +
          "fall back to a positional suffix for this duplicate.",
      );
      key = `${String(key)}__dup_${i}`;
    }
    seen.add(key);

    const tpl = renderFn(item, i);
    const prev = st.eachEntries.get(key);

    if (prev) {
      // same key → try updating the same instance.
      // If the template changed (different strings) — recreate.
      const sameTemplate = prev.inst._strings === tpl.strings;
      if (sameTemplate) {
        prev.inst.update(tpl.values);
        newEntries.set(key, prev);
      } else {
        prev.inst.dispose();
        const inst = instantiateFn(tpl);
        const nodes = [...inst.fragment.childNodes];
        // The fragment is not inserted yet; reorder below will place it.
        newEntries.set(key, { inst, nodes });
      }
    } else {
      const inst = instantiateFn(tpl);
      const nodes = [...inst.fragment.childNodes];
      newEntries.set(key, { inst, nodes });
    }
    newOrder.push(key);
  }

  // 2) remove entries for keys no longer present
  for (const [oldKey, oldEntry] of st.eachEntries) {
    if (!newEntries.has(oldKey)) {
      oldEntry.inst.dispose();
    }
  }

  // 3) place nodes in the correct order.
  // Iterate from the end: for each entry place(node, ref),
  // where ref is the first node of the next entry, or st.anchor for the last.
  //
  // Prefer Node.prototype.moveBefore (Chrome 133+) when available: it relocates
  // a connected node WITHOUT firing disconnectedCallback/connectedCallback, so
  // custom-element state is preserved for free. insertBefore is the fallback —
  // it fires a disconnect→connect pair on a move, but MadoElement defers its
  // teardown to a microtask and cancels it on the same-tick reconnect, so a
  // keyed reorder still preserves component state. (FABLE_REPORT.md finding #1)
  const moveBefore = (
    parent as unknown as {
      moveBefore?: (node: Node, ref: Node | null) => void;
    }
  ).moveBefore;
  let refNode: Node = st.anchor;
  for (let i = newOrder.length - 1; i >= 0; i--) {
    const key = newOrder[i]!;
    const entry = newEntries.get(key)!;
    // Insert entry nodes before refNode in the correct order.
    // Go from last to first so every node ends up before refNode in order.
    for (let j = entry.nodes.length - 1; j >= 0; j--) {
      const n = entry.nodes[j]!;
      if (n.parentNode !== parent || n.nextSibling !== refNode) {
        // moveBefore only applies to a node already connected under `parent`;
        // for fresh nodes (not yet in the document) it would throw, so guard on
        // current connectivity and fall back to insertBefore otherwise.
        if (moveBefore && n.parentNode === parent) {
          moveBefore.call(parent, n, refNode);
        } else {
          parent.insertBefore(n, refNode);
        }
      }
      refNode = n;
    }
  }


  st.eachEntries = newEntries;
  st.eachOrder = newOrder;
}

// ---------- Attribute binding ----------

/**
 * Apply a value to an attr binding. Route by prefix:
 *   @event     → addEventListener
 *   .prop      → el[prop] = value
 *   ?attr      → toggleAttribute by truthy/falsy
 *   otherwise  → setAttribute / removeAttribute (with multi-part support)
 */
export function bindAttr(
  el: Element,
  spec: AttrBindingSpec,
  values: readonly unknown[],
  disposers: Disposer[],
): void {
  const name = spec.name;
  const isMulti = spec.isMulti;

  // event — single only, no interpolation (meaningless)
  if (name.startsWith("@")) {
    if (isMulti) {
      throw new Error(
        `[mado] event binding ${name} does not support interpolation.`,
      );
    }
    const evt = name.slice(1);
    const handler = values[spec.slots[0]!] as EventListener;
    el.addEventListener(evt, handler);
    disposers.push(() => el.removeEventListener(evt, handler));
    return;
  }

  // .prop — DOM property (single only)
  if (name.startsWith(".")) {
    if (isMulti) {
      throw new Error(
        `[mado] property binding ${name} does not support interpolation.`,
      );
    }
    const prop = name.slice(1);
    const v = values[spec.slots[0]!];
    applyReactive(v, disposers, (vv) => {
      (el as unknown as Record<string, unknown>)[prop] = vv;
    });
    return;
  }

  // ?attr — boolean attribute (single only)
  if (name.startsWith("?")) {
    if (isMulti) {
      throw new Error(
        `[mado] boolean binding ${name} does not support interpolation.`,
      );
    }
    const attrName = name.slice(1);
    const v = values[spec.slots[0]!];
    applyReactive(v, disposers, (vv) => {
      if (vv) el.setAttribute(attrName, "");
      else el.removeAttribute(attrName);
    });
    return;
  }

  // ordinary attribute
  if (!isMulti) {
    warnBooleanAttrIfNeeded(name);
    const v = values[spec.slots[0]!];
    bindSingleAttr(el, name, v, disposers);
    return;
  }

  // multi-part: assemble from spec.strings + values[spec.slots[i]].
  // If at least one part is a function (signal), we need an effect.
  const hasReactive = spec.slots.some((s) => typeof values[s] === "function");
  const compute = (): string => {
    let out = spec.strings[0] ?? "";
    for (let i = 0; i < spec.slots.length; i++) {
      const v = values[spec.slots[i]!];
      const resolved = typeof v === "function" ? (v as () => unknown)() : v;
      if (isHtmlDirective(resolved)) {
        throw new Error(
          `[mado] ${resolved._madoDirective} directive cannot be used in a multi-part attribute.`,
        );
      }
      out += resolved == null ? "" : String(resolved);
      out += spec.strings[i + 1] ?? "";
    }
    return out;
  };
  if (hasReactive) {
    const d = effect(() => el.setAttribute(name, compute()));
    disposers.push(d);
  } else {
    el.setAttribute(name, compute());
  }
}

function bindSingleAttr(
  el: Element,
  name: string,
  value: unknown,
  disposers: Disposer[],
): void {
  let cleanup: Disposer | undefined;
  let lastPlainAttr = false;
  const apply = (vv: unknown) => {
    cleanup?.();
    if (lastPlainAttr && isHtmlDirective(vv)) {
      clearPlainAttr(el, name);
    }
    cleanup = applySingleAttrValue(el, name, vv);
    lastPlainAttr = !isHtmlDirective(vv);
  };

  if (typeof value === "function") {
    const d = effect(() => apply((value as () => unknown)()));
    disposers.push(() => {
      d();
      cleanup?.();
      cleanup = undefined;
    });
    return;
  }

  apply(value);
  if (cleanup) {
    disposers.push(() => {
      cleanup?.();
      cleanup = undefined;
    });
  }
}

function clearPlainAttr(el: Element, name: string): void {
  if (name === "class") {
    el.classList.remove(...Array.from(el.classList));
    el.removeAttribute(name);
    return;
  }
  el.removeAttribute(name);
}

function applySingleAttrValue(
  el: Element,
  name: string,
  value: unknown,
): Disposer | undefined {
  if (isHtmlDirective(value)) {
    return applyAttrDirective(el, name, value);
  }

  if (value == null || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? "" : String(value));
  return undefined;
}

function applyAttrDirective(
  el: Element,
  name: string,
  directive: HtmlDirective,
): Disposer | undefined {
  if (directive._madoDirective === "ref") {
    if (name !== "ref") {
      throw new Error("[mado] ref() directive must be used as ref=${ref(...)}.");
    }
    el.removeAttribute(name);
    const dispose = directive.callback(el);
    return () => {
      if (typeof dispose === "function") dispose();
      directive.callback(null);
    };
  }

  if (directive._madoDirective === "classMap") {
    if (name !== "class") {
      throw new Error(
        "[mado] classMap() directive must be used as class=${classMap(...)}.",
      );
    }
    return applyClassMap(el, directive.value);
  }

  if (directive._madoDirective === "styleMap") {
    if (name !== "style") {
      throw new Error(
        "[mado] styleMap() directive must be used as style=${styleMap(...)}.",
      );
    }
    return applyStyleMap(el, directive.value);
  }

  throw new Error(
    "[mado] unsafeHTML() directive can only be used in child position.",
  );
}

function applyClassMap(el: Element, value: ClassMap): Disposer {
  const applied: string[] = [];
  for (const [className, enabled] of Object.entries(value)) {
    if (!className || !enabled) continue;
    el.classList.add(...className.trim().split(/\s+/).filter(Boolean));
    applied.push(className);
  }

  return () => {
    for (const className of applied) {
      el.classList.remove(...className.trim().split(/\s+/).filter(Boolean));
    }
  };
}

function applyStyleMap(el: Element, value: StyleMap): Disposer {
  const style = (el as Element & { style?: CSSStyleDeclaration }).style;
  const applied: string[] = [];
  if (!style) return () => {};

  for (const [rawName, rawValue] of Object.entries(value)) {
    const prop = toCssPropertyName(rawName);
    if (!prop) continue;
    if (rawValue == null || rawValue === false) {
      style.removeProperty(prop);
      continue;
    }
    style.setProperty(prop, String(rawValue));
    applied.push(prop);
  }

  return () => {
    for (const prop of applied) style.removeProperty(prop);
  };
}

function toCssPropertyName(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function warnBooleanAttrIfNeeded(name: string): void {
  if (name !== "disabled" && name !== "checked") return;
  warnOnce(
    `boolean-attr-${name}`,
    `Use ?${name}= for a boolean attribute. ${name}=\${...} sets a string attribute and often behaves incorrectly.`,
  );
}

/** Universal wrapper: if a function — subscribe, otherwise apply once. */
function applyReactive(
  value: unknown,
  disposers: Disposer[],
  apply: (v: unknown) => void,
): void {
  if (typeof value === "function") {
    const d = effect(() => apply((value as () => unknown)()));
    disposers.push(d);
  } else {
    apply(value);
  }
}
