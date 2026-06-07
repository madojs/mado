import { component, html, mutation, navigate, useForm } from "@madojs/mado";
import { api, type TicketInput } from "../lib/api.js";

component("ticket-form", () => {
  const form = useForm({
    title: { required: true, default: "" },
    customer: { required: true, default: "" },
    status: { required: true, default: "open" },
    priority: { required: true, default: "normal" },
    notes: { default: "" },
  });

  const createTicket = mutation(
    (input: TicketInput) => api.createTicket(input),
    { invalidates: ["tickets*"] },
  );

  const submit = form.onSubmit(async (values) => {
    const ticket = await createTicket.run(values as TicketInput);
    navigate(`/tickets/${ticket.id}`);
  });

  return () => html`
    <section class="page narrow">
      <h1>New ticket</h1>
      <form @submit=${submit}>
        <label>
          Title
          <input name="title" @input=${form.onInput} @blur=${form.onBlur}>
          ${() => form.touched().title && form.errors().title ? html`<small>${form.errors().title}</small>` : null}
        </label>

        <label>
          Customer
          <input name="customer" @input=${form.onInput} @blur=${form.onBlur}>
          ${() => form.touched().customer && form.errors().customer ? html`<small>${form.errors().customer}</small>` : null}
        </label>

        <label>
          Status
          <select name="status" @input=${form.onInput} @blur=${form.onBlur}>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label>
          Priority
          <select name="priority" @input=${form.onInput} @blur=${form.onBlur}>
            <option value="low">Low</option>
            <option value="normal" selected>Normal</option>
            <option value="high">High</option>
          </select>
        </label>

        <label>
          Notes
          <textarea name="notes" rows="4" @input=${form.onInput}></textarea>
        </label>

        <div class="actions">
          <a href="/tickets" data-link>Cancel</a>
          <button ?disabled=${() => !form.isValid() || form.submitting()}>Create ticket</button>
        </div>
      </form>
    </section>
  `;
}, { shadow: false });
