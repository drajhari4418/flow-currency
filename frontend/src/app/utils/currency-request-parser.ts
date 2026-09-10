export interface ParsedCurrencyRequest {
  amount: number;
  fromRaw: string;
  toRaw: string;
}

/**
 * Extracts an amount and two currency phrases from a free-text request like:
 *   "Convert 500 USD to EUR"
 *   "500 dollars into euros"
 *   "Exchange 200 rupees for dollars"
 *
 * This function only does text extraction — it does NOT validate or resolve
 * "dollars"/"rupees" into actual currency codes. It exists as an offline
 * fallback for CurrencyConverterComponent's query-param handling, and for
 * DashboardComponent's Quick Convert when the AI parsing call fails.
 *
 * Returns null if the text doesn't match a recognizable pattern.
 */
export function parseCurrencyRequest(input: string): ParsedCurrencyRequest | null {
  const cleaned = (input || '').trim();
  if (!cleaned) return null;

  // Accepts optional leading verb (convert/change/exchange), an amount,
  // a "from" phrase, a connector (to/into/for), and a "to" phrase.
  const match = cleaned.match(
    /^(?:convert|change|exchange)?\s*([\d,]+(?:\.\d+)?)\s+([a-zA-Z\s]+?)\s+(?:to|into|for)\s+([a-zA-Z\s]+?)[\s.!?]*$/i
  );
  if (!match) return null;

  const amount = parseFloat(match[1].replace(/,/g, ''));
  const fromRaw = match[2].trim();
  const toRaw = match[3].trim();

  if (!amount || amount <= 0 || !fromRaw || !toRaw) return null;

  return { amount, fromRaw, toRaw };
}
