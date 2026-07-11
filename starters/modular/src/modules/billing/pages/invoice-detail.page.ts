import { html, page, signal } from "@madojs/mado";

import { formatDate, formatMoney } from "../../../shared/lib/format-date";
import "@/shared/ui/x-spinner.component";

import { hasPermission } from "../../auth/auth.public";

import "../components/invoice-status-badge.component";
import { payInvoice, useInvoice } from "../data/invoices.resource";

// 4. VIEW
export default page({
  title: "Invoice",
  // The router passes URL params and the matched query to the view.
  view: ({ params }) => {
    if (!params.id) return html`<p class="error">Missing invoice id.</p>`;
    const invoiceId = params.id;

    // 1. LOCAL STATE  (per-render)
    const paying = signal(false);

    // 2. DATA
    const invoice = useInvoice(() => invoiceId);

    // 3. ACTIONS
    const onPay = async () => {
      const current = invoice.data();
      if (!current) return;
      paying.set(true);
      try {
        await payInvoice.run(current.id);
        invoice.refresh();
      } finally {
        paying.set(false);
      }
    };

    return html`
      <section>
        ${() =>
          invoice.loading()
            ? html`<x-spinner></x-spinner>`
            : invoice.error()
              ? html`<p class="error">${() => invoice.error()?.message}</p>`
              : (() => {
                  const i = invoice.data();
                  if (!i) return null;
                  return html`
                    <h1>Invoice ${i.number}</h1>
                    <dl>
                      <dt>Customer</dt><dd>${i.customerEmail}</dd>
                      <dt>Amount</dt><dd>${formatMoney(i.amount, i.currency)}</dd>
                      <dt>Status</dt>
                      <dd>
                        <invoice-status-badge status=${i.status}></invoice-status-badge>
                      </dd>
                      <dt>Issued</dt><dd>${formatDate(i.issuedAt)}</dd>
                    </dl>
                    ${i.status === "pending" && hasPermission("billing.invoices.pay")
                      ? html`<button class="button" type="button" ?disabled=${paying} @click=${onPay}>
                          ${() => (paying() ? "Paying…" : "Pay now")}
                        </button>`
                      : null}
                  `;
                })()}
      </section>
    `;
  },
});
