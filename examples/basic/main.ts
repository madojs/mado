/**
 * main.ts: app entry point. It does exactly three things:
 *   1. provides contexts (theme, etc.);
 *   2. wires the root layout (nav + outlet);
 *   3. mounts <x-app> into #app.
 *
 * Everything else lives in routes.ts and pages/.
 */

import { component, html, render, css, provide } from "@madojs/mado";
import route from "./routes.js";
import { ThemeCtx, applyTheme, type Theme } from "./lib/theme.js";
import { tokens } from "./styles/tokens.js";
import "./components/theme-toggle.js";

// Global design tokens: one sheet for the whole document.
// Light DOM inherits var(--*) automatically; Shadow DOM also sees CSS custom
// properties because they are inherited by default.
document.adoptedStyleSheets = [...document.adoptedStyleSheets, tokens];

// Root component: theme provider + nav + router outlet.
component(
  "x-app",
  ({ host }) => {
    // Use the system preference as the initial value.
    const initial: Theme = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    applyTheme(initial);
    provide(host, ThemeCtx, initial);

    return () => html`
      <nav>
        <a href="/" data-link>home</a> · <a href="/posts" data-link>posts</a> ·
        <a href="/contact" data-link>contact</a> ·
        <a href="/about" data-link>about</a> ·
        <x-theme-toggle></x-theme-toggle>
      </nav>
      <main>${route.view}</main>
    `;
  },
  {
    styles: css`
      :host {
        display: block;
      }
      nav {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      main {
        display: block;
      }
    `,
  },
);

const root = document.querySelector("#app");
if (!root) throw new Error("#app not found");
render(html`<x-app></x-app>`, root);
