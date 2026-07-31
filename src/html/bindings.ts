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
 * in effect(); the returned Disposer belongs to that single binding. Template
 * instances can therefore update one slot without churning unrelated refs,
 * event listeners, or subscriptions.
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
 * A mount-sensitive operation queued while bindings are applied.
 *
 * Template instances flush these only after their fragment is in the DOM and
 * the complete binding pass succeeded. `rollback()` is used when a later
 * commit in the same pass throws.
 */
export interface BindingCommit {
  commit(): void;
  rollback(): void;
}

export type QueueBindingCommit = (commit: BindingCommit) => void;

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
 * Call `callback(element)` after the complete template is inserted, and clean
 * it up on disposal. A returned disposer runs before the matching
 * `callback(null)`. Use as `ref=${ref((el) => { ... })}`.
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

interface ControlledSelectValueBinding {
  reapply(): void;
}

/**
 * Adding or reordering <option> nodes can change a select's value without the
 * bound value signal changing. Keep the desired property value beside the
 * select so a Mado-owned child reconciliation can restore it synchronously.
 */
const controlledSelectValues = new WeakMap<
  Element,
  ControlledSelectValueBinding
>();

function reapplyNearestControlledSelectValue(node: Node): void {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const binding = controlledSelectValues.get(current as Element);
      if (binding) {
        binding.reapply();
        return;
      }
    }
    current = current.parentNode;
  }
}

function reapplySelectValueAfterOptionBinding(
  el: Element,
  name: string,
): void {
  if (
    el.localName === "option" &&
    (name === "value" || name === "selected")
  ) {
    reapplyNearestControlledSelectValue(el);
  }
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
  /** Last successfully applied result, used to roll back a later failed item. */
  result: TemplateResult;
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
  const errors: unknown[] = [];
  if (st.isEach) {
    try {
      clearEach(st);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    clearCurrent(st);
  } catch (error) {
    errors.push(error);
  }
  throwCleanupErrors(errors, "[mado] child binding cleanup failed.");
}

/**
 * Verify that every node owned by this child binding still lives beside its
 * anchor. Nested instances recurse into their own child states, so removing a
 * dynamic top-level node is observable even when the stable anchor remains.
 */
export function isChildStateMounted(st: ChildState): boolean {
  const parent = st.anchor.parentNode;
  if (!parent) return false;

  if (st.isEach) {
    return [...st.eachEntries.values()].every(
      (entry) =>
        entry.nodes.every((node) => node.parentNode === parent) &&
        entry.inst.isMountedIn(parent),
    );
  }

  return (
    st.current.every((node) => node.parentNode === parent) &&
    st.currentInsts.every((inst) => inst.isMountedIn(parent))
  );
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
  queueCommit: QueueBindingCommit,
  bindingComplete: () => void,
): void {
  if (typeof value === "function") {
    let hasResolved = false;
    let resolved: unknown;

    const d = effect(() => {
      const next = (value as () => unknown)();
      if (hasResolved && Object.is(resolved, next)) return;

      const previous = resolved;
      const hadPrevious = hasResolved;
      try {
        renderChild(st, next, instantiateFn, queueCommit);
        resolved = next;
        hasResolved = true;
        bindingComplete();
      } catch (error) {
        // A child update may have removed/replaced owned nodes before a nested
        // binding throws. Restore the last successful resolved value so a
        // failed reactive pass cannot leave a half-rendered subtree behind.
        try {
          if (hadPrevious) {
            renderChild(st, previous, instantiateFn, queueCommit);
            resolved = previous;
            hasResolved = true;
            bindingComplete();
          } else {
            disposeChildState(st);
            resolved = undefined;
            hasResolved = false;
          }
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "[mado] child binding update and rollback both failed.",
          );
        }
        throw error;
      }
    });
    disposers.push(d);
    return;
  }
  renderChild(st, value, instantiateFn, queueCommit);
}

function renderChild(
  st: ChildState,
  value: unknown,
  instantiateFn: (r: TemplateResult) => InstantiatedTemplate,
  queueCommit: QueueBindingCommit,
): void {
  // each result: apply keyed reconciliation
  if (isEachResult(value)) {
    applyEach(st, value, instantiateFn, queueCommit);
    reapplyNearestControlledSelectValue(st.anchor);
    return;
  }

  // switching from each mode to normal: remove each entries
  if (st.isEach) {
    clearEach(st);
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
    st.currentInsts[0]!.update(value);
    reapplyNearestControlledSelectValue(st.anchor);
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
      queueNestedCommit(inst, queueCommit);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) handle(item);
      return;
    }
    append(document.createTextNode(String(v)));
  };

  handle(value);
  reapplyNearestControlledSelectValue(st.anchor);
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
  const instances = st.currentInsts.splice(0);
  const nodes = st.current.splice(0);
  const errors: unknown[] = [];

  for (const inst of instances) {
    try {
      inst.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const node of nodes) {
    try {
      node.parentNode?.removeChild(node);
    } catch (error) {
      errors.push(error);
    }
  }

  throwCleanupErrors(errors, "[mado] dynamic child cleanup failed.");
}

