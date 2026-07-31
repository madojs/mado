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
import { type Disposer } from "../signal.js";
import { type EachKey } from "../each.js";
import type { AttrBindingSpec } from "./parser.js";
import { type TemplateResult, type InstantiatedTemplate } from "./template-types.js";
type DirectiveKind = "unsafeHTML" | "ref" | "classMap" | "styleMap";
interface DirectiveBase {
    readonly _madoDirective: DirectiveKind;
}
export interface UnsafeHTMLDirective extends DirectiveBase {
    readonly _madoDirective: "unsafeHTML";
    readonly value: string;
}
export type RefCallback<T extends Element = Element> = (el: T | null) => void | Disposer;
export interface RefDirective<T extends Element = Element> extends DirectiveBase {
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
export type HtmlDirective = UnsafeHTMLDirective | RefDirective | ClassMapDirective | StyleMapDirective;
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
export declare function unsafeHTML(value: string): UnsafeHTMLDirective;
/**
 * Call `callback(element)` after the complete template is inserted, and clean
 * it up on disposal. A returned disposer runs before the matching
 * `callback(null)`. Use as `ref=${ref((el) => { ... })}`.
 */
export declare function ref<T extends Element = Element>(callback: RefCallback<T>): RefDirective<T>;
/** Toggle CSS classes by object keys. Truthy values add, falsy values remove. */
export declare function classMap(value: ClassMap): ClassMapDirective;
/** Apply inline styles from an object and remove stale keys on updates. */
export declare function styleMap(value: StyleMap): StyleMapDirective;
export declare function isHtmlDirective(v: unknown): v is HtmlDirective;
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
export declare function createChildState(anchor: Comment): ChildState;
export declare function disposeChildState(st: ChildState): void;
/**
 * Verify that every node owned by this child binding still lives beside its
 * anchor. Nested instances recurse into their own child states, so removing a
 * dynamic top-level node is observable even when the stable anchor remains.
 */
export declare function isChildStateMounted(st: ChildState): boolean;
/**
 * Bind a value to a child binding. If value is a function (signal),
 * subscribe via effect(); otherwise render once.
 *
 * instantiateFn is passed as a parameter to avoid circular
 * dependency bindings ↔ template.
 */
export declare function bindChild(st: ChildState, value: unknown, disposers: Disposer[], instantiateFn: (r: TemplateResult) => InstantiatedTemplate, queueCommit: QueueBindingCommit, bindingComplete: () => void): void;
/**
 * Apply a value to an attr binding. Route by prefix:
 *   @event     → addEventListener
 *   .prop      → el[prop] = value
 *   ?attr      → toggleAttribute by truthy/falsy
 *   otherwise  → setAttribute / removeAttribute (with multi-part support)
 */
export declare function bindAttr(el: Element, spec: AttrBindingSpec, values: readonly unknown[], disposers: Disposer[], queueCommit: QueueBindingCommit, bindingComplete: () => void): void;
export {};
