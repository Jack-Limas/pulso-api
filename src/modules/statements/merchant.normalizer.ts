const NOISE_WORDS = new Set(["COMPRA", "PAGO", "POS", "DEBITO", "CREDITO", "TRANSFERENCIA", "EN"]);
const MAX_MERCHANT_WORDS = 3;
const UNKNOWN_MERCHANT = "UNKNOWN";

/** Reduces bank descriptions to a stable key, so the same store groups together across months. */
export function normalizeMerchant(description: string): string {
  const words = description
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "" && !/\d/.test(word) && !NOISE_WORDS.has(word));
  return words.slice(0, MAX_MERCHANT_WORDS).join(" ") || UNKNOWN_MERCHANT;
}
