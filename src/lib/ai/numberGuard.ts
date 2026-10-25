/**
 * The model may only quote numbers that deterministic code supplied. This returns the numbers in `text`
 * that are not in `allowed` (SKU ids and ISO week labels are ignored).
 */
export function disallowedNumbers(text: string, allowed: number[]): string[] {
  const cleaned = text.replace(/SKU\s?\d+/gi, " ").replace(/\d{4}-W\d{1,2}/gi, " ").replace(/\bW\d{1,2}\b/gi, " ");
  const tokens = cleaned.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const bad: string[] = [];
  for (const t of tokens) {
    const value = Number(t.replace(/,/g, ""));
    if (!allowed.some((a) => Math.abs(a - value) < 1e-6)) bad.push(t);
  }
  return bad;
}
