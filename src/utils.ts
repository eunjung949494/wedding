/**
 * Format a number into Korean Won string with comma separation.
 * Example: 150000 -> 150,000원
 */
export function formatWon(value: number): string {
  if (value === undefined || value === null) return "0원";
  return new Intl.NumberFormat("ko-KR", {
    style: "decimal",
  }).format(value) + "원";
}

/**
 * Format phone string cleanly
 */
export function formatPhone(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}
