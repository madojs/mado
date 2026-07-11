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

// ---------- Markers ----------


/**
 * Stable, template-specific marker token.
 *
 * The token must not be a predictable global counter because authored markup
 * can contain similarly named attributes. It also cannot use randomness:
 * child anchors survive static capture and must be byte-for-byte reproducible.
 */
function markerTokenFor(strings: TemplateStringsArray): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (const part of strings) {
    first ^= part.length;
    second ^= part.length;
    for (let index = 0; index < part.length; index++) {
      const code = part.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    first = Math.imul(first ^ 0xffff, 0x01000193);
    second = Math.imul(second ^ 0xffff, 0xc2b2ae35);
  }

  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

// ---------- Binding description ----------


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

// ---------- Cache ----------


const templateCache = new WeakMap<TemplateStringsArray, ParsedTemplate>();

// ---------- State machine ----------


type State =
  | "TEXT"
  | "TAG_OPEN" // after '<'
  | "TAG_NAME"
  | "BEFORE_ATTR" // inside a tag, between attributes
  | "ATTR_NAME"
  | "AFTER_ATTR_NAME" // after name, before '=' or next attribute
  | "BEFORE_ATTR_VALUE" // after '='
  | "ATTR_VALUE_DQ" // inside double quotes
  | "ATTR_VALUE_SQ" // inside single quotes
  | "ATTR_VALUE_UNQ" // unquoted
  | "SELF_CLOSE" // inside a tag, after '/'
  | "COMMENT" // inside <!-- ... -->
  | "RAW_TEXT" // inside <script>/<style>/<textarea>/<title>
  | "CLOSE_TAG"; // </name>

// Tags inside which HTML is not parsed.
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

// SVG-only element names. If one of these is the TOP-LEVEL element of a
// template, the HTML parser (`<template>.innerHTML`) places it in the HTML
// namespace instead of the SVG namespace → an invisible element. Mado has no
// `svg\`\`` tag yet, so we detect this and throw a clear error instead of
// rendering nothing. A self-contained `<svg>…</svg>` is fine: the parser puts
// everything under <svg> into the SVG namespace correctly. (FABLE_REPORT #7)
const SVG_ONLY_TAGS = new Set([
  "circle",
  "clippath",
  "defs",
  "ellipse",
  "g",
  "image",
  "line",
  "lineargradient",
  "mask",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "text",
  "tspan",
  "use",
]);


interface AttrAccum {
  /** Raw name as written in the template (including @/./? prefixes). */
  rawName: string;
  /** Value fragments between slots; for attributes without value — empty array. */
  valueParts: string[];
  /** Current fragment being collected (between slots). */
  current: string;
  /** Slots that appeared in this attribute's value. */
  slots: number[];
  /** Which quote opened the value: '"' | "'" | '' (unquoted). */
  quote: string;
  /** Whether there was any value (=). Attributes without value are boolean. */
  hasValue: boolean;
}

/**
 * Main export: parse a tagged-template literal into a ready-to-instantiate
 * ParsedTemplate. Idempotent (cached by strings).
 */
export function parseTemplate(strings: TemplateStringsArray): ParsedTemplate {
  const cached = templateCache.get(strings);
  if (cached) return cached;

  const bindings: BindingSpec[] = [];
  let html = "";
  let state: State = "TEXT";
  let tagName = "";
  let attr: AttrAccum | null = null;
  let rawTagName = "";
  let firstTagName = "";
  let nextId = 0;
  const markerToken = markerTokenFor(strings);
  const childMarkerPrefix = `mado$${markerToken}$`;
  const attrMarkerPrefix = `data-mado-bind-${markerToken}-`;


  /** Creates a child binding and adds a marker to html. */
  const emitChildMarker = (slot: number): void => {
    const id = nextId++;
    html += `<!--${childMarkerPrefix}${id}-->`;
    bindings.push({
      type: "child",
      id,
      path: [], // filled during walk
      childIndex: 0,
      slot,
    });
  };

  /** Closes the current attribute and flushes it into html. */
  const flushAttr = (): void => {
    if (!attr) return;
    // Finalize the last fragment.
    if (attr.hasValue) {
      attr.valueParts.push(attr.current);
    }

    if (attr.slots.length === 0) {
      // Static attribute: emit as-is.
      if (!attr.hasValue) {
        html += " " + attr.rawName;
      } else if (attr.quote) {
        html +=
          " " + attr.rawName + "=" + attr.quote + attr.current + attr.quote;
      } else {
        html += " " + attr.rawName + "=" + attr.current;
      }
    } else {
      // dynamic attribute — place marker, write binding
      const id = nextId++;
      // escape name for safe writing into a data attribute value
      const escapedName = attr.rawName
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;");
      html += ` ${attrMarkerPrefix}${id}="${escapedName}"`;
      const parts = attr.valueParts.length > 0 ? attr.valueParts : ["", ""];
      // single-part: the attribute is entirely defined by one slot
      // (all static fragments are empty ⇒ value = just values[slot])
      const isMulti = attr.slots.length > 1 || parts.some((p) => p !== "");
      bindings.push({
        type: "attr",
        id,
        path: [], // filled during walk
        name: attr.rawName,
        strings: parts,
        slots: attr.slots,
        isMulti,
      });
    }
    attr = null;
  };

  /** Processes one character of a template string. */
  const processChar = (c: string, i: number, s: string): void => {
    switch (state) {
      // ---------- TEXT ----------
      case "TEXT": {
        if (c === "<") {
          // Potential tag start.
          const next = s[i + 1] ?? "";
          if (/[a-zA-Z]/.test(next)) {
            html += "<";
            tagName = "";
            state = "TAG_NAME";
          } else if (next === "/") {
            html += "<";
            state = "CLOSE_TAG";
          } else if (next === "!") {
            // Check for <!--.
            if (s[i + 2] === "-" && s[i + 3] === "-") {
              html += "<";
              state = "COMMENT";
              // Every following char is copied into html as-is.
            } else {
              // <!doctype or <![CDATA[: treat as a normal tag-like block.
              html += "<";
              state = "CLOSE_TAG"; // Reuse CLOSE_TAG as "wait until >".
            }
          } else {
            // '<' does not open a tag here, e.g. "a < b".
            html += "&lt;";
          }
        } else {
          html += c;
        }
        break;
      }

      // ---------- TAG_NAME ----------
      case "TAG_NAME": {
        if (/\s/.test(c)) {
          html += c;
          // Tag name complete — remember the first element's tag (SVG guard).
          if (firstTagName === "") firstTagName = tagName.toLowerCase();
          state = "BEFORE_ATTR";
        } else if (c === "/") {
          if (firstTagName === "") firstTagName = tagName.toLowerCase();
          state = "SELF_CLOSE";
        } else if (c === ">") {
          html += c;
          if (firstTagName === "") firstTagName = tagName.toLowerCase();
          if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = "RAW_TEXT";
          } else {
            state = "TEXT";
          }
        } else {
          tagName += c;
          html += c;
        }
        break;
      }

      // ---------- BEFORE_ATTR ----------
      case "BEFORE_ATTR": {

        if (/\s/.test(c)) {
          html += c;
        } else if (c === "/") {
          state = "SELF_CLOSE";
        } else if (c === ">") {
          html += c;
          if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = "RAW_TEXT";
          } else {
            state = "TEXT";
          }
        } else {
          // Start a new attribute accumulator.
          attr = {
            rawName: c,
            valueParts: [],
            current: "",
            slots: [],
            quote: "",
            hasValue: false,
          };
          state = "ATTR_NAME";
        }
        break;
      }

      // ---------- ATTR_NAME ----------
      case "ATTR_NAME": {
        if (c === "=") {
          attr!.hasValue = true;
          state = "BEFORE_ATTR_VALUE";
        } else if (/\s/.test(c)) {
          state = "AFTER_ATTR_NAME";
        } else if (c === "/") {
          flushAttr();
          state = "SELF_CLOSE";
        } else if (c === ">") {
          flushAttr();
          html += c;
          if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = "RAW_TEXT";
          } else {
            state = "TEXT";
          }
        } else {
          attr!.rawName += c;
        }
        break;
      }

      // ---------- AFTER_ATTR_NAME ----------
      case "AFTER_ATTR_NAME": {
        if (/\s/.test(c)) {
          // Keep skipping whitespace.
        } else if (c === "=") {
          attr!.hasValue = true;
          state = "BEFORE_ATTR_VALUE";
        } else if (c === "/") {
          flushAttr();
          html += " ";
          state = "SELF_CLOSE";
        } else if (c === ">") {
          flushAttr();
          html += c;
          if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = "RAW_TEXT";
          } else {
            state = "TEXT";
          }
        } else {
          // This starts a new attribute; the previous one was boolean.
          flushAttr();
          html += " ";
          attr = {
            rawName: c,
            valueParts: [],
            current: "",
            slots: [],
            quote: "",
            hasValue: false,
          };
          state = "ATTR_NAME";
        }
        break;
      }

      // ---------- BEFORE_ATTR_VALUE ----------
      case "BEFORE_ATTR_VALUE": {
        if (/\s/.test(c)) {
          // skip
        } else if (c === '"') {
          attr!.quote = '"';
          state = "ATTR_VALUE_DQ";
        } else if (c === "'") {
          attr!.quote = "'";
          state = "ATTR_VALUE_SQ";
        } else if (c === ">") {
          // Empty value through =
          flushAttr();
          html += c;
          state = "TEXT";
        } else {
          attr!.quote = "";
          attr!.current = c;
          state = "ATTR_VALUE_UNQ";
        }
        break;
      }

      // ---------- ATTR_VALUE_DQ ----------
      case "ATTR_VALUE_DQ": {
        if (c === '"') {
          flushAttr();
          state = "BEFORE_ATTR";
        } else {
          attr!.current += c;
        }
        break;
      }

      // ---------- ATTR_VALUE_SQ ----------
      case "ATTR_VALUE_SQ": {
        if (c === "'") {
          flushAttr();
          state = "BEFORE_ATTR";
        } else {
          attr!.current += c;
        }
        break;
      }

      // ---------- ATTR_VALUE_UNQ ----------
      case "ATTR_VALUE_UNQ": {
        if (/\s/.test(c)) {
          flushAttr();
          html += c;
          state = "BEFORE_ATTR";
        } else if (c === ">") {
          flushAttr();
          html += c;
          if (RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTagName = tagName.toLowerCase();
            state = "RAW_TEXT";
          } else {
            state = "TEXT";
          }
        } else if (c === "/" && s[i + 1] === ">") {
          // Self-closing after an unquoted value: <x-icon name=${v}/>
          flushAttr();
          state = "SELF_CLOSE";
        } else {
          attr!.current += c;
        }
        break;
      }

      // ---------- SELF_CLOSE ----------
      case "SELF_CLOSE": {
        if (c === ">") {
          const lower = tagName.toLowerCase();
          if (
            !VOID_ELEMENTS.has(lower) &&
            lower !== "svg" &&
            !SVG_ONLY_TAGS.has(lower)
          ) {
            throw new Error(
              `[mado] <${tagName}/> is not self-closing in HTML. ` +
                `Write <${tagName}></${tagName}> instead.`,
            );
          }
          html += "/>";
          state = "TEXT";
        } else if (/\s/.test(c)) {
          // ignore
        } else {
          // Not self-closing: roll back into a normal attribute.
          html += "/";
          attr = {
            rawName: c,
            valueParts: [],
            current: "",
            slots: [],
            quote: "",
            hasValue: false,
          };
          state = "ATTR_NAME";
        }
        break;
      }

      // ---------- COMMENT ----------
      case "COMMENT": {
        html += c;
        // Look for '-->' by checking the last three html chars.
        if (
          html.endsWith("-->") &&
          // Guard: it must be at least the length of "<!---->".
          html.length >= 7
        ) {
          state = "TEXT";
        }
        break;
      }

      // ---------- RAW_TEXT ----------
      case "RAW_TEXT": {
        html += c;
        // Look for the closing </tagName>.
        const closing = "</" + rawTagName;
        if (c === ">" && html.toLowerCase().endsWith(closing + ">")) {
          rawTagName = "";
          state = "TEXT";
        }
        break;
      }

      // ---------- CLOSE_TAG ----------
      case "CLOSE_TAG": {
        html += c;
        if (c === ">") {
          state = "TEXT";
        }
        break;
      }
    }
  };

  /** Processes the slot ${...} between strings[i] and strings[i+1]. */
  const processSlot = (slot: number): void => {
    switch (state) {
      case "TEXT": {
        emitChildMarker(slot);
        break;
      }
      case "TAG_NAME":
      case "BEFORE_ATTR":
      case "ATTR_NAME":
      case "AFTER_ATTR_NAME": {
        throw new Error(
          `[mado] Dynamic slot in tag/attribute name position is not supported (state=${state}).`,
        );
      }
      case "BEFORE_ATTR_VALUE": {
        // <attr=${v}> without quotes: the slot is the whole value.
        attr!.quote = "";
        attr!.slots.push(slot);
        attr!.valueParts.push(attr!.current);
        attr!.current = "";
        state = "ATTR_VALUE_UNQ";
        break;
      }
      case "ATTR_VALUE_DQ":
      case "ATTR_VALUE_SQ":
      case "ATTR_VALUE_UNQ": {
        attr!.slots.push(slot);
        attr!.valueParts.push(attr!.current);
        attr!.current = "";
        break;
      }
      case "COMMENT": {
        // binding inside a static comment — ignore
        break;
      }
      case "RAW_TEXT": {
        // A ${} slot inside <textarea>/<title>/<style>/<script> cannot become a
        // child binding — the browser parses these as raw text, so the marker
        // comment would be literal text. Throw a clear, fixable error instead
        // of silently dropping the value. (FABLE_REPORT.md finding #7)
        throw new Error(rawTextSlotError(rawTagName));
      }

      case "SELF_CLOSE":
      case "CLOSE_TAG":
      case "TAG_OPEN": {
        throw new Error(
          `[mado] Dynamic slot in position ${state} is not supported.`,
        );
      }
    }
  };

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]!;
    for (let j = 0; j < s.length; j++) {
      processChar(s[j]!, j, s);
    }
    if (i < strings.length - 1) {
      processSlot(i);
    }
  }

  // SVG-only root guard: <template>.innerHTML parses an SVG child element
  // (e.g. <circle>, <path>) in the HTML namespace, producing an invisible
  // element. Detect it and throw a clear error instead of rendering nothing.
  if (SVG_ONLY_TAGS.has(firstTagName)) {
    throw new Error(
      `[mado] <${firstTagName}> cannot be a top-level template element — it ` +
        `renders in the wrong (HTML) namespace and stays invisible. Wrap SVG ` +
        `content in a single <svg>…</svg> template instead of nesting an SVG ` +
        `child as its own html\`\` fragment.`,
    );
  }

  // 2) Parse the final HTML string through <template>.
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  for (const nested of tpl.content.querySelectorAll("template")) {
    if (containsMarker(nested.content, childMarkerPrefix, attrMarkerPrefix)) {
      throw new Error(
        "[mado] Dynamic slots inside <template> are not supported. " +
          "Move the dynamic value outside <template> or render it after cloning.",
      );
    }
  }


  // 3) Walk content, find markers, fill path/childIndex for bindings.
  const byId = new Map<number, BindingSpec>();
  for (const b of bindings) byId.set(b.id, b);
  walk(tpl.content, [], byId, childMarkerPrefix, attrMarkerPrefix);

  const parsed: ParsedTemplate = { template: tpl, bindings };
  templateCache.set(strings, parsed);
  return parsed;
}

