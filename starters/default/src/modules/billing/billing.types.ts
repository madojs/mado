// Domain types for the billing module. Public via billing.public.ts.

export type InvoiceId = string;

export type InvoiceStatus = "draft" | "pending" | "paid" | "void";

export interface Invoice {
  id: InvoiceId;
  number: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: string; // ISO date
}