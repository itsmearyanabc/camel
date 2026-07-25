/** Derive stock state label from unallocated inventory count. */
export function getStockState(count: number): string {
  if (count === 0) return "OUT_OF_STOCK";
  if (count <= 2) return "CRITICAL_STOCK";
  if (count <= 5) return "LOW_STOCK";
  return "IN_STOCK";
}

/** Escape characters that break Telegram legacy Markdown parse_mode. */
export function escapeTelegramMarkdown(text: string): string {
  return String(text).replace(/([_*`\[()])/g, "\\$1");
}
