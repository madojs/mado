/**
 * Deal detail edit flow. Another form-heavy page, intentionally separate from
 * account detail to test repeated component/form/resource patterns.
 */

import { component, css, each, effect, html, inject, mutation, page, resource, useForm } from "madojs";
import type { Deal, DealInput } from "../lib/api.js";
import { ApiContext, ToastContext } from "../lib/services.js";
import { money } from "../lib/format.js";
import "../components/x-status-badge.js";

component(
  "x-deal-detail",
  ({ host, onDispose }) => {
    const api = inject(host, ApiContext);
    const toasts = inject(host, ToastContext);
    const id = () => Number(host.getAttribute("data-id") ?? "0");
    const deal = resource<Deal>(() => `deal:${id()}`, () => api().getDeal(id()));
    const accounts = resource(() => "accounts:deal-detail", () => api().listAccounts({ pageSize: 100 }), { staleTime: 5000 });
    const form = useForm({
      title: { required: true, minLength: 4 },
      stage: { required: true },
      priority: { required: true },
      value: { required: true, type: "number", min: 0 },
      closeDate: { required: true },
      accountId: { required: true, type: "number" },
      ownerId: { required: true, type: "number" },
      notes: { required: true, minLength: 8 },
    });

    const save = mutation<Partial<DealInput>, Deal>(
      (patch) => api().updateDeal(id(), patch),
      { invalidates: ["deals*", "account:*", "/api/stats", "/api/activity*"] },
    );

    let seededFor = 0;
    const stopSeed = effect(() => {
      const current = deal.data();
      if (!current) return;
      if (seededFor === current.id) return;
      form.setField("title", current.title);
      form.setField("stage", current.stage);
      form.setField("priority", current.priority);
      form.setField("value", current.value);
      form.setField("closeDate", current.closeDate);
      form.setField("accountId", current.accountId);
      form.setField("ownerId", current.ownerId);
      form.setField("notes", current.notes);
      seededFor = current.id;
    });
    onDispose(stopSeed);

    const accountName = (accountId: number) => {
      for (const account of accounts.data()?.rows ?? []) {
        if (account.id === accountId) return account.name;
      }
      return `Account #${accountId}`;
    };

    const onSubmit = form.onSubmit(async (values) => {
      try {
        const updated = await save.run({
          title: values.title as string,
          stage: values.stage as DealInput["stage"],
          priority: values.priority as DealInput["priority"],
          value: Number(values.value),
          closeDate: values.closeDate as string,
          accountId: Number(values.accountId),
          ownerId: Number(values.ownerId),
          notes: values.notes as string,
        });
        deal.mutate(updated);
        toasts().push("success", "Deal updated.");
      } catch {
        toasts().push("error", "Deal update failed.");
      }
    });

    return () => html`
      <p><a href="/app/deals" data-link>Back to deals</a></p>
      ${() => {
        if (deal.loading() && !deal.data()) return html`<p class="muted">Loading deal…</p>`;
        if (deal.error()) return html`<p class="err">${deal.error()!.message}</p>`;
        const current = deal.data();
        if (!current) return null;

        return html`
          <header class="page-head">
            <div>
              <h1>${current.title}</h1>
              <p>${() => accountName(current.accountId)} · ${money(current.value)}</p>
            </div>
            <x-status-badge tone=${current.stage}>${current.stage}</x-status-badge>
          </header>

          <form class="card" @submit=${onSubmit} novalidate>
            <div class="form-grid">
              <label class="form-row full">Title<input name="title" .value=${() => String(form.values().title ?? "")} @input=${form.onInput} @blur=${form.onBlur} /></label>
              <label class="form-row">Account<select name="accountId" .value=${() => String(form.values().accountId ?? current.accountId)} @change=${form.onInput} @blur=${form.onBlur}>
                ${() =>
                  each(
                    accounts.data()?.rows ?? [],
                    (account) => account.id,
                    (account) => html`<option value=${String(account.id)}>${account.name}</option>`,
                  )}
              </select></label>
              <label class="form-row">Stage<select name="stage" .value=${() => String(form.values().stage ?? current.stage)} @change=${form.onInput} @blur=${form.onBlur}>
                <option value="new">new</option><option value="qualified">qualified</option><option value="proposal">proposal</option><option value="won">won</option><option value="lost">lost</option>
              </select></label>
              <label class="form-row">Priority<select name="priority" .value=${() => String(form.values().priority ?? current.priority)} @change=${form.onInput} @blur=${form.onBlur}>
                <option value="low">low</option><option value="normal">normal</option><option value="high">high</option>
              </select></label>
              <label class="form-row">Value<input name="value" type="number" .value=${() => String(form.values().value ?? current.value)} @input=${form.onInput} @blur=${form.onBlur} /></label>
              <label class="form-row">Close date<input name="closeDate" .value=${() => String(form.values().closeDate ?? current.closeDate)} @input=${form.onInput} @blur=${form.onBlur} /></label>
              <label class="form-row full">Notes<textarea name="notes" .value=${() => String(form.values().notes ?? current.notes)} @input=${form.onInput} @blur=${form.onBlur}></textarea></label>
            </div>

            ${() => save.error() ? html`<p class="err">${save.error()!.message}</p>` : null}
            <div class="actions">
              <button class="btn btn-primary" type="submit" ?disabled=${() => !form.isValid() || save.loading()}>
                ${() => save.loading() ? "Saving…" : "Save deal"}
              </button>
              <a class="btn" href="/app/deals" data-link>Cancel</a>
            </div>
          </form>
        `;
      }}
    `;
  },
  {
    shadow: false,
    styles: css`
      x-deal-detail { display: block; max-width: 820px; }
      .card {
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

export default page<{ id: string }>({
  title: ({ id }) => `Deal #${id}`,
  view: ({ params }) => html`<x-deal-detail data-id=${params.id}></x-deal-detail>`,
});
