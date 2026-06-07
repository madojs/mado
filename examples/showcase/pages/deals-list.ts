/**
 * Deals pipeline: local UI mode, computed totals and nested keyed lists.
 */

import { component, computed, css, each, html, inject, page, resource, signal } from "@madojs/mado";
import type { Deal, DealStage } from "../lib/api.js";
import { ApiContext } from "../lib/services.js";
import { money } from "../lib/format.js";
import "../components/x-data-table.js";
import "../components/x-empty-state.js";
import "../components/x-status-badge.js";

const stages: DealStage[] = ["new", "qualified", "proposal", "won", "lost"];

component(
  "x-deals-list",
  ({ host }) => {
    const api = inject(host, ApiContext);
    const mode = signal<"table" | "board">("board");
    const deals = resource(() => "deals", () => api().listDeals(), { staleTime: 3000 });
    const accounts = resource(() => "accounts:deal-names", () => api().listAccounts({ pageSize: 100 }), { staleTime: 5000 });

    const rows = computed(() => deals.data() ?? []);
    const openTotal = computed(() => {
      let sum = 0;
      for (const deal of rows()) {
        if (deal.stage !== "won" && deal.stage !== "lost") sum += deal.value;
      }
      return sum;
    });

    const accountName = (id: number) => {
      for (const account of accounts.data()?.rows ?? []) {
        if (account.id === id) return account.name;
      }
      return `Account #${id}`;
    };
    const stageRows = (stage: DealStage): Deal[] => {
      const out: Deal[] = [];
      for (const deal of rows()) if (deal.stage === stage) out.push(deal);
      return out;
    };
    const stageTotal = (stage: DealStage): number => {
      let sum = 0;
      for (const deal of stageRows(stage)) sum += deal.value;
      return sum;
    };

    return () => html`
      <header class="page-head">
        <div>
          <h1>Deals</h1>
          <p>Pipeline view switches between table and board without changing route state.</p>
        </div>
        <div class="segmented">
          <button type="button" class=${() => mode() === "board" ? "active" : ""} @click=${() => mode.set("board")}>Board</button>
          <button type="button" class=${() => mode() === "table" ? "active" : ""} @click=${() => mode.set("table")}>Table</button>
        </div>
      </header>

      <div class="metric-grid compact">
        <x-status-badge tone="proposal">Open pipeline ${() => money(openTotal())}</x-status-badge>
        <x-status-badge tone="won">Won ${() => money(stageTotal("won"))}</x-status-badge>
      </div>

      ${() => {
        if (deals.loading() && rows().length === 0) return html`<p class="muted">Loading deals…</p>`;
        if (deals.error()) return html`<p class="err">${deals.error()!.message}</p>`;
        if (rows().length === 0) return html`<x-empty-state>No deals yet.</x-empty-state>`;
        return mode() === "board" ? renderBoard() : renderTable();
      }}
    `;

    function renderTable() {
      return html`
        <x-data-table>
          <table>
            <thead>
              <tr><th>Deal</th><th>Account</th><th>Stage</th><th>Priority</th><th>Value</th><th>Close</th><th></th></tr>
            </thead>
            <tbody>
              ${each(rows(), (deal) => deal.id, (deal) => html`
                <tr>
                  <td><strong>${deal.title}</strong></td>
                  <td class="muted">${() => accountName(deal.accountId)}</td>
                  <td><x-status-badge tone=${deal.stage}>${deal.stage}</x-status-badge></td>
                  <td><x-status-badge tone=${deal.priority}>${deal.priority}</x-status-badge></td>
                  <td>${money(deal.value)}</td>
                  <td class="muted">${deal.closeDate}</td>
                  <td><a href="/app/deals/${deal.id}" data-link>Open</a></td>
                </tr>
              `)}
            </tbody>
          </table>
        </x-data-table>
      `;
    }

    function renderBoard() {
      return html`
        <div class="board">
          ${each(stages, (stage) => stage, (stage) => html`
            <section class="column">
              <header>
                <strong>${stage}</strong>
                <span>${money(stageTotal(stage))}</span>
              </header>
              <div class="cards">
                ${each(stageRows(stage), (deal) => deal.id, (deal) => html`
                  <a class="deal-card" href="/app/deals/${deal.id}" data-link>
                    <strong>${deal.title}</strong>
                    <span>${() => accountName(deal.accountId)}</span>
                    <b>${money(deal.value)}</b>
                    <x-status-badge tone=${deal.priority}>${deal.priority}</x-status-badge>
                  </a>
                `)}
              </div>
            </section>
          `)}
        </div>
      `;
    }
  },
  {
    shadow: false,
    styles: css`
      x-deals-list { display: block; }
      .segmented {
        display: inline-flex;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .segmented button {
        border: 0;
        min-height: 2.25rem;
        padding: 0.45rem 0.8rem;
        background: var(--bg);
        color: var(--fg-muted);
        font: inherit;
        cursor: pointer;
      }
      .segmented button.active {
        background: var(--accent);
        color: white;
      }
      .compact {
        grid-template-columns: repeat(2, max-content);
        margin-bottom: 1rem;
      }
      .board {
        display: grid;
        grid-template-columns: repeat(5, minmax(190px, 1fr));
        gap: 0.75rem;
        overflow-x: auto;
      }
      .column {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg-alt);
        min-height: 340px;
      }
      .column header {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.75rem;
        border-bottom: 1px solid var(--border);
      }
      .column header span {
        color: var(--fg-muted);
        font-size: 0.85rem;
      }
      .cards {
        display: grid;
        gap: 0.55rem;
        padding: 0.65rem;
      }
      .deal-card {
        display: grid;
        gap: 0.25rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        color: var(--fg);
        padding: 0.75rem;
      }
      .deal-card:hover {
        text-decoration: none;
        border-color: var(--accent);
      }
      .deal-card span {
        color: var(--fg-muted);
        font-size: 0.85rem;
      }
    `,
  },
);

export default page({
  title: "Deals",
  view: () => html`<x-deals-list></x-deals-list>`,
});
