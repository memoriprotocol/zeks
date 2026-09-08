/**
 * ZEKS Markets — formatUnits helper.
 *
 * Convert a raw ERC20 bigint balance into a human-readable
 * decimal string, given the token's decimals. Pure, no DOM access,
 * no RPC calls.
 *
 *   formatUnits(1500000n, 6)      → "1.5"
 *   formatUnits(1500000n, 18)     → "0.0000000000015"
 *   formatUnits(123456789n, 2)    → "1234567.89"
 *   formatUnits(0n, 6)            → "0"
 *
 * The output is the FULL-precision string; formatting for display
 * (significant digits, separators) happens in the components.
 */

export function formatUnits(value: bigint, decimals: number): string {
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 30) {
    throw new Error(`Invalid decimals: ${decimals}`)
  }
  if (value === BigInt(0)) return "0"

  const negative = value < BigInt(0)
  let abs = value
  if (negative) abs = -abs

  const base = pow10(BigInt(decimals))
  const whole = abs / base
  const frac = abs % base

  if (frac === BigInt(0)) {
    return (negative ? "-" : "") + whole.toString()
  }

  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`
}

function pow10(n: bigint): bigint {
  let result = BigInt(1)
  for (let i = 0; i < Number(n); i++) {
    result = result * BigInt(10)
  }
  return result
}
