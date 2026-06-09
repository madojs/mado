// Order detail page. Reads :id from params, fetches the order, and shows
// inline loading/error/empty/ready states.

import { html, jsonFetcher, page, resource } from "@madojs/mado";

interface OrderDetail {
  id: string;
  customer: string;
  total: number;
  status: string;
  items: Array<{ sku: string; name: string; qty: number; price: number }>;
}

export default page<{ id: string }>({
  title: ({ id }) => `Order ${id}`,
  view: ({ params }) => {
    const order = resource(
      () => `/api/admin/orders/${params.id}`,
      jsonFetcher<OrderDetail>(),
      { staleTime: 15_000 },
    );

    return html`
      <p>
        <a href="/admin/orders" data-link>← All orders</a>
      </p>
      ${() => {
        if (order.loading() && !order.data())
          return html`<p class="muted">Loading order…</p>`;
        if (order.error())
          return html`<p style="color:var(--danger);">${order.error()?.message}</p>`;
        const o = order.data();
        if (!o)
          return html`<p class="muted">Order not found.</p>`;
        return html`
          <h1 style="margin:0 0 8px;">Order ${o.id}</h1>
          <p class="muted" style="margin:0 0 24px;">${o.customer} · ${o.status}</p>
          <div class="card">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid var(--border);">
                  <th style="padding:8px 0;">SKU</th>
                  <th style="padding:8px 0;">Item</th>
                  <th style="padding:8px 0;text-align:right;">Qty</th>
                  <th style="padding:8px 0;text-align:right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${o.items.map(
                  (it) => html`
                    <tr style="border-bottom:1px solid var(--border);">
                      <td style="padding:8px 0;">${it.sku}</td>
                      <td style="padding:8px 0;">${it.name}</td>
                      <td style="padding:8px 0;text-align:right;">${it.qty}</td>
                      <td style="padding:8px 0;text-align:right;font-variant-numeric:tabular-nums;">
                        $${it.price.toFixed(2)}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" style="padding-top:12px;text-align:right;font-weight:600;">
                    Total
                  </td>
                  <td style="padding-top:12px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">
                    $${o.total.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        `;
      }}
    `;
  },
});