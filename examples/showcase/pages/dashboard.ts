/**
 * CRM dashboard: resources, derived metrics and nested reusable components.
 */

import { component, computed, css, each, html, inject, page, resource } from "madojs";
import { ApiContext } from "../lib/services.js";
import { money } from "../lib/format.js";
import "../components/x-stat-card.js";
import "../components/x-status-badge.js";
import "../components/x-empty-state.js";

component(
  "x-dashboard",
  ({ host }) => {
    const api = inject(host, ApiContext);
    const stats = resource(() => "/api/stats", () => api().stats(), { staleTime: 5000 });
    const activity = resource(() => "/api/activity/recent", () => api().recentActivity(), { staleTime: 5000 });
    const pipelineValue = computed(() => stats.data()?.pipeline ?? 0);

    return () => html`
      <header class="page-head">
        <div>
          <h1>CRM Dashboard</h1>
          <p>One app exercising resources, nested routes, context, forms and keyed rendering.</p>
        </div>
        <a class="btn btn-primary" href="/app/accounts/new" data-link>New account</a>
      </header>

      ${() => {
        if (stats.loading() && !stats.data()) return html`<p class="muted">Loading dashboard…</p>`;
        if (stats.error()) return html`<p class="err">${stats.error()!.message}</p>`;
        const s = stats.data();
        if (!s) return null;
        return html`
          <div class="metric-grid">
            <x-stat-card>
              <span slot="label">Accounts</span>
              ${s.accounts}
            </x-stat-card>
            <x-stat-card>
              <span slot="label">Active</span>
              ${s.activeAccounts}
            </x-stat-card>
            <x-stat-card>
              <span slot="label">Pipeline</span>
              ${() => money(pipelineValue())}
            </x-stat-card>
            <x-stat-card>
              <span slot="label">At risk</span>
              ${s.atRisk}
            </x-stat-card>
          </div>
        `;
      }}

      <section class="panel">
        <div class="panel-head">
          <h2>Recent activity</h2>
          <a href="/app/accounts" data-link>Open accounts</a>
        </div>
        ${() => {
          const rows = activity.data() ?? [];
          if (activity.loading() && rows.length === 0) return html`<p class="muted">Loading activity…</p>`;
          if (activity.error()) return html`<p class="err">${activity.error()!.message}</p>`;
          if (rows.length === 0) {
            return html`<x-empty-state><span slot="title">No activity</span>CRM events will appear here.</x-empty-state>`;
          }
          return html`
            <ol class="activity">
              ${each(
                rows,
                (item) => item.id,
                (item) => html`
                  <li>
                    <x-status-badge tone=${item.kind}>${item.kind}</x-status-badge>
                    <span>${item.text}</span>
                    <time>${item.at}</time>
                  </li>
                `,
              )}
            </ol>
          `;
        }}
      </section>
    `;
  },
  {
    shadow: false,
    styles: css`
      x-dashboard { display: block; }
      .panel {
        margin-top: 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        padding: 1rem;
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.75rem;
      }
      .panel-head h2 {
        margin: 0;
        font-size: 1rem;
      }
      .activity {
        display: grid;
        gap: 0;
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .activity li {
        display: grid;
        grid-template-columns: 90px minmax(0, 1fr) 95px;
        gap: 0.75rem;
        align-items: center;
        padding: 0.65rem 0;
        border-bottom: 1px solid var(--border);
      }
      .activity li:last-child { border-bottom: 0; }
      time { color: var(--fg-muted); font-size: 0.85rem; text-align: right; }
    `,
  },
);

export default page({
  title: "CRM Dashboard",
  view: () => html`<x-dashboard></x-dashboard>`,
});