function clearEach(st: ChildState): void {
  const entries = [...st.eachEntries.values()];
  // Reset ownership before invoking user cleanup. Even when a ref disposer
  // throws, this ChildState must never retain a terminal nested instance.
  st.eachEntries.clear();
  st.eachOrder = [];
  st.isEach = false;

  const errors: unknown[] = [];
  for (const entry of entries) {
    try {
      entry.inst.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  throwCleanupErrors(errors, "[mado] keyed child cleanup failed.");
}

function throwCleanupErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}

/**
 * Nested instances inherit their owner's commit boundary. Rolling back this
 * task may dispose the instance because it is only queued for newly-created
 * (not previously mounted) nested content.
 */
function queueNestedCommit(
  inst: InstantiatedTemplate,
  queueCommit: QueueBindingCommit,
): void {
  queueCommit({
    commit: () => inst.commit(),
    rollback: () => inst.dispose(),
  });
}

/**
 * Keyed reconciliation: apply an EachResult to a ChildState.
 *
 * Algorithm (simple and readable, O(n) by keys):
 * 1. If switched from "normal" mode — first clear old content.
 * 2. Build new Map nextEntries: for each item
 *      - if key existed — reuse entry, call inst.update(result).
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
  queueCommit: QueueBindingCommit,
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
  const created: EachEntry[] = [];
  const updated: Array<{ entry: EachEntry; previous: TemplateResult }> = [];

  try {
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
        // If the template changed (different strings) — prepare a replacement
        // without disposing the mounted instance until the whole build passes.
        const sameTemplate = prev.inst._strings === tpl.strings;
        if (sameTemplate) {
          const previous = prev.result;
          prev.inst.update(tpl);
          updated.push({ entry: prev, previous });
          const next = { ...prev, result: tpl };
          newEntries.set(key, next);
        } else {
          const inst = instantiateFn(tpl);
          const entry = {
            inst,
            nodes: [...inst.fragment.childNodes],
            result: tpl,
          };
          created.push(entry);
          newEntries.set(key, entry);
        }
      } else {
        const inst = instantiateFn(tpl);
        const entry = {
          inst,
          nodes: [...inst.fragment.childNodes],
          result: tpl,
        };
        created.push(entry);
        newEntries.set(key, entry);
      }
      newOrder.push(key);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const entry of created) {
      try {
        entry.inst.dispose();
      } catch (disposeError) {
        rollbackErrors.push(disposeError);
      }
    }
    for (let index = updated.length - 1; index >= 0; index--) {
      const item = updated[index]!;
      try {
        item.entry.inst.update(item.previous);
      } catch (updateError) {
        rollbackErrors.push(updateError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "[mado] keyed binding update and rollback both failed.",
      );
    }
    throw error;
  }

  // 2) Publish the next ownership map before disposing retired instances.
  //
  // A ref cleanup is user code and may throw. Keeping the old map until after
  // cleanup would leave ChildState pointing at a terminal instance and poison
  // every later reconciliation. With the next map installed, the caller can
  // always roll this operation back from a coherent state.
  const retired: EachEntry[] = [];
  for (const [oldKey, oldEntry] of st.eachEntries) {
    const replacement = newEntries.get(oldKey);
    if (!replacement || replacement.inst !== oldEntry.inst) {
      retired.push(oldEntry);
    }
  }
  st.eachEntries = newEntries;
  st.eachOrder = newOrder;

  const transitionErrors: unknown[] = [];
  for (const entry of retired) {
    try {
      entry.inst.dispose();
    } catch (error) {
      transitionErrors.push(error);
    }
  }

  // 3) Place nodes in the correct order.
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
        try {
          // moveBefore only applies to a node already connected under `parent`;
          // for fresh nodes (not yet in the document) it would throw, so guard
          // on current connectivity and fall back to insertBefore otherwise.
          if (moveBefore && n.parentNode === parent) {
            moveBefore.call(parent, n, refNode);
          } else {
            parent.insertBefore(n, refNode);
          }
        } catch (error) {
          transitionErrors.push(error);
        }
      }
      // A failed insertion cannot become the reference for earlier nodes:
      // insertBefore would throw again because it is not a child of `parent`.
      if (n.parentNode === parent) refNode = n;
    }
  }

  if (transitionErrors.length === 0) {
    for (const entry of created) queueNestedCommit(entry.inst, queueCommit);
  }
  throwCleanupErrors(
    transitionErrors,
    "[mado] keyed child transition failed.",
  );
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
  queueCommit: QueueBindingCommit,
  bindingComplete: () => void,
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
    const target = el as unknown as Record<string, unknown>;
    let hasApplied = false;
    const applyProperty = (vv: unknown): void => {
      if (hasApplied) {
        try {
          if (Object.is(target[prop], vv)) return;
        } catch {
          // Preserve write-only and throwing-getter property contracts.
        }
      }
      target[prop] = vv;
      hasApplied = true;
      reapplySelectValueAfterOptionBinding(el, prop);
    };

    if (prop === "value" && el.localName === "select") {
      let desired: unknown;
      let hasDesired = false;
      const binding: ControlledSelectValueBinding = {
        reapply() {
          if (hasDesired) applyProperty(desired);
        },
      };
      controlledSelectValues.set(el, binding);
      disposers.push(() => {
        if (controlledSelectValues.get(el) === binding) {
          controlledSelectValues.delete(el);
        }
      });
      applyReactive(
        v,
        disposers,
        (vv) => {
          applyProperty(vv);
          desired = vv;
          hasDesired = true;
        },
        bindingComplete,
      );
      return;
    }

    applyReactive(v, disposers, applyProperty, bindingComplete);
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
      reapplySelectValueAfterOptionBinding(el, attrName);
    }, bindingComplete);
    return;
  }

  // ordinary attribute
  if (!isMulti) {
    warnBooleanAttrIfNeeded(name);
    const v = values[spec.slots[0]!];
    bindSingleAttr(
      el,
      name,
      v,
      disposers,
      queueCommit,
      bindingComplete,
    );
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
    let hasResolved = false;
    let resolved = "";
    const d = effect(() => {
      const next = compute();
      if (hasResolved && resolved === next) return;
      const previous = resolved;
      const hadPrevious = hasResolved;
      try {
        el.setAttribute(name, next);
        reapplySelectValueAfterOptionBinding(el, name);
        resolved = next;
        hasResolved = true;
        bindingComplete();
      } catch (error) {
        if (hadPrevious) {
          try {
            el.setAttribute(name, previous);
            reapplySelectValueAfterOptionBinding(el, name);
            resolved = previous;
            hasResolved = true;
            bindingComplete();
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "[mado] interpolated attribute update and rollback both failed.",
            );
          }
        }
        throw error;
      }
    });
    disposers.push(d);
  } else {
    el.setAttribute(name, compute());
    reapplySelectValueAfterOptionBinding(el, name);
  }
}

function bindSingleAttr(
  el: Element,
  name: string,
  value: unknown,
  disposers: Disposer[],
  queueCommit: QueueBindingCommit,
  bindingComplete: () => void,
): void {
  let cleanup: Disposer | undefined;
  let current: unknown;
  let hasCurrent = false;

  const clearCurrent = (): void => {
    const previous = current;
    const hadCurrent = hasCurrent;
    const previousCleanup = cleanup;
    cleanup = undefined;
    current = undefined;
    hasCurrent = false;

    let cleanupError: unknown;
    try {
      previousCleanup?.();
    } catch (error) {
      cleanupError = error;
    } finally {
      if (hadCurrent && !isHtmlDirective(previous)) {
        clearPlainAttr(el, name);
      }
    }
    if (cleanupError !== undefined) throw cleanupError;
  };

  const apply = (vv: unknown) => {
    if (hasCurrent && sameResolvedValue(current, vv)) return;

    const previous = current;
    const previousCleanup = cleanup;
    const hadPrevious = hasCurrent;

    // Transition cleanup is run before applying the next value, but keep the
    // old descriptor so a failed ref commit can restore it immediately.
    cleanup = undefined;
    current = undefined;
    hasCurrent = false;
    try {
      previousCleanup?.();
    } catch (error) {
      if (!hadPrevious) throw error;
      try {
        cleanup = applySingleAttrValue(
          el,
          name,
          previous,
          queueCommit,
        );
        current = previous;
        hasCurrent = true;
        reapplySelectValueAfterOptionBinding(el, name);
        bindingComplete();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "[mado] attribute cleanup and rollback both failed.",
        );
      }
      throw error;
    }
    if (hadPrevious && !isHtmlDirective(previous) && isHtmlDirective(vv)) {
      clearPlainAttr(el, name);
    }

    try {
      cleanup = applySingleAttrValue(el, name, vv, queueCommit);
      current = vv;
      hasCurrent = true;
      reapplySelectValueAfterOptionBinding(el, name);
      bindingComplete();
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      try {
        clearCurrent();
      } catch (cleanupError) {
        rollbackErrors.push(cleanupError);
      }
      if (hadPrevious) {
        try {
          cleanup = applySingleAttrValue(
            el,
            name,
            previous,
            queueCommit,
          );
          current = previous;
          hasCurrent = true;
          reapplySelectValueAfterOptionBinding(el, name);
          bindingComplete();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "[mado] attribute binding update and rollback both failed.",
        );
      }
      throw error;
    }
  };

  if (typeof value === "function") {
    const d = effect(() => apply((value as () => unknown)()));
    disposers.push(() => {
      d();
      clearCurrent();
    });
    return;
  }

  apply(value);
  if (cleanup || hasCurrent) {
    disposers.push(() => {
      // Plain values normally need no explicit cleanup because their element
      // is owned by the template. We still clear them here so a failed update
      // can roll the binding back without leaving a stale attribute.
      clearCurrent();
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
  reapplySelectValueAfterOptionBinding(el, name);
}

function applySingleAttrValue(
  el: Element,
  name: string,
  value: unknown,
  queueCommit: QueueBindingCommit,
): Disposer | undefined {
  if (isHtmlDirective(value)) {
    return applyAttrDirective(el, name, value, queueCommit);
  }

  if (value == null || value === false) el.removeAttribute(name);
  else el.setAttribute(name, value === true ? "" : String(value));
  return undefined;
}

function applyAttrDirective(
  el: Element,
  name: string,
  directive: HtmlDirective,
  queueCommit: QueueBindingCommit,
): Disposer | undefined {
  if (directive._madoDirective === "ref") {
    if (name !== "ref") {
      throw new Error(`[mado] ref() directive must be used as ref=\${ref(...)}.`);
    }
    el.removeAttribute(name);
    return queueRefCommit(el, directive, queueCommit);
  }

  if (directive._madoDirective === "classMap") {
    if (name !== "class") {
      throw new Error(
        `[mado] classMap() directive must be used as class=\${classMap(...)}.`,
      );
    }
    return applyClassMap(el, directive.value);
  }

  if (directive._madoDirective === "styleMap") {
    if (name !== "style") {
      throw new Error(
        `[mado] styleMap() directive must be used as style=\${styleMap(...)}.`,
      );
    }
    return applyStyleMap(el, directive.value);
  }

  throw new Error(
    "[mado] unsafeHTML() directive can only be used in child position.",
  );
}

/**
 * Refs are commit-phase bindings: callback(element) cannot run while the
 * template fragment is still detached. The returned disposer is idempotent
 * and owns both the callback's cleanup and the matching callback(null).
 */
function queueRefCommit(
  el: Element,
  directive: RefDirective,
  queueCommit: QueueBindingCommit,
): Disposer {
  let active = false;
  let disposed = false;
  let cleanup: Disposer | undefined;

  const detach = (): void => {
    if (!active) return;
    active = false;
    const currentCleanup = cleanup;
    cleanup = undefined;
    const errors: unknown[] = [];
    try {
      currentCleanup?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      directive.callback(null);
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[mado] ref cleanup failed.");
    }
  };

  const task: BindingCommit = {
    commit() {
      if (disposed || active) return;
      // Mark active before invoking user code so a throwing callback can still
      // receive its matching null notification during rollback.
      active = true;
      try {
        const result = directive.callback(el);
        if (typeof result === "function") cleanup = result;
      } catch (error) {
        try {
          detach();
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "[mado] ref callback and rollback both failed.",
          );
        }
        throw error;
      }
    },
    rollback() {
      detach();
    },
  };

  queueCommit(task);

  return () => {
    if (disposed) return;
    disposed = true;
    detach();
  };
}

function sameResolvedValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  return (
    isHtmlDirective(previous) &&
    isHtmlDirective(next) &&
    previous._madoDirective === "ref" &&
    next._madoDirective === "ref" &&
    previous.callback === next.callback
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
  bindingComplete: () => void,
): void {
  if (typeof value === "function") {
    let resolved: unknown;
    let hasResolved = false;
    const d = effect(() => {
      const next = (value as () => unknown)();
      if (hasResolved && Object.is(resolved, next)) return;
      const previous = resolved;
      const hadPrevious = hasResolved;
      try {
        apply(next);
        resolved = next;
        hasResolved = true;
        bindingComplete();
      } catch (error) {
        if (hadPrevious) {
          try {
            apply(previous);
            resolved = previous;
            hasResolved = true;
            bindingComplete();
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "[mado] reactive binding update and rollback both failed.",
            );
          }
        }
        throw error;
      }
    });
    disposers.push(d);
  } else {
    apply(value);
  }
}
