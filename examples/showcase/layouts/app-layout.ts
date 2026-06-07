/**
 * CRM admin layout. Shadow DOM on purpose: this component owns the shell grid
 * and uses a real slot to project route pages into the content area. The page
 * hosts themselves stay Light DOM, so global table/form utilities still apply.
 */

import { component, css, effect, html, navigate, page } from "madojs";
import { currentUser, logout } from "../lib/auth.js";

component(
  "x-app-layout",
  ({ onDispose }) => {
    const stop = effect(() => {
      const user = currentUser();
      const path = location.pathname;
      if (!user && path.startsWith("/app/") && path !== "/app/login") {
        navigate("/app/login", { replace: true });
      }
    });
    onDispose(stop);

    const onLogout = async () => {
      await logout();
      navigate("/");
    };

    return () => html`
      <div class="crm-shell">
        <aside class="crm-sidebar">
          <a class="crm-brand" href="/app/dashboard" data-link>
            <strong>planCRM</strong>
            <span>showcase max</span>
          </a>
          <nav>
            <a href="/app/dashboard" data-link>Dashboard</a>
            <a href="/app/accounts" data-link>Accounts</a>
            <a href="/app/deals" data-link>Deals</a>
            <a href="/app/settings" data-link>Settings</a>
          </nav>
          <div class="crm-user">
            ${() => {
              const user = currentUser();
              if (!user) return html`<span class="muted">Checking session…</span>`;
              return html`
                <strong>${user.name}</strong>
                <span>${user.email}</span>
                <button class="btn" type="button" @click=${onLogout}>Logout</button>
              `;
            }}
          </div>
        </aside>
        <section class="crm-content">
          <slot></slot>
        </section>
      </div>
    `;
  },
  {
    styles: css`
      :host { display: block; }
      .crm-shell {
        display: grid;
        grid-template-columns: 232px minmax(0, 1fr);
        min-height: calc(100vh - 57px);
      }
      .crm-sidebar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        border-right: 1px solid var(--border);
        background: var(--bg-alt);
        padding: 1rem;
      }
      .crm-brand {
        display: grid;
        gap: 0.1rem;
        color: var(--fg);
        text-decoration: none;
      }
      .crm-brand span {
        color: var(--fg-muted);
        font-size: 0.78rem;
      }
      nav {
        display: grid;
        gap: 0.25rem;
        flex: 1;
        align-content: start;
      }
      nav a {
        display: block;
        padding: 0.55rem 0.65rem;
        border-radius: var(--radius);
        color: var(--fg);
      }
      nav a:hover {
        background: var(--bg);
        text-decoration: none;
      }
      .crm-user {
        display: grid;
        gap: 0.25rem;
        border-top: 1px solid var(--border);
        padding-top: 0.85rem;
        font-size: 0.86rem;
      }
      .crm-user span,
      .muted {
        color: var(--fg-muted);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.25rem;
        padding: 0.5rem 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--fg);
        font: inherit;
        cursor: pointer;
      }
      .btn:hover {
        background: #eef2f7;
      }
      .crm-content {
        min-width: 0;
        padding: 1.25rem;
        background: #fbfcfe;
      }
      @media (max-width: 820px) {
        .crm-shell { grid-template-columns: 1fr; }
        .crm-sidebar { position: static; }
        nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
    `,
  },
);

export default page({
  view: ({ child }) => html`<x-app-layout>${child}</x-app-layout>`,
});