/**
 * Walk the template DOM: for each marker (attribute or comment)
 * find the corresponding BindingSpec and fill its `path` (how to
 * reach it from root) and `childIndex` (for child bindings — position
 * of the placeholder comment among the parent's children).
 *
 * Internal marker attributes are removed from elements;
 * marker comments remain — they serve as an "anchor" for child binding.
 */
function walk(
  node: Node,
  path: number[],
  byId: Map<number, BindingSpec>,
  childMarkerPrefix: string,
  attrMarkerPrefix: string,
): void {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const toRemove: string[] = [];
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith(attrMarkerPrefix)) {
        const id = Number(attr.name.slice(attrMarkerPrefix.length));
        const b = byId.get(id);
        if (b && b.type === "attr") {
          b.path = [...path];
        }
        toRemove.push(attr.name);
      }
    }
    for (const n of toRemove) el.removeAttribute(n);
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const c = node as Comment;
    if (c.data.startsWith(childMarkerPrefix)) {
      const id = Number(c.data.slice(childMarkerPrefix.length));
      const b = byId.get(id);
      if (b && b.type === "child") {
        // Path points to the parent; index is the node position among children.
        b.path = path.slice(0, -1);
        b.childIndex = path[path.length - 1]!;
      }
    }
  }

  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    walk(children[i]!, [...path, i], byId, childMarkerPrefix, attrMarkerPrefix);
  }
}

