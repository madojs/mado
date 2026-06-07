/**
 * Overview page.
 * Resource is created inside component setup, so cleanup follows the component.
 */

import { component, css, each, html, page, resource } from "madojs";
import { api } from "../lib/api.js";
import "../components/x-ticket-badge.js";
import "../components/x-ticket-metric.js";
import "../components/x-shell.js";

component("x-ticket-home", () => {
  const stats = resource(() => "ticket-stats", () => api.stats(), {
    staleTime: 30_000,
  });
  const recent = resource(() => "tickets:recent", () => api.listTickets(), {
    staleTime: 30_000,
  });

  return () => html`
    <x-ticket-shell>
      <section class="page-head">
        <div>
          <h2>Ticket admin, no build pipeline</h2>
          <p class="muted">
            A small CRUD app made to test whether a fresh LLM can write
            idiomatic Mado from docs and examples alone.
          </p>
        </div>
        <a href="/tickets/new" data-link>
          <button>New ticket</button>
        </a>
      </section>

      <div class="cards">
        ${() => {
          const s = stats.data();
          if (stats.loading() && !s) return html`<p class="muted">Loading stats...</p>`;
          if (stats.error()) return html`<p class="err">${stats.error()!.message}</p>`;
          if (!s) return null;
          return html`
            <x-ticket-metric>
              <span slot="label">Total</span>
              <span slot="value">${s.total}</span>
              <span slot="hint">all tickets</span>
            </x-ticket-metric>
            <x-ticket-metric tone="open">
              <span slot="label">Open</span>
              <span slot="value">${s.open}</span>
              <span slot="hint">needs owner</span>
            </x-ticket-metric>
            <x-ticket-metric tone="pending">
              <span slot="label">Pending</span>
              <span slot="value">${s.pending}</span>
              <span slot="hint">waiting</span>
            </x-ticket-metric>
            <x-ticket-metric tone="high">
              <span slot="label">High priority</span>
              <span slot="value">${s.high}</span>
              <span slot="hint">watch closely</span>
            </x-ticket-metric>
          `;
        }}
      </div>

      <section class="work-panel">
        <div class="section-head">
          <h3>Recent tickets</h3>
          <a href="/tickets" data-link>See all</a>
        </div>
        ${() => {
          const list = recent.data();
          if (recent.loading() && !list) return html`<p class="muted">Loading...</p>`;
          if (recent.error())
            return html`
              <p class="err">
                ${recent.error()!.message}
                <button class="ghost" @click=${() => recent.refresh()}>Retry</button>
              </p>
            `;
          if (!list || list.length === 0) return html`<p class="muted">No tickets yet.</p>`;
          return html`
            <ul class="recent">
              ${each(
                list.slice(0, 5),
                (t) => t.id,
                (t) => html`
                  <li>
                    <span>
                      <a href="/tickets/${t.id}" data-link>#${t.id} ${t.title}</a>
                      <small class="muted">${t.requester}</small>
                    </span>
                    <x-ticket-badge tone=${t.status}>${t.status}</x-ticket-badge>
                  </li>
                `,
              )}
            </ul>
          `;
        }}
      </section>

    </x-ticket-shell>
  `;
}, {
  styles: css`
    .page-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    .page-head a { text-decoration: none; }
    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .work-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: .75rem;
    }
    .recent {
      list-style: none;
      display: grid;
      padding: 0;
      margin: 0;
    }
    .recent li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: .75rem 0;
      border-bottom: 1px solid var(--border);
    }
    .recent span:first-child {
      display: grid;
      min-width: 0;
    }
    .recent small {
      margin-top: .15rem;
    }
    .recent li:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    @media (max-width: 920px) {
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .page-head {
        flex-direction: column;
      }
      .cards { grid-template-columns: 1fr; }
    }
  `,
});

export default page({
  title: "Overview",
  view: () => html`<x-ticket-home></x-ticket-home>`,
});
