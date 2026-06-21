/**
 * Keyed list rendering.
 *
 * each() returns a special EachResult descriptor. The html binder recognizes
 * it by the `_madoEach` flag and applies keyed reconciliation: on every
 * update it reuses DOM nodes for the same keys and moves them with
 * insertBefore instead of recreating everything.
 *
 * Key differences from a naive implementation:
 *   - state lives in the parent's ChildState, not globally by renderFn, so two
 *     each() calls with the same render function do not interfere;
 *   - DOM nodes are actually reused, so input focus, animations,
 *     IntersectionObserver state and .scrollTop survive reorder.
 *
 * API:
 *   each(items, item => item.id, item => html`<li>${item.name}</li>`)
 *
 * Template usage:
 *   html`<ul>${() => each(items(), t => t.id, t => html`<li>${t.text}</li>`)}</ul>`
 */

import { html } from "./html/template.js";
import type { TemplateResult } from "./html/template-types.js";

export type EachKey = string | number;

/**
 * Marker recognised by the html binder.
 * Do not set `_madoEach` yourself — use each().
 */
export interface EachResult<T = unknown> {
  readonly _madoEach: true;
  readonly items: readonly T[];
  readonly keyOf: (item: T, index: number) => EachKey;
  readonly render: (item: T, index: number) => TemplateResult;
}

export const isEachResult = (v: unknown): v is EachResult =>
  typeof v === "object" &&
  v !== null &&
  (v as EachResult)._madoEach === true;

export function each<T>(
  items: readonly T[],
  keyOf: (item: T, index: number) => EachKey,
  render: (item: T, index: number) => TemplateResult,
): EachResult<T> {
  return { _madoEach: true, items, keyOf, render };
}

/**
 * Sugar: returns a ready TemplateResult with the given list as children.
 * Convenient when you need a list without a wrapping parent.
 */
export function list<T>(
  items: readonly T[],
  keyOf: (item: T, index: number) => EachKey,
  render: (item: T, index: number) => TemplateResult,
): TemplateResult {
  return html`${each(items, keyOf, render)}`;
}
