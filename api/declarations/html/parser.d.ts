/**
 * Tagged-template parser: a state machine that turns strings[] into
 *   { template: HTMLTemplateElement, bindings: BindingSpec[] }
 *
 * It does not depend on the reactive runtime (signal/each/effect), only on DOM
 * APIs (document.createElement and walking Node trees). That makes it possible
 * to test the parser in isolation and reuse it for future static tooling.
 *
 * Algorithm:
 *  1. Walk strings[] char-by-char through an explicit finite state machine.
 *     For every `${}` slot we know the current context: text, attribute,
 *     attribute value, comment, or raw text.
 *  2. Build the final HTML string with markers:
 *       - opaque comments for child slots
 *       - opaque data attributes for attribute slots
 *     and keep a parallel BindingSpec list that describes each slot.
 *  3. Parse HTML through `<template>.innerHTML`, then walk() finds markers in
 *     the DOM and fills BindingSpec.path and childIndex. Marker attributes are
 *     removed from elements; marker comments remain as child binding anchors.
 *  4. Cache by strings identity. TemplateStringsArray is stable for the same
 *     tagged literal between calls.
 */
export interface ChildBindingSpec {
    type: "child";
    id: number;
    path: number[];
    childIndex: number;
    slot: number;
}
/** Attribute / event / property / boolean — can be multi-part. */
export interface AttrBindingSpec {
    type: "attr";
    id: number;
    path: number[];
    /** Attribute name: 'class', '@click', '.value', '?disabled'. */
    name: string;
    /**
     * If the attribute is single-part (the entire value = one ${}), then
     * slots = [N], strings = ['', ''], isMulti = false.
     * If multi-part, strings and slots alternate:
     *   strings[0] + values[slots[0]] + strings[1] + ... + strings[k]
     */
    strings: string[];
    slots: number[];
    /** True if the value is assembled from multiple parts (static + slots). */
    isMulti: boolean;
}
export type BindingSpec = ChildBindingSpec | AttrBindingSpec;
export interface ParsedTemplate {
    template: HTMLTemplateElement;
    bindings: BindingSpec[];
}
/**
 * Main export: parse a tagged-template literal into a ready-to-instantiate
 * ParsedTemplate. Idempotent (cached by strings).
 */
export declare function parseTemplate(strings: TemplateStringsArray): ParsedTemplate;
/**
 * Retrieve a node by path from root. Used when instantiating
 * a template to resolve BindingSpec.path → concrete Node in the clone.
 */
export declare function resolvePath(root: Node, path: number[]): Node;
