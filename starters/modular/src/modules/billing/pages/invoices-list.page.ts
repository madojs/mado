import { each, html, page, routeUrl, signal, untracked } from "@madojs/mado";

import { formatDate, formatMoney } from "../../../shared/lib/format-date";
import "../../../shared/ui/x-spinner.component";

import "../components/invoice-status-badge.component";
import { useInvoices } from "../data/invoices.resource";

// 1. LOCAL STATE
// (per-view)

// 2. DATA
// (per-view)

// 3. ACTIONS
// (pagination handlers would go here)

// 4. VIEW
export default page({
  title: "Invoices",
  view: () => {
    const cursor = signal<string | undefined>(undefined);
    const invoices = untracked(() => useInvoices(cursor));

    return html`
      <section>
        <h1>Invoices</h1>
        ${() =>
          invoices.loading()
            ? html`<x-spinner></x-spinner>`
            : invoices.error()
              ? html`<p class="error">${() => invoices.error()?.message}</p>`
              : html`
                  <table class="data">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Issued</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${() =>
                        each(
                          invoices.data()?.items ?? [],
                          (i) => i.id,
                          (i) => html`
                            <tr>
                              <td>
                                <a data-link href=${routeUrl(`/billing/invoices/${i.id}`)}>${i.number}</a>
                              </td>
                              <td>${i.customerEmail}</td>
                              <td>${formatMoney(i.amount, i.currency)}</td>
                              <td>
                                <invoice-status-badge status=${i.status}></invoice-status-badge>
                              </td>
                              <td>${formatDate(i.issuedAt)}</td>
                              <td>
                                <a data-link href=${routeUrl(`/billing/invoices/${i.id}`)}>Open</a>
                              </td>
                            </tr>
                          `,
                        )}
                    </tbody>
                  </table>
                `}
      </section>
    `;
  },
});
