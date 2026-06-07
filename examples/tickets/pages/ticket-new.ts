/**
 * Ticket creation form using useForm() and mutation().
 */

import { component, css, html, mutation, navigate, page, useForm } from "@madojs/mado";
import { api, type TicketInput } from "../lib/api.js";
import "../components/x-shell.js";

component("x-ticket-new", () => {
  const form = useForm({
    title: { required: true, minLength: 4 },
    requester: { required: true, type: "email" },
    status: { required: true, default: "open" },
    priority: { required: true, default: "normal" },
    description: { required: true, minLength: 8 },
  });

  const create = mutation<TicketInput, { id: number }>(
    (input) => api.createTicket(input),
    { invalidates: ["tickets*", "ticket-stats"] },
  );

  return () => html`
    <x-ticket-shell>
      <p class="backlink"><a href="/tickets" data-link>Back to tickets</a></p>
      <div class="page-head">
        <div>
          <h2>New ticket</h2>
          <p class="muted">Create a ticket and return to the detail view.</p>
        </div>
      </div>

      <form
        @submit=${form.onSubmit(async (values) => {
          try {
            const ticket = await create.run({
              title: values.title as string,
              requester: values.requester as string,
              status: (values.status as TicketInput["status"]) ?? "open",
              priority: (values.priority as TicketInput["priority"]) ?? "normal",
              description: values.description as string,
            });
            navigate(`/tickets/${ticket.id}`);
          } catch (err) {
            alert((err as Error).message);
          }
        })}
      >
        <label>
          Title
          <input name="title" @input=${form.onInput} @blur=${form.onBlur} />
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
            <select name="status" @input=${form.onInput} @blur=${form.onBlur}>
              <option value="open">open</option>
              <option value="pending">pending</option>
              <option value="closed">closed</option>
            </select>
          </label>
          <label>
            Priority
            <select name="priority" @input=${form.onInput} @blur=${form.onBlur}>
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
            ?disabled=${() => !form.isValid() || form.submitting() || create.loading()}
          >
            ${() => (form.submitting() || create.loading() ? "Creating..." : "Create")}
          </button>
          <a href="/tickets" data-link>
            <button type="button" class="ghost">Cancel</button>
          </a>
        </div>
      </form>

    </x-ticket-shell>
  `;
}, {
  styles: css`
    .backlink {
      margin-bottom: 1rem;
    }
    .page-head {
      margin-bottom: 1rem;
    }
    form {
      display: grid;
      gap: 1rem;
      max-width: 680px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.1rem;
      box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
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
      gap: .6rem;
      align-items: center;
    }
    .actions a { text-decoration: none; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
    }
  `,
});

export default page({
  title: "New ticket",
  view: () => html`<x-ticket-new></x-ticket-new>`,
});
