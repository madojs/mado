/**
 * Small shared type module extracted from html.ts to avoid a cycle:
 * bindings.ts knows about TemplateResult / InstantiatedTemplate, template.ts
 * instantiates through them, and neither module depends on the other directly
 * (instantiate is passed into bindings as a parameter).
 */

import type { Disposer } from "../signal.js";

export interface TemplateResult {
  readonly _mado: true;
  readonly strings: TemplateStringsArray;
  readonly values: readonly unknown[];
}

export const isTemplateResult = (v: unknown): v is TemplateResult =>
  typeof v === "object" && v !== null && (v as TemplateResult)._mado === true;

const owners = new WeakMap<TemplateResult, Disposer>();
const postCommitCallbacks = new WeakMap<TemplateResult, () => void>();

/**
 * Tie an internal lifecycle to the concrete template that represents it.
 *
 * This is intentionally not part of the public TemplateResult shape. The
 * renderer reads the owner when it instantiates the result and releases it
 * whenever that instance is rolled back, replaced, or unmounted.
 *
 * @internal
 */
export function _setTemplateOwner(
  result: TemplateResult,
  dispose: Disposer,
): void {
  owners.set(result, dispose);
}

/** @internal */
export function _getTemplateOwner(
  result: TemplateResult,
): Disposer | undefined {
  return owners.get(result);
}

/**
 * Attach framework-owned work that must run only after this concrete template
 * has committed to the live DOM. The renderer defers the callback to a
 * microtask and cancels it when the candidate is replaced, rolled back or
 * disposed before that point.
 *
 * This is intentionally internal metadata rather than part of TemplateResult:
 * application mount work belongs in ref(), while the router needs a DOM commit
 * fence without adding wrapper elements to arbitrary page templates.
 *
 * @internal
 */
export function _setTemplatePostCommit(
  result: TemplateResult,
  callback: () => void,
): void {
  postCommitCallbacks.set(result, callback);
}

/** @internal */
export function _getTemplatePostCommit(
  result: TemplateResult,
): (() => void) | undefined {
  return postCommitCallbacks.get(result);
}

/**
 * Ready-to-use template instance: already cloned, bindings attached, nodes
 * extracted. Insert the fragment into the DOM, call commit() exactly once to
 * activate mount-sensitive work, then call update() when values change and
 * dispose() when removing it.
 *
 * `_strings` lets keyed each decide whether an instance can be reused
 * (same tagged literal) or must be recreated.
 */
export interface InstantiatedTemplate {
  fragment: DocumentFragment;
  nodes: Node[];
  /**
   * Activate mount-sensitive bindings after the fragment has been inserted.
   *
   * Kept internal to the renderer: callers that create nested instances queue
   * this method on their owning instance so refs never observe detached DOM.
   * A failed first commit is terminal: partial work is rolled back and the
   * complete instance is disposed. Create a new instance instead of retrying.
   */
  commit(): void;
  /**
   * Apply the next result from the same tagged-template callsite.
   * Internal lifecycle ownership moves transactionally with the result.
   */
  update(result: TemplateResult): void;
  dispose(): void;
  /** Verify that all stable and dynamic owned nodes remain under `container`. */
  isMountedIn(container: Node): boolean;
  _strings: TemplateStringsArray;
}
