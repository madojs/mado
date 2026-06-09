// Admin shell layout: top bar + sidebar + content slot.
//
// A layout is just a `page({ view })` whose view renders `${ctx.child}`. The
// router wraps every page in the enclosing group with this template, so the
// shell is ALWAYS the outer frame, never below the page content.
//
// Keep the shell stateless if you can. Auth/user signals belong in
// src/lib/auth.ts; the layout reads them.

import { component, css, html, navigate, page } from "@madojs/mado";
import { accessToken } from "../lib/api.js";
import { logout } from "../lib/auth.js";
import "../components/x-button.js";

component(
  "x-admin-shell",
  () => () => html`
    <header>
      <a href="/admin" data-link class="brand">__APP_NAME__</a>
      <nav>
        <a href="/admin" data-link>Dashboard</a>
        <a href="/admin/orders" data-link>Orders</a>
      </nav>
      <span class="spacer"></span>
      <span class="user">${() => maskToken(accessToken())}</span>
      <x-button
        variant="ghost"
        @click=${async () => {
          await logout();
          navigate("/login", { replace: true });
        }}
      >Sign out</x-button>
    </header>
    <aside>
      <nav>
        <a href="/admin" data-link>Overview</a>
        <a href="/admin/orders" data-link>Orders</a>
      </nav>
    </aside>
    <main>
      <slot></slot>
    </main>
  `,
  {
    styles: css`
      :host {
        display: grid;
        grid-template-columns: 220px 1fr;
        grid-template-rows: 56px 1fr;
        grid-template-areas:
          "topbar topbar"
          "side   main";
        min-height: 100vh;
      }
      header {
        grid-area: topbar;
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: 0 var(--space-5);
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
      }
      header .brand { font-weight: 700; color: var(--fg); }
      header nav { display: flex; gap: var(--space-3); }
      header nav a { color: var(--fg-muted); }
      header nav a:hover { color: var(--fg); text-decoration: none; }
      header .user { color: var(--fg-muted); font-variant-numeric: tabular-nums; }
      .spacer { flex: 1; }
      aside {
        grid-area: side;
        border-right: 1px solid var(--border);
        background: var(--bg-elevated);
        padding: var(--space-4);
      }
      aside nav { display: flex; flex-direction: column; gap: var(--space-2); }
      aside nav a {
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-sm);
        color: var(--fg-muted);
      }
      aside nav a:hover {
        background: var(--bg);
        color: var(--fg);
        text-decoration: none;
      }
      main { grid-area: main; padding: var(--space-5); }
    `,
  },
);

function maskToken(token: string | null): string {
  if (!token) return "—";
  return `signed in · …${token.slice(-4)}`;
}

export default page({
  view: ({ child }) => html`
    <x-admin-shell>${child}</x-admin-shell>
  `,
});