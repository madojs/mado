// Centered card layout for auth pages (login, signup, password reset).
// Identical shape to layouts/app.ts but a different shell.

import { component, css, html, page } from "@madojs/mado";

component(
  "x-auth-shell",
  () => () => html`
    <main>
      <div class="card">
        <slot></slot>
      </div>
    </main>
  `,
  {
    styles: css`
      :host {
        display: block;
        min-height: 100vh;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: var(--space-5);
      }
      .card {
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-1);
        padding: var(--space-6);
        width: min(360px, 100%);
      }
    `,
  },
);

export default page({
  view: ({ child }) => html`<x-auth-shell>${child}</x-auth-shell>`,
});