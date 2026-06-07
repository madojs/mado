/**
 * Styles without CSS-in-JS, but ergonomic.
 *
 * Idea:
 *   1. `css\`...\`` — tagged literal, returns a CSSStyleSheet (Constructable Stylesheet).
 *   2. Sheet is shared across all component instances (one copy in memory).
 *   3. Component applies the sheet via `shadowRoot.adoptedStyleSheets`.
 *   4. No runtime CSS parsers, no className hashes —
 *      the browser does all the work.
 *
 * Theming:
 *   - change CSS variables on :host or :root — no re-renders needed.
 *   - `cssVars({ '--accent': color })` → ready string for style="...".
 *
 * Optional scope without Shadow DOM:
 *   - if the browser has @scope (Chrome 118+, Safari 17.4+), we wrap styles.
 *   - fallback: prefix selectors with the tag — a simple regex at string level.
 */

export type CSSResult = CSSStyleSheet;

/**
 * Tagged literal for CSS. Returns a CSSStyleSheet ready for
 * adoptedStyleSheets. Value interpolation — only primitives or
 * other CSSResult (for composition).
 *
 * Injection guard: strings with `<` or `>` are forbidden so that
 * script tags cannot accidentally be injected through styles.
 */
export function css(
  strings: TemplateStringsArray,
  ...values: unknown[]
): CSSResult {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < strings.length - 1) {
      const v = values[i];
      if (v == null) continue;
      if (v instanceof CSSStyleSheet) {
        // composition — insert all rules
        for (const rule of v.cssRules) text += rule.cssText;
        continue;
      }
      const s = String(v);
      if (/[<>]/.test(s)) {
        throw new Error("css``: `<` and `>` are forbidden in interpolations");
      }
      text += s;
    }
  }

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}

/**
 * Build an inline-style string from a CSS variables object.
 *
 *   cssVars({ '--accent': '#f00', '--pad': '1rem' })
 *     → '--accent: #f00; --pad: 1rem;'
 *
 * Usage:
 *   html`<div style=${cssVars({ '--accent': color })}>...</div>`
 *   html`<x-app style=${cssVars(theme())}>...</x-app>`   // signal — auto-update
 */
export function cssVars(vars: Record<string, string | number>): string {
  let out = "";
  for (const k in vars) {
    const v = vars[k];
    if (v == null) continue;
    const name = k.startsWith("--") ? k : `--${k}`;
    out += `${name}:${v};`;
  }
  return out;
}

/**
 * Apply sheets to a ShadowRoot. Idempotent: the same sheet
 * can be adopted into dozens of components without duplicating styles.
 */
export function adopt(root: ShadowRoot, ...sheets: CSSResult[]): void {
  // append rather than overwrite — user may have already adopted something
  const existing = root.adoptedStyleSheets;
  const toAdd = sheets.filter((s) => !existing.includes(s));
  if (toAdd.length === 0) return;
  root.adoptedStyleSheets = [...existing, ...toAdd];
}

// ---------- Scope for light DOM (without Shadow DOM) ----------


const hasScope = (() => {
  try {
    return CSS.supports("selector(:scope)") &&
      // @scope at-rule support check
      typeof (CSSRule as unknown as { SCOPE_RULE?: number }).SCOPE_RULE !==
        "undefined";
  } catch {
    return false;
  }
})();

/**
 * Build scoped style text limited to a selector (for light DOM).
 * Uses native @scope if the browser supports it.
 * Otherwise — naive selector prefixing.
 *
 *   scopeStyles('x-button', 'button { color: red }')
 *     → '@scope (x-button) { button { color: red } }'  // or
 *     → 'x-button button { color: red }'
 */
export function scopeStyles(tagName: string, sheet: CSSResult): CSSResult {
  let text = "";
  for (const rule of sheet.cssRules) text += rule.cssText;

  let scoped: string;
  if (hasScope) {
    scoped = `@scope (${tagName}) { ${text} }`;
  } else {
    // naive: prefix every top-level selector with `tagName `.
    // Works for simple cases "button {...}", "p, span {...}".
    // Does not touch @-rules.
    scoped = text.replace(/(^|\})\s*([^{}@][^{}]*)\{/g, (_m, brace, sel) => {
      const prefixed = sel
        .split(",")
        .map((s: string) => {
          const trimmed = s.trim();
          if (!trimmed) return trimmed;
          if (trimmed.startsWith(tagName)) return trimmed;
          return `${tagName} ${trimmed}`;
        })
        .join(", ");
      return `${brace} ${prefixed} {`;
    });
  }

  const out = new CSSStyleSheet();
  out.replaceSync(scoped);
  return out;
}
