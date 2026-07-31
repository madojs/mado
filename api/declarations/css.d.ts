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
export declare function css(strings: TemplateStringsArray, ...values: unknown[]): CSSResult;
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
export declare function cssVars(vars: Record<string, string | number>): string;
/**
 * Apply sheets to a ShadowRoot. Idempotent: the same sheet
 * can be adopted into dozens of components without duplicating styles.
 */
export declare function adopt(root: ShadowRoot, ...sheets: CSSResult[]): void;
/**
 * Build scoped style text limited to a selector (for light DOM).
 * Uses native @scope if the browser supports it.
 * Otherwise — naive selector prefixing.
 *
 *   scopeStyles('x-button', 'button { color: red }')
 *     → '@scope (x-button) { button { color: red } }'  // or
 *     → 'x-button button { color: red }'
 */
export declare function scopeStyles(tagName: string, sheet: CSSResult): CSSResult;
