// Admin dashboard. Demonstrates `resource()` for loading data with
// loading/error states.

import { html, jsonFetcher, page, resource } from "@madojs/mado";

interface Stats {
  orders: number;
  revenue: number;
  customers: number;
}

export default page({
  title: "Dashboard",
  view: () => {
    const stats = resource(() => "/api/admin/stats", jsonFetcher<Stats>(), {
      staleTime: 30_000,
    });

    return html`
      <h1 style="margin:0 0 24px;">Dashboard</h1>
      ${() => {
        if (stats.loading()) return html`<p class="muted">Loading…</p>`;
        if (stats.error())
          return html`<p style="color:var(--danger);">${stats.error()?.message}</p>`;
        const s = stats.data();
        if (!s) return null;
        return html`
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-4);">
            <div class="card">
              <div class="muted">Orders</div>
              <div style="font-size:24px;font-weight:700;">${s.orders}</div>
            </div>
            <div class="card">
              <div class="muted">Revenue</div>
              <div style="font-size:24px;font-weight:700;">
                $${s.revenue.toLocaleString()}
              </div>
            </div>
            <div class="card">
              <div class="muted">Customers</div>
              <div style="font-size:24px;font-weight:700;">${s.customers}</div>
            </div>
          </div>
        `;
      }}
    `;
  },
});