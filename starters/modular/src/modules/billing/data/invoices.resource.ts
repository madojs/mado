// Canonical *.resource.ts shape:
//   - Factories that return `resource(...)` / `mutation(...)`.
//   - Resource KEYS use the API URL (or a clear URL-shaped string) so
//     `invalidates: ["/api/billing/invoices*"]` matches naturally.
//   - NO UI, NO services. Pure data layer over the connector.

import { mutation, resource } from "@madojs/mado";

import { stripeApi } from "../api/stripe.connector";
import type { InvoiceId } from "../billing.types";

const listKey = (cursor: string | undefined) =>
  `/api/billing/invoices?cursor=${cursor ?? "first"}`;
const oneKey = (id: InvoiceId) => `/api/billing/invoices/${id}`;

export const useInvoices = (cursor: () => string | undefined) =>
  resource(
    () => listKey(cursor()),
    () => {
      const c = cursor();
      return stripeApi.listInvoices(c ? { cursor: c } : {});
    },
    { staleTime: 30_000 },
  );

export const useInvoice = (id: () => InvoiceId) =>
  resource(
    () => oneKey(id()),
    () => stripeApi.getInvoice(id()),
    { staleTime: 60_000 },
  );

export const payInvoice = mutation((id: InvoiceId) => stripeApi.payInvoice(id), {
  invalidates: ["/api/billing/invoices*"],
});
