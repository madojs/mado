// Canonical *.routes.ts shape: a plain map of path → lazy page imports.
//
// Modules NEVER wrap themselves in a layout. Wrapping (which shell + guard)
// is a composition decision that lives in src/app.routes.ts.

export const billingRoutes = {
  "/invoices": () => import("./pages/invoices-list.page"),
  "/invoices/:id": () => import("./pages/invoice-detail.page"),
};