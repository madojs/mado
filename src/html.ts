/**
 * html module entry point. The implementation lives in `./html/`:
 *
 *   ./html/parser.ts          — state-machine tokenizer + ParsedTemplate cache
 *   ./html/bindings.ts        — bindChild / bindAttr + keyed each
 *   ./html/template.ts        — html`` tag, instantiate(), render()
 *   ./html/template-types.ts  — shared types (TemplateResult, InstantiatedTemplate)
 *
 * This file keeps compatibility for internal imports from `"./html.js"`.
 * The public barrel (`src/index.ts`) also goes through this file.
 *
 * If the shell is ever removed, switch imports to `./html/template.js`.
 * For now it has no runtime cost.
 */

export { html, render, instantiate } from "./html/template.js";
export {
  unsafeHTML,
  ref,
  classMap,
  styleMap,
  isHtmlDirective,
} from "./html/bindings.js";
export type { TemplateResult } from "./html/template-types.js";
export type {
  HtmlDirective,
  UnsafeHTMLDirective,
  RefCallback,
  RefDirective,
  ClassMap,
  ClassMapDirective,
  StyleMap,
  StyleMapDirective,
} from "./html/bindings.js";
