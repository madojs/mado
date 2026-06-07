/**
 * Account master-detail: multiple resources, edit mode, modal mutation and
 * optimistic local update via resource.mutate().
 */

import {
  component,
  computed,
  css,
  each,
  html,
  inject,
  mutation,
  page,
  resource,
  signal,
  useForm,
} from "@madojs/mado";
import type { Account, AccountInput, Deal, DealInput } from "../lib/api.js";
import { ApiContext, ToastContext } from "../lib/services.js";
import { money, percent } from "../lib/format.js";
import "../components/x-status-badge.js";
import "../components/x-empty-state.js";
import "../components/x-modal.js";

component(
  "x-account-detail",
  ({ host }) => {
    const api = inject(host, ApiContext);
    const toasts = inject(host, ToastContext);
    const id = () => Number(host.getAttribute("data-id") ?? "0");
    const editing = signal(false);
    const dealModal = signal(false);

    const account = resource<Account>(() => `account:${id()}`, () => api().getAccount(id()));
    const contacts = resource(() => `account:${id()}:contacts`, () => api().listContacts(id()));
    const deals = resource(() => `account:${id()}:deals`, () => api().listAccountDeals(id()));
    const activity = resource(() => `account:${id()}:activity`, () => api().listActivities(id()));
    const openPipeline = computed(() => {
      let sum = 0;
      for (const deal of deals.data() ?? []) {
        if (deal.stage !== "won" && deal.stage !== "lost") sum += deal.value;
      }
      return sum;
    });

    const form = useForm({
      name: { required: true },
      domain: { required: true },
      status: { required: true },
      plan: { required: true },
      mrr: { required: true, type: "number", min: 0 },
      ownerId: { required: true, type: "number" },
      notes: { required: true },
    });

    const dealForm = useForm({
      title: { required: true, minLength: 4 },
      stage: { required: true, default: "new" },
      priority: { required: true, default: "normal" },
      value: { required: true, type: "number", min: 0, default: 24000 },
      closeDate: { required: true, default: "2026-08-15" },
      ownerId: { required: true, type: "number", default: 1 },
      notes: { required: true, minLength: 8 },
    });

    const save = mutation<Partial<AccountInput>, Account>(
      (patch) => api().updateAccount(id(), patch),
      { invalidates: ["accounts*", "account:*", "/api/stats", "/api/activity*"] },
    );
    const createDeal = mutation<DealInput, Deal>(
      (input) => api().createDeal(input),
      { invalidates: ["deals*", "account:*", "/api/stats", "/api/activity*"] },
    );

    const startEdit = () => {
      const current = account.data();
      if (!current) return;
      form.reset();
      form.setField("name", current.name);
      form.setField("domain", current.domain);
      form.setField("status", current.status);
      form.setField("plan", current.plan);
      form.setField("mrr", current.mrr);
      form.setField("ownerId", current.ownerId);
      form.setField("notes", current.notes);
      editing.set(true);
    };

    const onSubmit = form.onSubmit(async (values) => {
      try {
        const updated = await save.run({
          name: values.name as string,
          domain: values.domain as string,
          status: values.status as AccountInput["status"],
          plan: values.plan as AccountInput["plan"],
          mrr: Number(values.mrr),
          ownerId: Number(values.ownerId),
          notes: values.notes as string,
        });
        account.mutate(updated);
        editing.set(false);
        toasts().push("success", "Account updated.");
      } catch {
        toasts().push("error", "Account update failed.");
      }
    });

    const onDealSubmit = dealForm.onSubmit(async (values) => {
      try {
        await createDeal.run({
          accountId: id(),
          title: values.title as string,
          stage: values.stage as DealInput["stage"],
          priority: values.priority as DealInput["priority"],
          value: Number(values.value),
          closeDate: values.closeDate as string,
          ownerId: Number(values.ownerId),
          notes: values.notes as string,
        });
        dealForm.reset();
        dealModal.set(false);
        deals.refresh();
        activity.refresh();
        toasts().push("success", "Deal created.");
      } catch {
        toasts().push("error", "Deal create failed.");
      }
    });

    return () => html`
      <p><a href="/app/accounts" data-link>Back to accounts</a></p>
      ${() => {
        if (account.loading() && !account.data()) return html`<p class="muted">Loading account…</p>`;
        if (account.error()) return html`<p class="err">${account.error()!.message}</p>`;
        const current = account.data();
        if (!current) return null;

        return html`
          <header class="page-head">
            <div>
              <h1>${current.name}</h1>
              <p>${current.domain} · ${money(current.mrr)} MRR · ${percent(current.health)} health</p>
            </div>
            <div class="actions">
              <button class="btn" type="button" @click=${startEdit}>Edit</button>
              <button class="btn btn-primary" type="button" @click=${() => dealModal.set(true)}>New deal</button>
            </div>
          </header>

          <div class="summary">
            <x-status-badge tone=${current.status}>${current.status}</x-status-badge>
            <x-status-badge tone=${current.plan}>${current.plan}</x-status-badge>
            <span>Pipeline ${() => money(openPipeline())}</span>
            <span>Last touch ${current.lastTouchAt}</span>
          </div>

          ${() => editing() ? renderEditForm() : renderOverview(current)}
          ${() => dealModal() ? renderDealModal() : null}
        `;
      }}
    `;

    function renderEditForm() {
      return html`
        <form class="card" @submit=${onSubmit} novalidate>
          <div class="form-grid">
            <label class="form-row">Name<input name="name" .value=${() => String(form.values().name ?? "")} @input=${form.onInput} @blur=${form.onBlur} /></label>
            <label class="form-row">Domain<input name="domain" .value=${() => String(form.values().domain ?? "")} @input=${form.onInput} @blur=${form.onBlur} /></label>
            <label class="form-row">Status<select name="status" .value=${() => String(form.values().status ?? "lead")} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="lead">lead</option><option value="active">active</option><option value="at-risk">at-risk</option><option value="churned">churned</option>
            </select></label>
            <label class="form-row">Plan<select name="plan" .value=${() => String(form.values().plan ?? "growth")} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="starter">starter</option><option value="growth">growth</option><option value="enterprise">enterprise</option>
            </select></label>
            <label class="form-row">MRR<input name="mrr" type="number" .value=${() => String(form.values().mrr ?? 0)} @input=${form.onInput} @blur=${form.onBlur} /></label>
            <label class="form-row">Owner<select name="ownerId" .value=${() => String(form.values().ownerId ?? 1)} @change=${form.onInput} @blur=${form.onBlur}>
              <option value="1">Anna Ivanova</option><option value="2">Boris Petrov</option><option value="3">Victoria Kuznetsova</option>
            </select></label>
            <label class="form-row full">Notes<textarea name="notes" .value=${() => String(form.values().notes ?? "")} @input=${form.onInput} @blur=${form.onBlur}></textarea></label>
          </div>
          ${() => save.error() ? html`<p class="err">${save.error()!.message}</p>` : null}
          <div class="actions">
            <button class="btn btn-primary" type="submit" ?disabled=${() => !form.isValid() || save.loading()}>${() => save.loading() ? "Saving…" : "Save"}</button>
            <button class="btn" type="button" @click=${() => editing.set(false)}>Cancel</button>
          </div>
        </form>
      `;
    }

    function renderOverview(current: Account) {
      return html`
        <section class="grid">
          <article class="card">
            <h2>Contacts</h2>
            ${() => {
              const rows = contacts.data() ?? [];
              if (contacts.loading() && rows.length === 0) return html`<p class="muted">Loading contacts…</p>`;
              if (rows.length === 0) return html`<x-empty-state>No contacts yet.</x-empty-state>`;
              return html`
                <ul class="list">
                  ${each(rows, (contact) => contact.id, (contact) => html`
                    <li>
                      <strong>${contact.name}</strong>
                      <span>${contact.title}</span>
                      <a href=${`mailto:${contact.email}`}>${contact.email}</a>
                    </li>
                  `)}
                </ul>
              `;
            }}
          </article>
          <article class="card">
            <h2>Deals</h2>
            ${() => {
              const rows = deals.data() ?? [];
              if (deals.loading() && rows.length === 0) return html`<p class="muted">Loading deals…</p>`;
              if (rows.length === 0) return html`<x-empty-state>No deals yet.</x-empty-state>`;
              return html`
                <ul class="list">
                  ${each(rows, (deal) => deal.id, (deal) => html`
                    <li>
                      <a href="/app/deals/${deal.id}" data-link><strong>${deal.title}</strong></a>
                      <span>${money(deal.value)} · ${deal.closeDate}</span>
                      <x-status-badge tone=${deal.stage}>${deal.stage}</x-status-badge>
                    </li>
                  `)}
                </ul>
              `;
            }}
          </article>
        </section>
        <section class="card">
          <h2>Activity</h2>
          ${() => {
            const rows = activity.data() ?? [];
            if (activity.loading() && rows.length === 0) return html`<p class="muted">Loading activity…</p>`;
            return html`
              <ol class="timeline">
                ${each(rows, (item) => item.id, (item) => html`
                  <li>
                    <x-status-badge tone=${item.kind}>${item.kind}</x-status-badge>
                    <span>${item.text}</span>
                    <time>${item.at}</time>
                  </li>
                `)}
              </ol>
            `;
          }}
          <p class="muted">${current.notes}</p>
        </section>
      `;
    }

    function renderDealModal() {
      return html`
        <x-modal>
          <strong slot="title">New deal</strong>
          <form id="deal-form" class="form-grid" @submit=${onDealSubmit} novalidate>
            <label class="form-row full">Title<input name="title" @input=${dealForm.onInput} @blur=${dealForm.onBlur} /></label>
            <label class="form-row">Stage<select name="stage" .value=${() => String(dealForm.values().stage ?? "new")} @change=${dealForm.onInput} @blur=${dealForm.onBlur}>
              <option value="new">new</option><option value="qualified">qualified</option><option value="proposal">proposal</option><option value="won">won</option><option value="lost">lost</option>
            </select></label>
            <label class="form-row">Priority<select name="priority" .value=${() => String(dealForm.values().priority ?? "normal")} @change=${dealForm.onInput} @blur=${dealForm.onBlur}>
              <option value="low">low</option><option value="normal">normal</option><option value="high">high</option>
            </select></label>
            <label class="form-row">Value<input name="value" type="number" .value=${() => String(dealForm.values().value ?? 24000)} @input=${dealForm.onInput} @blur=${dealForm.onBlur} /></label>
            <label class="form-row">Close date<input name="closeDate" .value=${() => String(dealForm.values().closeDate ?? "2026-08-15")} @input=${dealForm.onInput} @blur=${dealForm.onBlur} /></label>
            <label class="form-row full">Notes<textarea name="notes" @input=${dealForm.onInput} @blur=${dealForm.onBlur}></textarea></label>
          </form>
          <button slot="actions" class="btn" type="button" @click=${() => dealModal.set(false)}>Cancel</button>
          <button slot="actions" class="btn btn-primary" type="submit" form="deal-form" ?disabled=${() => !dealForm.isValid() || createDeal.loading()}>
            ${() => createDeal.loading() ? "Creating…" : "Create deal"}
          </button>
        </x-modal>
      `;
    }
  },
  {
    shadow: false,
    styles: css`
      x-account-detail { display: block; }
      .actions { display: flex; gap: 0.5rem; align-items: center; }
      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 1rem;
        color: var(--fg-muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .card {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg);
        padding: 1rem;
      }
      .card h2 { margin: 0 0 0.75rem; font-size: 1rem; }
      .list,
      .timeline {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.65rem;
      }
      .list li,
      .timeline li {
        display: grid;
        gap: 0.15rem;
      }
      .timeline li {
        grid-template-columns: 90px minmax(0, 1fr) 90px;
        align-items: center;
      }
      .list span,
      time {
        color: var(--fg-muted);
        font-size: 0.85rem;
      }
      @media (max-width: 820px) {
        .grid { grid-template-columns: 1fr; }
      }
    `,
  },
);

export default page<{ id: string }>({
  title: ({ id }) => `Account #${id}`,
  view: ({ params }) => html`<x-account-detail data-id=${params.id}></x-account-detail>`,
});
