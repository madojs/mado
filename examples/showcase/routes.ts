/**
 * Showcase route manifest.
 *
 * Structure:
 *   /                  → landing
 *   /blog              → post list
 *   /blog/:slug        → post detail
 *   /pricing           → pricing
 *   /app/login         → login form (no layout)
 *   /app/*             → protected admin area with layout (nested)
 *     /app/dashboard   → app dashboard
 *     /app/accounts    → CRM accounts
 *     /app/deals       → pipeline
 *     /app/settings    → settings
 *   *                  → 404
 */

import { routes, nested, html, type RoutesMap } from "@madojs/mado";

export const manifest: RoutesMap = {
  "/": () => import("./pages/home.js"),
  "/blog": () => import("./pages/blog-list.js"),
  "/blog/:slug": () => import("./pages/blog-post.js"),
  "/pricing": () => import("./pages/pricing.js"),

  "/app/login": () => import("./pages/login.js"),

  "/app/*": nested({
    layout: () => import("./layouts/app-layout.js"),
    routes: {
      dashboard: () => import("./pages/dashboard.js"),
      accounts: () => import("./pages/accounts-list.js"),
      "accounts/new": () => import("./pages/account-new.js"),
      "accounts/:id": () => import("./pages/account-detail.js"),
      deals: () => import("./pages/deals-list.js"),
      "deals/:id": () => import("./pages/deal-detail.js"),
      settings: () => import("./pages/settings.js"),
    },
  }),

  "*": () => import("./pages/not-found.js"),
};

export default routes(manifest, {
  loading: () => html`<p class="route-loading">Loading…</p>`,
  error: (err) =>
    html`<pre class="route-error">${err.message}</pre>`,
  titleSuffix: " · Mado",
});
