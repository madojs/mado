/**
 * Small shared type module extracted from html.ts to avoid a cycle:
 * bindings.ts knows about TemplateResult / InstantiatedTemplate, template.ts
 * instantiates through them, and neither module depends on the other directly
 * (instantiate is passed into bindings as a parameter).
 */
export interface TemplateResult {
    readonly _mado: true;
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];
}
export declare const isTemplateResult: (v: unknown) => v is TemplateResult;
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