function containsMarker(
  node: Node,
  childMarkerPrefix: string,
  attrMarkerPrefix: string,
): boolean {
  if (
    node.nodeType === Node.COMMENT_NODE &&
    (node as Comment).data.startsWith(childMarkerPrefix)
  ) return true;
  if (
    node.nodeType === Node.ELEMENT_NODE &&
    [...(node as Element).attributes].some((attr) =>
      attr.name.startsWith(attrMarkerPrefix))
  ) return true;
  for (const child of node.childNodes) {
    if (containsMarker(child, childMarkerPrefix, attrMarkerPrefix)) return true;
  }
  return false;
}

/**
 * Retrieve a node by path from root. Used when instantiating
 * a template to resolve BindingSpec.path → concrete Node in the clone.
 */
export function resolvePath(root: Node, path: number[]): Node {
  let n: Node = root;
  for (const i of path) n = n.childNodes[i]!;
  return n;
}

/** Build a fixable error message for a ${} slot inside a RAW_TEXT element. */
function rawTextSlotError(rawTagName: string): string {
  const base = `[mado] Dynamic \${...} inside <${rawTagName}> is not supported`;
  if (rawTagName === "textarea" || rawTagName === "title") {
    return `${base} — the browser parses it as raw text. Use .value=\${value} on the element instead, e.g. <${rawTagName} .value=\${value}></${rawTagName}>.`;
  }
  if (rawTagName === "style") {
    return `${base}. Build styles with the css\`\` tag (component styles) or a static <style>.`;
  }
  return `${base}. Inline <script> with dynamic content is not supported.`;
}
