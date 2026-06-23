// Pure utilities only. No DOM, no signals, no Mado runtime.

const fmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function formatDate(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  return fmt.format(date);
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(amount);
}