/**
 * Accounts table: queryParam filters, pagination, each(), resource lifecycle.
 */

import {
  component,
  computed,
  css,
  each,
  html,
  inject,
  page,
  queryParam,
  resource,
} from "@madojs/mado";
import { ApiContext, ToastContext } from "../lib/services.js";
import { money, percent } from "../lib/format.js";
import type { AccountStatus } from "../lib/api.js";
import "../components/x-data-table.js";
import "../components/x-empty-state.js";
import "../components/x-status-badge.js";

function readStatus(value: string): AccountStatus | "all" {
  if (value === "lead" || value === "active" || value === "at-risk" || value === "churned") {
    return value;
  }
  return "all";
}

function readSort(value: string): "name" | "mrr" | "health" | "touch" {
  if (value === "mrr" || value === "health" || value === "touch") return value;
  return "name";
}

component(
  "x-accounts-list",
  ({ host }) => {
    const api = inject(host, ApiContext);
    const toasts = inject(host, ToastContext);
    const q = queryParam("q", "");
    const status = queryParam("status", "all");
    const sort = queryParam("sort", "name");
    const pageNo = queryParam("page", "1");

    const accounts = resource(
      () => `accounts?q=${q()}&status=${status()}&sort=${sort()}&page=${pageNo()}`,
      () =>
        api().listAccounts({
          query: q(),
          status: readStatus(status()),
          sort: readSort(sort()),
          page: Number(pageNo()) || 1,
          pageSize: 6,
        }),
      { staleTime: 3000 },
    );

    const rows = computed(() => accounts.data()?.rows ?? []);
    const totalMrr = computed(() => {
      let sum = 0;
      for (const account of rows()) sum += account.mrr;
      return sum;
    });

    const onQuery = (e: Event) => {
      q.set((e.target as HTMLInputElement).value || null);
      pageNo.set("1");
    };
    const onStatus = (e: Event) => {
      status.set((e.target as HTMLSelectElement).value);
      pageNo.set("1");
    };
    const onSort = (e: Event) => sort.set((e.target as HTMLSelectElement).value);
    const nextPage = () => pageNo.set(String((Number(pageNo()) || 1) + 1));
    const prevPage = () => pageNo.set(String(Math.max(1, (Number(pageNo()) || 1) - 1)));
    const simulateError = () => {
      api().failNext("accounts");
      accounts.refresh();
      toasts().push("info", "Next accounts request will fail once.");
    };

    return () => html`
      <header class="page-head">
        <div>
          <h1>Accounts</h1>
          <p>URL filters, server-like pagination and keyed table rows.</p>
        </div>
        <div class="head-actions">
          <button class="btn" type="button" @click=${simulateError}>Fail next load</button>
          <a class="btn btn-primary" href="/app/accounts/new" data-link>New account</a>
        </div>
      </header>

      <x-data-table>
        <div slot="toolbar" class="toolbar-fields">
          <input
            type="search"
            placeholder="Search account, domain or contact"
            .value=${q}
            @input=${onQuery}
          />
          <select .value=${status} @change=${onStatus}>
            <option value="all">all statuses</option>
            <option value="lead">lead</option>
            <option value="active">active</option>
            <option value="at-risk">at-risk</option>
            <option value="churned">churned</option>
          </select>
          <select .value=${sort} @change=${onSort}>
            <option value="name">sort by name</option>
            <option value="mrr">sort by MRR</option>
            <option value="health">sort by health</option>
            <option value="touch">sort by last touch</option>
          </select>
        </div>

        ${() => {
          if (accounts.loading() && !accounts.data()) return html`<p class="table-state">Loading accounts…</p>`;
          if (accounts.error()) {
            return html`
              <div class="table-state">
                <p class="err">${accounts.error()!.message}</p>
                <button class="btn" type="button" @click=${() => accounts.refresh()}>Retry</button>
              </div>
            `;
          }
          if (rows().length === 0) {
            return html`
              <x-empty-state>
                <span slot="title">No matching accounts</span>
                Change filters or create the first account.
                <a slot="action" class="btn btn-primary" href="/app/accounts/new" data-link>Create account</a>
              </x-empty-state>
            `;
          }
          return html`
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>MRR</th>
                  <th>Health</th>
                  <th>Last touch</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${() =>
                  each(
                    rows(),
                    (account) => account.id,
                    (account) => html`
                      <tr>
                        <td>
                          <strong>${account.name}</strong>
                          <small class="muted">${account.domain}</small>
                        </td>
                        <td><x-status-badge tone=${account.status}>${account.status}</x-status-badge></td>
                        <td><x-status-badge tone=${account.plan}>${account.plan}</x-status-badge></td>
                        <td>${money(account.mrr)}</td>
                        <td>${percent(account.health)}</td>
                        <td class="muted">${account.lastTouchAt}</td>
                        <td><a href="/app/accounts/${account.id}" data-link>Open</a></td>
                      </tr>
                    `,
                  )}
              </tbody>
            </table>
          `;
        }}

        <div slot="footer">
          <span class="muted">
            ${() => accounts.data()?.total ?? 0} accounts · ${() => money(totalMrr())} visible MRR
          </span>
          <span class="pager">
            <button class="btn" type="button" @click=${prevPage} ?disabled=${() => (Number(pageNo()) || 1) <= 1}>Prev</button>
            <span class="muted">Page ${pageNo}</span>
            <button class="btn" type="button" @click=${nextPage} ?disabled=${() => rows().length < 6}>Next</button>
          </span>
        </div>
      </x-data-table>
    `;
  },
  {
    shadow: false,
    styles: css`
      x-accounts-list { display: block; }
      .head-actions,
      .toolbar-fields,
      .pager {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .toolbar-fields { flex: 1; }
      .toolbar-fields input { min-width: 280px; }
      td strong,
      td small {
        display: block;
      }
      .table-state {
        padding: 1rem;
      }
      @media (max-width: 820px) {
        .toolbar-fields,
        .head-actions {
          display: grid;
          width: 100%;
        }
        .toolbar-fields input { min-width: 0; }
      }
    `,
  },
);

export default page({
  title: "Accounts",
  view: () => html`<x-accounts-list></x-accounts-list>`,
});
