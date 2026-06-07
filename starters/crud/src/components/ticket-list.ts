import { component, computed, each, html, queryParam, resource } from "@madojs/mado";
import { api, type Ticket } from "../lib/api.js";

component("ticket-list", () => {
  const search = queryParam("search", "");
  const status = queryParam("status", "all");
  const tickets = resource(
    () => `tickets?search=${search()}&status=${status()}`,
    () => api.listTickets({ search: search(), status: status() }),
  );
  const openCount = computed(() => (tickets.data() ?? []).filter((ticket) => ticket.status === "open").length);

  const row = (ticket: Ticket) => html`
    <tr>
      <td><a href=${`/tickets/${ticket.id}`} data-link>${ticket.title}</a></td>
      <td>${ticket.customer}</td>
      <td><span class=${`badge ${ticket.status}`}>${ticket.status}</span></td>
      <td>${ticket.priority}</td>
    </tr>
  `;

  return () => html`
    <section class="page">
      <div class="toolbar">
        <div>
          <h1>Tickets</h1>
          <p>${() => openCount()} open tickets</p>
        </div>
        <a class="button" href="/tickets/new" data-link>New ticket</a>
      </div>

      <div class="filters">
        <input
          type="search"
          placeholder="Search tickets"
          .value=${search}
          @input=${(event: Event) => search.set((event.target as HTMLInputElement).value)}
        >
        <select
          .value=${status}
          @change=${(event: Event) => status.set((event.target as HTMLSelectElement).value)}
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      ${() => tickets.loading()
        ? html`<p>Loading...</p>`
        : tickets.error()
          ? html`<p class="error">${tickets.error()?.message}</p>`
          : html`
              <table>
                <thead>
                  <tr><th>Title</th><th>Customer</th><th>Status</th><th>Priority</th></tr>
                </thead>
                <tbody>
                  ${each(tickets.data() ?? [], (ticket) => ticket.id, row)}
                </tbody>
              </table>
            `}
    </section>
  `;
}, { shadow: false });
