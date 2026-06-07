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

export const isTemplateResult = (v: unknown): v is TemplateResult =>
  typeof v === "object" && v !== null && (v as TemplateResult)._mado === true;

/**
 * Ready-to-use template instance: already cloned, bindings attached, nodes
 * extracted. Insert the fragment into the DOM, then call update() when values
 * change and dispose() when removing it.
 *
 * `_strings` lets keyed each decide whether an instance can be reused
 * (same tagged literal) or must be recreated.
 */
export interface InstantiatedTemplate {
  fragment: DocumentFragment;
  nodes: Node[];
  update(values: readonly unknown[]): void;
  dispose(): void;
  _strings: TemplateStringsArray;
}
