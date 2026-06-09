// Orders list. Demonstrates queryParam() filters and each() keyed table rows.

import {
  each,
  html,
  jsonFetcher,
  page,
  queryParam,
  resource,
} from "@madojs/mado";

interface Order {
  id: string;
  customer: string;
  total: number;
  status: "open" | "paid" | "shipped" | "cancelled";
}

export default page({
  title: "Orders",
  view: () => {
    const status = queryParam("status", "");
    const search = queryParam("q", "");

    const orders = resource(
      () => {
        const params = new URLSearchParams();
        if (status()) params.set("status", status());
        if (search()) params.set("q", search());
        const qs = params.toString();
        return `/api/admin/orders${qs ? `?${qs}` : ""}`;
      },
      jsonFetcher<Order[]>(),
      { staleTime: 5_000 },
    );

    return html`
      <header style="display:flex;align-items:center;gap:var(--space-3);margin:0 0 16px;">
        <h1 style="margin:0;">Orders</h1>
        <span class="spacer"></span>
        <input
          type="search"
          placeholder="Search…"
          .value=${search}
          @input=${(e: Event) => {
            const t = e.target as HTMLInputElement;
            search.set(t.value);
          }}
          style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--fg);"
        >
        <select
          .value=${status}
          @change=${(e: Event) => {
            const t = e.target as HTMLSelectElement;
            status.set(t.value);
          }}
          style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--fg);"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="paid">Paid</option>
          <option value="shipped">Shipped</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </header>

      <div class="card" style="padding:0;overflow:hidden;">
        ${() => {
          if (orders.loading() && !orders.data())
            return html`<p class="muted" style="padding:16px;">Loading…</p>`;
          if (orders.error())
            return html`<p style="color:var(--danger);padding:16px;">
              ${orders.error()?.message}
            </p>`;
          const list = orders.data() ?? [];
          if (list.length === 0)
            return html`<p class="muted" style="padding:24px;text-align:center;">
              No orders match the current filters.
            </p>`;
          return html`
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid var(--border);">
                  <th style="padding:10px 14px;">ID</th>
                  <th style="padding:10px 14px;">Customer</th>
                  <th style="padding:10px 14px;">Status</th>
                  <th style="padding:10px 14px;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${() =>
                  each(
                    list,
                    (o) => o.id,
                    (o) => html`
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:10px 14px;">
                          <a href="/admin/orders/${o.id}" data-link>${o.id}</a>
                        </td>
                        <td style="padding:10px 14px;">${o.customer}</td>
                        <td style="padding:10px 14px;">
                          <span class="muted">${o.status}</span>
                        </td>
                        <td style="padding:10px 14px;text-align:right;font-variant-numeric:tabular-nums;">
                          $${o.total.toFixed(2)}
                        </td>
                      </tr>
                    `,
                  )}
              </tbody>
            </table>
          `;
        }}
      </div>
    `;
  },
});