/**
 * <x-theme-toggle>: theme switcher.
 * Uses inject() to read the theme signal from context.
 */

import { component, html, css, inject } from "@madojs/mado";
import { ThemeCtx, applyTheme, type Theme } from "../lib/theme.js";

component(
  "x-theme-toggle",
  ({ host }) => {
    const theme = inject(host, ThemeCtx);

    const toggle = () => {
      const next: Theme = theme() === "dark" ? "light" : "dark";
      theme.set(next);
      applyTheme(next);
    };

    return () => html` <button @click=${toggle}>theme: ${theme}</button> `;
  },
  {
    styles: css`
      button {
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: transparent;
        color: inherit;
        cursor: pointer;
        border-radius: 4px;
      }
    `,
  },
);
