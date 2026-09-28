"use client"

import { useState } from "react"
import { ArrowUpRight, AlertTriangle, Loader2, Check, Wallet } from "lucide-react"

/**
 * LaunchSection — create a token on Pons, from the ZEKS landing page.
 *
 * A launch is a single transaction: the token is minted and its WETH
 * pool goes live together, with liquidity locked. This panel collects
 * the launch parameters and routes them to the user's wallet.
 *
 * INTEGRATION STATUS: the wiring below is intentionally NOT complete.
 * Pons exposes contracts on Robinhood Chain, not a hosted REST API,
 * so the values below are the real ABI inputs and addresses, but
 * three things are still missing and the form will not submit until
 * they are:
 *
 *   1. A Pons "Launch" entry point. The docs describe creation as
 *      "a single transaction" against the factory, but do not publish
 *      the exact calldata, so the target function is unconfirmed.
 *   2. A local client for Chain ID 4663. The wallet layer in this app
 *      already switches to Robinhood Chain; the launch panel should
 *      reuse it rather than open a second connection.
 *   3. ABI bindings. Passing raw objects without typechecking invites
 *      silent encoding errors, which surface as a revert with no
 *      useful message.
 *
 * The form therefore validates input and stops there. Shipping a
 * button that reverts is worse than shipping one that explains why.
 */

const CHAIN_ID = 4663
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com"
const FACTORY = "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB"
const LAUNCH_FEE = "0.0005"
const POOL_FEE_PCT = 1
const SUPPLY = "1,000,000,000"

const BLANK = { name: "", symbol: "", image: "", description: "", website: "", twitter: "" }

type Fields = typeof BLANK

export default function LaunchSection() {
  const [fields, setFields] = useState<Fields>(BLANK)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }))
    if (error) setError(null)
  }

  /**
   * Validation is the entire implemented behaviour. Everything the
   * docs state as a hard requirement is checked here, so the panel
   * is useful to a reader today and is a thin shell once the call
   * itself lands.
   */
  const validate = (): string | null => {
    if (!fields.name.trim()) return "A token needs a name."
    if (!fields.symbol.trim()) return "A token needs a ticker."
    if (fields.symbol.trim().length > 10) return "Ticker is limited to 10 characters."
    if (!fields.twitter.trim() && !fields.website.trim()) {
      return "Add at least one social link. Unlaunched tokens with no presence are hard to tell apart from impersonations."
    }
    return null
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(validate())
  }

  const inputClass =
    "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 transition-colors"
  const labelClass = "block text-xs font-mono text-muted-foreground mb-1.5"

  return (
    <section id="launch" className="py-24 border-t border-border/40">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <span className="zeks-label" style={{ fontSize: "11px" }}>
              TOKEN_LAUNCHPAD
            </span>
            <h2 className="font-serif text-3xl md:text-4xl mt-4 max-w-md leading-tight tracking-tight">
              Launch a token,
              <br />
              in one transaction.
            </h2>
          </div>
          <p className="text-muted-foreground text-sm max-w-xs hidden md:block mt-3">
            Deploy a fixed-supply token straight to Robinhood Chain. Pool goes live
            and liquidity locks automatically.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Form card */}
          <form
            onSubmit={onSubmit}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold">Token details</span>
              <span className="text-[11px] font-mono text-muted-foreground">
                STEP 1 OF 1
              </span>
            </div>

            <div className="px-6 py-6 grid sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass} htmlFor="launch-name">
                  NAME
                </label>
                <input
                  id="launch-name"
                  className={inputClass}
                  placeholder="Zeks Points"
                  value={fields.name}
                  onChange={set("name")}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="launch-symbol">
                  TICKER
                </label>
                <input
                  id="launch-symbol"
                  className={inputClass}
                  placeholder="ZKS"
                  maxLength={10}
                  value={fields.symbol}
                  onChange={set("symbol")}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="launch-image">
                  IMAGE URL
                </label>
                <input
                  id="launch-image"
                  className={inputClass}
                  placeholder="https://…/logo.png"
                  value={fields.image}
                  onChange={set("image")}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="launch-description">
                  DESCRIPTION
                </label>
                <textarea
                  id="launch-description"
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="What is this token for?"
                  value={fields.description}
                  onChange={set("description")}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="launch-twitter">
                  TWITTER / X
                </label>
                <input
                  id="launch-twitter"
                  className={inputClass}
                  placeholder="@handle"
                  value={fields.twitter}
                  onChange={set("twitter")}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="launch-website">
                  WEBSITE
                </label>
                <input
                  id="launch-website"
                  className={inputClass}
                  placeholder="https://…"
                  value={fields.website}
                  onChange={set("website")}
                />
              </div>
            </div>

            {error && (
              <div className="px-6 pb-5">
                <div
                  role="alert"
                  className="flex items-start gap-2.5 text-sm text-down bg-down/5 border border-down/20 rounded-lg px-4 py-3"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div className="px-6 py-5 border-t border-border flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs font-mono text-muted-foreground">
                {LAUNCH_FEE} ETH LAUNCH FEE
              </span>
              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-foreground text-background text-sm font-medium px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90"
              >
                <Wallet size={15} strokeWidth={2} />
                Review launch
              </button>
            </div>
          </form>

          {/* Spec panel */}
          <aside className="bg-card border border-border rounded-2xl p-6">
            <span className="zeks-label" style={{ fontSize: "11px" }}>
              FIXED AT LAUNCH
            </span>

            <dl className="mt-5 space-y-4">
              {[
                ["Total supply", SUPPLY],
                ["Pool", "WETH · locked"],
                ["Pool fee", `${POOL_FEE_PCT}%`],
                ["Launch fee", `${LAUNCH_FEE} ETH`],
                ["Curve", "None — trades from block 0"],
                ["Graduation", "4.2 ETH paired"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
                >
                  <dt className="text-sm text-muted-foreground">{k}</dt>
                  <dd className="text-sm font-mono text-right">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 pt-5 border-t border-border">
              <span className="text-xs font-mono text-muted-foreground">
                NETWORK
              </span>
              <p className="text-sm mt-1.5">Robinhood Chain</p>
              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                CHAIN ID {CHAIN_ID}
              </p>
              <a
                href={RPC_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 transition-colors break-all"
              >
                {RPC_URL}
                <ArrowUpRight size={11} strokeWidth={2.2} />
              </a>
            </div>

            {/* Honest status. The launch call is not wired yet. */}
            <div className="mt-6 rounded-lg bg-background border border-border px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground">
                  INTEGRATION STATUS
                </span>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {[
                  "Parameters validated",
                  "Spec pinned to live contract",
                  "Wallet transaction — not wired",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    {line.startsWith("Wallet") ? (
                      <Loader2 size={12} className="shrink-0" />
                    ) : (
                      <Check size={12} className="shrink-0 text-up" />
                    )}
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
