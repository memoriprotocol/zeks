"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, AlertTriangle, Loader2, Check, Wallet } from "lucide-react"

/**
 * LaunchpadPanel — create a token on Pons.
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
 *   2. A local client for Chain ID 4663. The wallet layer in the app
 *      already switches to Robinhood Chain; the launchpad is outside
 *      the shell and does not inherit it, so it needs its own.
 *   3. ABI bindings. Passing raw objects without typechecking invites
 *      silent encoding errors, which surface as a revert with no
 *      useful message.
 *
 * The form therefore validates input and stops there. Shipping a
 * button that reverts is worse than shipping one that explains why.
 */

const CHAIN_ID = 4663
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com"
const EXPLORER = "https://robinhoodchain.blockscout.com"
const FACTORY = "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB"
const LOCKER = "0x736D76699C26D0d966744cAe304C000d471f7F35"
const LAUNCH_FEE = "0.0005"
const POOL_FEE_PCT = 1
const SUPPLY = "1,000,000,000"

const BLANK = { name: "", symbol: "", image: "", description: "", website: "", twitter: "" }

type Fields = typeof BLANK

export default function LaunchpadPanel() {
  const [fields, setFields] = useState<Fields>(BLANK)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }))
    if (error) setError(null)
  }

  /**
   * Validation is the entire implemented behaviour. Everything the
   * docs state as a hard requirement is checked here, so the panel is
   * useful to a reader today and is a thin shell once the call
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
    "w-full bg-background border border-border rounded-md px-3 py-2.5 font-sans text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40 transition-colors"
  const labelClass = "zeks-eyebrow block text-muted-foreground mb-1.5"

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={2.2} />
        Back
      </Link>

      <header className="mt-6 mb-8">
        <span className="zeks-eyebrow text-muted-foreground">TOKEN_LAUNCHPAD</span>
        <h1 className="zeks-display text-[26px] md:text-[32px] mt-2 text-foreground leading-tight">
          Launch a token
        </h1>
        <p className="text-muted-foreground text-[13.5px] mt-2 max-w-lg leading-relaxed">
          Deploy a fixed-supply token to Robinhood Chain. The pool goes live and
          liquidity locks in the same transaction. Your wallet signs it; ZEKS never
          holds your funds.
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Form card */}
        <form
          onSubmit={onSubmit}
          className="zeks-surface overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="zeks-section-title text-foreground">Token details</span>
            <span className="text-[10.5px] font-mono text-muted-foreground">
              STEP 1 OF 1
            </span>
          </div>

          <div className="px-5 py-5 grid sm:grid-cols-2 gap-4">
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
            <div className="px-5 pb-5">
              <div
                role="alert"
                className="flex items-start gap-2.5 text-[13px] text-down bg-down/5 border border-down/20 rounded-md px-3.5 py-2.5"
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="px-5 py-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10.5px] font-mono text-muted-foreground">
              {LAUNCH_FEE} ETH LAUNCH FEE
            </span>
            <button
              type="submit"
              className="zeks-btn-primary inline-flex items-center gap-2 h-9 px-4 text-[12.5px] font-medium"
            >
              <Wallet size={14} strokeWidth={2} />
              Review launch
            </button>
          </div>
        </form>

        {/* Spec panel */}
        <aside className="zeks-surface p-5">
          <span className="zeks-eyebrow text-muted-foreground">FIXED AT LAUNCH</span>

          <dl className="mt-4 space-y-3.5">
            {[
              ["Total supply", SUPPLY],
              ["Pool", "WETH · locked"],
              ["Pool fee", `${POOL_FEE_PCT}%`],
              ["Launch fee", `${LAUNCH_FEE} ETH`],
              ["Curve", "None — from block 0"],
              ["Graduation", "4.2 ETH paired"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-4 pb-3.5 border-b border-border last:border-0 last:pb-0"
              >
                <dt className="text-[12.5px] text-muted-foreground">{k}</dt>
                <dd className="text-[12.5px] font-mono text-foreground text-right">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 pt-4 border-t border-border">
            <span className="zeks-eyebrow text-muted-foreground">NETWORK</span>
            <p className="text-[13px] mt-1.5 text-foreground">Robinhood Chain</p>
            <p className="text-[10.5px] font-mono text-muted-foreground mt-0.5">
              CHAIN ID {CHAIN_ID}
            </p>

            <dl className="mt-3.5 space-y-2">
              {[
                ["Factory", FACTORY],
                ["Locker", LOCKER],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-mono text-muted-foreground/70">{k}</dt>
                  <dd className="flex items-start gap-1">
                    <a
                      href={`${EXPLORER}/address/${v}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10.5px] font-mono text-foreground/80 hover:text-foreground transition-colors break-all inline-flex items-start gap-1"
                    >
                      {v.slice(0, 10)}…{v.slice(-6)}
                      <ArrowUpRight size={10} strokeWidth={2.4} className="shrink-0 mt-0.5" />
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Honest status. The launch call is not wired yet. */}
          <div className="mt-5 rounded-md bg-background border border-border px-3.5 py-3">
            <span className="zeks-eyebrow text-muted-foreground">INTEGRATION STATUS</span>
            <ul className="mt-2 space-y-1.5">
              {[
                ["Parameters validated", true],
                ["Spec pinned to live contract", true],
                ["Wallet transaction — not wired", false],
              ].map(([line, done]) => (
                <li
                  key={line as string}
                  className="flex items-center gap-2 text-[11.5px] text-muted-foreground"
                >
                  {done ? (
                    <Check size={11} className="shrink-0 text-up" />
                  ) : (
                    <Loader2 size={11} className="shrink-0" />
                  )}
                  {line as string}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
