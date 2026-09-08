/**
 * ZEKS Markets — display-name normalization
 *
 * Upstream Robinhood `tokenName` is e.g. "Apple • Robinhood Token"
 * or "Alphabet Class A • Robinhood Token". For compact terminal UI
 * we render a clean short name. The raw tokenName is preserved
 * separately as `tokenNameRaw` for any future use.
 *
 * Rules (spec §15):
 *
 *   1. Strip a trailing "• Robinhood Token" (or equivalent suffix
 *      after a bullet character) when it is present.
 *   2. Strip a trailing "Robinhood Token" without a bullet if present
 *      and the remaining prefix is non-empty.
 *   3. If, after stripping, the result is empty, fall back to the
 *      ticker symbol (uppercased).
 *   4. Trim whitespace and collapse internal whitespace.
 *   5. Never silently rename companies (no per-symbol mapping).
 *   6. Never invent a name we cannot derive from the source.
 */

const BULLET_RE = /[\u2022\u2027\u00B7•·]/
const SUFFIX_TOKEN_ONLY_RE = /\s+Robinhood\s+Token\s*$/i
const SUFFIX_BULLET_RE = /\s+[\u2022\u2027\u00B7•·]\s+Robinhood\s+Token\s*$/i

export function normalizeDisplayName(
  tokenName: string | null | undefined,
  fallbackSymbol: string,
): string {
  const raw =
    typeof tokenName === "string" && tokenName.trim().length > 0
      ? tokenName.trim()
      : ""
  if (!raw) return fallbackSymbol.toUpperCase()

  let cleaned = raw

  // First, try the bullet-prefixed suffix (e.g. "Apple • Robinhood Token")
  if (SUFFIX_BULLET_RE.test(cleaned) || BULLET_RE.test(cleaned)) {
    cleaned = cleaned.replace(SUFFIX_BULLET_RE, "")
  }

  // Then strip a bare "Robinhood Token" suffix if the bullet version
  // didn't match (e.g. "Apple Robinhood Token" without the bullet).
  if (SUFFIX_TOKEN_ONLY_RE.test(cleaned)) {
    cleaned = cleaned.replace(SUFFIX_TOKEN_ONLY_RE, "")
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim()

  return cleaned.length > 0 ? cleaned : fallbackSymbol.toUpperCase()
}
