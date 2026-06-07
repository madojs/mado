import { component, html, resource } from "@madojs/mado";
import { api } from "../lib/api.js";

component("ticket-detail", ({ host }) => {
  const id = () => host.getAttribute("ticket-id") ?? "";
  const ticket = resource(
    () => `tickets/${id()}`,
    () => api.getTicket(id()),
  );

  return () => html`
    <section class="page narrow">
      ${() => ticket.loading()
        ? html`<p>Loading...</p>`
        : ticket.error()
          ? html`<p class="error">${ticket.error()?.message}</p>`
          : html`
              <a href="/tickets" data-link>Back to tickets</a>
              <h1>${ticket.data()?.title}</h1>
              <dl>
                <dt>Customer</dt>
                <dd>${ticket.data()?.customer}</dd>
                <dt>Status</dt>
                <dd><span class=${`badge ${ticket.data()?.status}`}>${ticket.data()?.status}</span></dd>
                <dt>Priority</dt>
                <dd>${ticket.data()?.priority}</dd>
                <dt>Notes</dt>
                <dd>${ticket.data()?.notes}</dd>
              </dl>
            `}
    </section>
  `;
}, { shadow: false });
