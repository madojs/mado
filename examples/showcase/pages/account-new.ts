/**
 * Account creation flow: useForm + mutation + invalidates + navigate.
 */

import { component, css, html, inject, mutation, navigate, page, useForm } from "madojs";
import { ApiContext, ToastContext } from "../lib/services.js";
import type { Account, AccountInput } from "../lib/api.js";

component(
  "x-account-new",
  ({ host }) => {
    const api = inject(host, ApiContext);
    const toasts = inject(host, ToastContext);
    const form = useForm({
      name: { required: true, minLength: 3 },
      domain: { required: true, minLength: 5 },
      status: { required: true, default: "lead" },
      plan: { required: true, default: "growth" },
      mrr: { required: true, type: "number", min: 0, default: 1200 },
      ownerId: { required: true, type: "number", default: 1 },
      notes: { required: true, minLength: 8 },
    });

    const create = mutation<AccountInput, Account>(
      (input) => api().createAccount(input),
      { invalidates: ["accounts*", "/api/stats", "/api/activity*"] },
    );

    const onSubmit = form.onSubmit(async (values) => {
      try {
        const account = await create.run({
          name: values.name as string,
          domain: values.domain as string,
          status: values.status as AccountInput["status"],
          plan: values.plan as AccountInput["plan"],
          mrr: Number(values.mrr),
          ownerId: Number(values.ownerId),
          notes: values.notes as string,
        });
        toasts().push("success", `Created ${account.name}`);
        navigate(`/app/accounts/${account.id}`);
      } catch {
        toasts().push("error", "Account create failed.");
      }
    });

    return () => html`
      <p><a href="/app/accounts" data-link>Back to accounts</a></p>
      <header class="page-head">
        <div>
          <h1>New account</h1>
          <p>Create an account, seed a primary contact and open the detail workflow.</p>
        </div>
      </header>

      <form class="card-form" @submit=${onSubmit} novalidate>
        <div class="form-grid">
          <label class="form-row">
            Account name
            <input name="name" @input=${form.onInput} @blur=${form.onBlur} />
            ${() => form.touched().name && form.errors().name ? html`<small class="err">${form.errors().name}</small>` : null}
          </label>
          <label class="form-row">
            Domain
            <input name="domain" placeholder="company.example" @input=${form.onInput} @blur=${form.onBlur} />
            ${() => form.touched().domain && form.errors().domain ? html`<small class="err">${form.errors().domain}</small>` : null}
          </label>
          <label class="form-row">
            Status
            <select name="status" .value=${() => String(form.values().status ?? "lead")} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="lead">lead</option>
              <option value="active">active</option>
              <option value="at-risk">at-risk</option>
            </select>
          </label>
          <label class="form-row">
            Plan
            <select name="plan" .value=${() => String(form.values().plan ?? "growth")} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="starter">starter</option>
              <option value="growth">growth</option>
              <option value="enterprise">enterprise</option>
            </select>
          </label>
          <label class="form-row">
            MRR
            <input name="mrr" type="number" .value=${() => String(form.values().mrr ?? 1200)} @input=${form.onInput} @blur=${form.onBlur} />
          </label>
          <label class="form-row">
            Owner
            <select name="ownerId" .value=${() => String(form.values().ownerId ?? 1)} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="1">Anna Ivanova</option>
              <option value="2">Boris Petrov</option>
              <option value="3">Victoria Kuznetsova</option>
            </select>
          </label>
          <label class="form-row full">
            Notes
            <textarea name="notes" @input=${form.onInput} @blur=${form.onBlur}></textarea>
            ${() => form.touched().notes && form.errors().notes ? html`<small class="err">${form.errors().notes}</small>` : null}
          </label>
        </div>

        ${() => create.error() ? html`<p class="err">${create.error()!.message}</p>` : null}

        <div class="actions">
          <button class="btn btn-primary" type="submit" ?disabled=${() => !form.isValid() || form.submitting() || create.loading()}>
            ${() => create.loading() ? "Creating…" : "Create account"}
          </button>
          <a class="btn" href="/app/accounts" data-link>Cancel</a>
        </div>
      </form>
    `;
  },
  {
    shadow: false,
    styles: css`
      x-account-new { display: block; max-width: 780px; }
      .card-form {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        padding: 1rem;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
      }
    `,
  },
);

export default page({
  title: "New account",
  view: () => html`<x-account-new></x-account-new>`,
});
