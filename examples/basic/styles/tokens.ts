/**
 * App design tokens. One file is the single source of truth for colors,
 * spacing, radii, fonts and theme variables.
 *
 * Usage:
 *   1. main.ts installs the sheet through document.adoptedStyleSheets.
 *   2. Components use var(--color-bg), var(--space-3), etc. without imports:
 *      CSS variables inherit through Shadow DOM.
 *
 * Theme switching uses data-theme on :root (see lib/theme.ts).
 */

import { css } from "@madojs/mado";

export const tokens = css`
  :root {
    /* Colors: light */
    --color-bg: #fff;
    --color-fg: #111;
    --color-muted: #666;
    --color-border: #ddd;
    --color-accent: #06f;
    --color-error: #c00;
    --color-success: #060;

    /* Spacing (4-step scale) */
    --space-1: .25rem;
    --space-2: .5rem;
    --space-3: 1rem;
    --space-4: 1.5rem;
    --space-5: 2rem;

    /* Radii */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;

    /* Typography */
    --font-sans: system-ui, sans-serif;
    --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
    --font-size: 16px;
    --line-height: 1.5;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
    --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  }

  :root[data-theme='dark'] {
    --color-bg: #181818;
    --color-fg: #eee;
    --color-muted: #999;
    --color-border: #333;
    --color-accent: #f80;
    --color-error: #f44;
    --color-success: #6c6;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
    --shadow-md: 0 4px 12px rgba(0,0,0,.5);
  }
`;
