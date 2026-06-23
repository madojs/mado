// Connector for ONE external system (Stripe). Stays small and predictable:
//   1. CONFIG    2. MAPPERS    3. ENDPOINTS    4. ERRORS
//
// If we ever swap Stripe → another PSP, only this file (and its _contracts/)
// changes. Pages and resources keep using the domain `Invoice`.

import { httpClient } from "../../../shared/http/http-client";
import { HttpError } from "../../../shared/http/http-error";

import type {
  StripeInvoiceDTO,
  StripeListResponseDTO,
} from "../_contracts/stripe.types";
import type { Invoice, InvoiceStatus } from "../billing.types";

// 1. CONFIG
const base = "/api/billing/stripe";

// 2. MAPPERS
const toStatus = (s: StripeInvoiceDTO["status"]): InvoiceStatus => {
  switch (s) {
    case "paid":
      return "paid";
    case "draft":
      return "draft";
    case "void":
    case "uncollectible":
      return "void";
    default:
      return "pending";
  }
};

const toInvoice = (dto: StripeInvoiceDTO): Invoice => ({
  id: dto.id,
  number: dto.number,
  customerEmail: dto.customer_email,
  amount: dto.amount_due / 100,
  currency: dto.currency.toUpperCase(),
  status: toStatus(dto.status),
  issuedAt: new Date(dto.created * 1000).toISOString(),
});

// 3. ENDPOINTS
export const stripeApi = {
  listInvoices: async (params: { limit?: number; cursor?: string } = {}): Promise<{
    items: Invoice[];
    hasMore: boolean;
  }> => {
    const res = await httpClient.get<StripeListResponseDTO<StripeInvoiceDTO>>(
      `${base}/invoices`,
      { query: { limit: params.limit ?? 25, starting_after: params.cursor } },
    );
    return { items: res.data.map(toInvoice), hasMore: res.has_more };
  },

  getInvoice: async (id: string): Promise<Invoice> => {
    const dto = await httpClient.get<StripeInvoiceDTO>(`${base}/invoices/${id}`);
    return toInvoice(dto);
  },

  payInvoice: async (id: string): Promise<Invoice> => {
    const dto = await httpClient.post<StripeInvoiceDTO>(`${base}/invoices/${id}/pay`);
    return toInvoice(dto);
  },
};

// 4. ERRORS
export class StripeError extends HttpError {
  override readonly name = "StripeError";
}