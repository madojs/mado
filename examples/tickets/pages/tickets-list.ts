/**
 * Ticket list with query params, computed derived state, mutation invalidation,
 * and keyed reconciliation through each().
 */

import {
  component,
  computed,
  css,
  each,
  html,
  mutation,
  page,
  queryParam,
  resource,
  signal,
} from "madojs";
import { api, type TicketStatus } from "../lib/api.js";
import "../components/x-ticket-badge.js";
import "../components/x-shell.js";

function readStatus(value: string): TicketStatus | "all" {
  if (value === "open" || value === "pending" || value === "closed") {
    return value;
  }
  return "all";
}

component("x-tickets-list", () => {
  const query = queryParam("q", "");
  const status = queryParam("status", "all");
  const dense = signal(false);

  const tickets = resource(
    () => `tickets?q=${encodeURIComponent(query())}&status=${status()}`,
    () =>
      api.listTickets({
        query: query(),
        status: readStatus(status()),
      }),
    { staleTime: 8_000 },
  );

  const visible = computed(() => tickets.data() ?? []);
  const openCount = computed(
    () => visible().filter((t) => t.status === "open").length,
  );

  const remove = mutation<number, void>(
    (id) => api.deleteTicket(id),
    { invalidates: ["tickets*", "ticket-stats"] },
  );

  return () => html`
    <x-ticket-shell>
      <div class="page-head">
        <div>
          <h2>Tickets</h2>
          <p class="muted">
            ${() => visible().length} shown, ${openCount} open
          </p>
        </div>
        <a href="/tickets/new" data-link>
          <button>New ticket</button>
        </a>
      </div>

      <div class="toolbar" role="search">
        <input
          type="search"
          placeholder="Search title, requester, description"
          .value=${() => query()}
          @input=${(e: Event) =>
            query.set((e.target as HTMLInputElement).value || null)}
        />
        <select
          .value=${() => status()}
          @input=${(e: Event) =>
            status.set((e.target as HTMLSelectElement).value)}
        >
          <option value="all">all statuses</option>
          <option value="open">open</option>
          <option value="pending">pending</option>
          <option value="closed">closed</option>
        </select>
        <button class="ghost" @click=${() => dense.update((v) => !v)}>
          ${() => (dense() ? "Comfort rows" : "Dense rows")}
        </button>
      </div>

      ${() => {
        const list = visible();
        if (tickets.loading() && list.length === 0)
          return html`<p class="muted">Loading tickets...</p>`;
        if (tickets.error())
          return html`
            <p class="err">
              ${tickets.error()!.message}
              <button class="ghost" @click=${() => tickets.refresh()}>Retry</button>
            </p>
          `;
        if (list.length === 0)
          return html`
            <div class="empty">
              <strong>No tickets found</strong>
              <span class="muted">Adjust the filters or create a new ticket.</span>
            </div>
          `;
        return html`
          <div class="table-wrap">
            <table class=${() => (dense() ? "dense" : "")}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Requester</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${each(
                  list,
                  (ticket) => ticket.id,
                  (ticket) => html`
                    <tr>
                      <td>#${ticket.id}</td>
                      <td>
                        <a href="/tickets/${ticket.id}" data-link>${ticket.title}</a>
                        <div class="muted small">${ticket.description}</div>
                      </td>
                      <td>${ticket.requester}</td>
                      <td>
                        <x-ticket-badge tone=${ticket.status}>${ticket.status}</x-ticket-badge>
                      </td>
                      <td>
                        <x-ticket-badge tone=${ticket.priority}>${ticket.priority}</x-ticket-badge>
                      </td>
                      <td class="row-actions">
                        <button
                          class="danger"
                          ?disabled=${remove.loading}
                          @click=${async () => {
                            if (!confirm(`Delete ticket #${ticket.id}?`)) return;
                            try {
                              await remove.run(ticket.id);
                            } catch (err) {
                              alert((err as Error).message);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        `;
      }}

    </x-ticket-shell>
  `;
}, {
  styles: css`
    .page-head, .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .page-head a { text-decoration: none; }
    .toolbar {
      justify-content: flex-start;
      flex-wrap: wrap;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: .8rem;
    }
    .toolbar input { min-width: min(360px, 100%); flex: 1; }
    .small {
      font-size: .85rem;
      margin-top: .2rem;
    }
    .table-wrap {
      overflow-x: auto;
      border-radius: var(--radius);
      box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
    }
    .row-actions {
      text-align: right;
      white-space: nowrap;
    }
    .empty {
      display: grid;
      gap: .25rem;
      padding: 2rem;
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      background: var(--panel);
      text-align: center;
    }
    table.dense th,
    table.dense td {
      padding-top: .45rem;
      padding-bottom: .45rem;
    }
    @media (max-width: 700px) {
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .toolbar input, .toolbar select, .toolbar button {
        width: 100%;
      }
    }
  `,
});

export default page({
  title: "Tickets",
  view: () => html`<x-tickets-list></x-tickets-list>`,
});
