// Raw Stripe DTOs. PRIVATE to stripe.connector.ts.
// Other files (resources, pages) must use domain Invoice from billing.types.ts.

export interface StripeInvoiceDTO {
  id: string;
  number: string;
  customer_email: string;
  amount_due: number; // cents
  currency: string; // lowercase
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  created: number; // unix
}

export interface StripeListResponseDTO<T> {
  data: T[];
  has_more: boolean;
}