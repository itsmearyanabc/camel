/** Derive stock state label from unallocated inventory count. */
export function getStockState(count: number): string {
  if (count === 0) return "OUT_OF_STOCK";
  if (count <= 2) return "CRITICAL_STOCK";
  if (count <= 5) return "LOW_STOCK";
  return "IN_STOCK";
}

/**
 * What a CUSTOMER is allowed to know about stock: whether they can buy it.
 *
 * getStockState above reports LOW_STOCK and CRITICAL_STOCK, which leak
 * roughly how many units are left. That is useful to staff and the control
 * panel still uses it, but a customer only ever sees availability.
 */
export function getPublicStockState(count: number): string {
  return count > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
}

/** Escape characters that break Telegram legacy Markdown parse_mode. */
export function escapeTelegramMarkdown(text: string): string {
  return String(text).replace(/([_*`\[()])/g, "\\$1");
}
