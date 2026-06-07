/**
 * Ticket detail page with view/edit modes.
 * The resource and mutations live inside the component setup.
 */

import {
  component,
  css,
  html,
  mutation,
  navigate,
  page,
  resource,
  signal,
  useForm,
} from "madojs";
import { api, type Ticket, type TicketInput } from "../lib/api.js";
import "../components/x-ticket-badge.js";
import "../components/x-shell.js";

type TicketHost = HTMLElement & { ticketId?: string };

function fillForm(form: ReturnType<typeof useForm>, ticket: Ticket): void {
  form.setField("title", ticket.title);
  form.setField("requester", ticket.requester);
  form.setField("status", ticket.status);
  form.setField("priority", ticket.priority);
  form.setField("description", ticket.description);
}

component("x-ticket-detail", ({ host }) => {
  const id = Number((host as TicketHost).ticketId ?? 0);
  const editing = signal(false);

  const ticket = resource(
    () => `ticket:${id}`,
    () => api.getTicket(id),
    { staleTime: 8_000 },
  );

  const form = useForm({
    title: { required: true, minLength: 4 },
    requester: { required: true, type: "email" },
    status: { required: true },
    priority: { required: true },
    description: { required: true, minLength: 8 },
  });

  const save = mutation<TicketInput, Ticket>(
    (input) => api.updateTicket(id, input),
    { invalidates: [`ticket:${id}`, "tickets*", "ticket-stats"] },
  );

  const remove = mutation<number, void>(
    (ticketId) => api.deleteTicket(ticketId),
    { invalidates: [`ticket:${id}`, "tickets*", "ticket-stats"] },
  );

  const startEdit = (current: Ticket) => {
    fillForm(form, current);
    editing.set(true);
  };

  return () => html`
    <x-ticket-shell>
      <p class="backlink"><a href="/tickets" data-link>Back to tickets</a></p>

      ${() => {
        const current = ticket.data();
        if (ticket.loading() && !current) return html`<p class="muted">Loading...</p>`;
        if (ticket.error())
          return html`
            <p class="err">
              ${ticket.error()!.message}
              <button class="ghost" @click=${() => ticket.refresh()}>Retry</button>
            </p>
          `;
        if (!current) return null;

        if (editing()) {
          return html`
            <div class="page-head">
              <div>
                <h2>Edit ticket #${current.id}</h2>
                <p class="muted">Changes invalidate the list and this detail resource.</p>
              </div>
            </div>
            <form
              @submit=${form.onSubmit(async (values) => {
                try {
                  await save.run({
                    title: values.title as string,
                    requester: values.requester as string,
                    status: values.status as TicketInput["status"],
                    priority: values.priority as TicketInput["priority"],
                    description: values.description as string,
                  });
                  editing.set(false);
                } catch (err) {
                  alert((err as Error).message);
                }
              })}
            >
              <label>
                Title
                <input
                  name="title"
                  .value=${() => String(form.values().title ?? "")}
                  @input=${form.onInput}
                  @blur=${form.onBlur}
                />
                ${() =>
                  form.touched().title && form.errors().title
                    ? html`<small class="err">${form.errors().title}</small>`
                    : null}
              </label>

              <label>
                Requester email
                <input
                  name="requester"
                  type="email"
                  .value=${() => String(form.values().requester ?? "")}
                  @input=${form.onInput}
                  @blur=${form.onBlur}
                />
                ${() =>
                  form.touched().requester && form.errors().requester
                    ? html`<small class="err">${form.errors().requester}</small>`
                    : null}
              </label>

              <div class="grid">
                <label>
                  Status
                  <select
                    name="status"
                    .value=${() => String(form.values().status ?? "open")}
                    @input=${form.onInput}
                    @blur=${form.onBlur}
                  >
                    <option value="open">open</option>
                    <option value="pending">pending</option>
                    <option value="closed">closed</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    name="priority"
                    .value=${() => String(form.values().priority ?? "normal")}
                    @input=${form.onInput}
                    @blur=${form.onBlur}
                  >
                    <option value="low">low</option>
                    <option value="normal">normal</option>
                    <option value="high">high</option>
                  </select>
                </label>
              </div>

              <label>
                Description
                <textarea
                  name="description"
                  .value=${() => String(form.values().description ?? "")}
                  @input=${form.onInput}
                  @blur=${form.onBlur}
                ></textarea>
                ${() =>
                  form.touched().description && form.errors().description
                    ? html`<small class="err">${form.errors().description}</small>`
                    : null}
              </label>

              <div class="actions">
                <button
                  type="submit"
                  ?disabled=${() => !form.isValid() || form.submitting() || save.loading()}
                >
                  ${() => (form.submitting() || save.loading() ? "Saving..." : "Save")}
                </button>
                <button
                  type="button"
                  class="ghost"
                  @click=${() => editing.set(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          `;
        }

        return html`
          <div class="page-head">
            <div>
              <h2>${current.title}</h2>
              <p class="muted">Updated ${new Date(current.updatedAt).toLocaleString()}</p>
            </div>
            <div class="badges">
              <x-ticket-badge tone=${current.status}>${current.status}</x-ticket-badge>
              <x-ticket-badge tone=${current.priority}>${current.priority}</x-ticket-badge>
            </div>
          </div>

          <section class="detail-grid">
            <dl class="kv">
              <dt>ID</dt><dd>#${current.id}</dd>
              <dt>Requester</dt><dd>${current.requester}</dd>
              <dt>Priority</dt>
              <dd><x-ticket-badge tone=${current.priority}>${current.priority}</x-ticket-badge></dd>
              <dt>Status</dt>
              <dd><x-ticket-badge tone=${current.status}>${current.status}</x-ticket-badge></dd>
            </dl>

            <article class="panel">
              <h3>Description</h3>
              <p>${current.description}</p>
            </article>
          </section>

          <div class="actions">
            <button @click=${() => startEdit(current)}>Edit</button>
            <button
              class="ghost"
              ?disabled=${save.loading}
              @click=${async () => {
                const nextStatus = current.status === "closed" ? "open" : "closed";
                try {
                  await save.run({
                    title: current.title,
                    requester: current.requester,
                    priority: current.priority,
                    description: current.description,
                    status: nextStatus,
                  });
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              ${current.status === "closed" ? "Reopen" : "Close"}
            </button>
            <button
              class="danger"
              ?disabled=${remove.loading}
              @click=${async () => {
                if (!confirm(`Delete ticket #${current.id}?`)) return;
                try {
                  await remove.run(current.id);
                  navigate("/tickets");
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              Delete
            </button>
          </div>
        `;
      }}

    </x-ticket-shell>
  `;
}, {
  styles: css`
    .backlink {
      margin-bottom: 1rem;
    }
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: .4rem;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .kv, .panel, form {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem;
    }
    .kv {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: .45rem 1rem;
      margin: 0;
    }
    .kv dt { color: var(--fg-muted); }
    .kv dd { margin: 0; }
    .panel {
      min-width: 0;
    }
    form {
      display: grid;
      gap: 1rem;
      max-width: 680px;
    }
    label { display: grid; gap: .35rem; font-weight: 650; }
    small { font-weight: 400; }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: .6rem;
    }
    @media (max-width: 640px) {
      .page-head { flex-direction: column; }
      .badges { justify-content: flex-start; }
      .detail-grid { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
    }
  `,
});

export default page<{ id: string }>({
  title: ({ id }) => `Ticket #${id}`,
  view: ({ params }) => html`<x-ticket-detail .ticketId=${params.id}></x-ticket-detail>`,
});
