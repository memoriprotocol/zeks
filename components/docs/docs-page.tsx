"use client"

/**
 * Docs — user-facing how-to guide.
 *
 *   Static content only. No market fetches, no wallet interaction.
 *   Wrapped in AppShell by /terminal/docs/page.tsx so the sidebar
 *   and toolbar render exactly as they do on every other page.
 *
 * Every number quoted below (LLTV thresholds, fee estimate, risk
 * bands) is lifted from the code that renders it in the product, so
 * the guide cannot drift from the UI:
 *   · assessLoopRisk()      -> lib/markets/loop/types.ts
 *   · LOOP_ESTIMATED_FEES_PERCENT -> lib/markets/loop/constants.ts
 *   · product copy          -> components/zeks/dashboard/product-explainer.tsx
 *
 * Deliberately does NOT link to a router that does not exist. The
 * page is an explanation surface, not a navigation island.
 */

import * as React from "react"
import Link from "next/link"
import { PageTitle } from "@/components/zeks/page-title"

type Tone = "up" | "down" | "neutral"

export default function DocsPage() {
  return (
    <div
      data-testid="docs-page"
      style={{
        maxWidth: "78ch",
        margin: "0 auto",
        padding: "28px 24px 72px",
      }}
    >
      <PageTitle>Docs</PageTitle>

      <Lead>
        ZEKS lets you put a tokenized stock to work in three steps: deposit
        it as collateral, borrow a stablecoin against it, and put that
        stablecoin into a yield venue. This guide walks through each screen
        and the numbers on it.
      </Lead>

      <Rule />

      {/* ── The three products ───────────────────────────────────── */}
      <Section id="products" title="The three products">
        <P>
          The sidebar is the product. Each entry does one distinct thing to
          your position, and they compose.
        </P>

        <Card
          href="/terminal/loop"
          title="Loop"
          blurb="Borrow against your collateral and route the borrowed stablecoin into a yield venue. The spread between the two rates is your carry."
        />
        <Card
          href="/terminal/earn"
          title="Earn"
          blurb="Lend a stablecoin to a single market and earn its supply APY. No collateral required."
        />
        <Card
          href="/terminal/borrow"
          title="Borrow"
          blurb="Draw a stablecoin loan against collateral you have already deposited. Useful on its own, and it is the first half of a loop."
        />
        <Card
          href="/terminal/portfolio"
          title="Portfolio"
          blurb="Everything you currently hold across markets, with live position value and health."
        />
      </Section>

      <Rule />

      {/* ── Loop ──────────────────────────────────────────────────── */}
      <Section id="loop" title="Loop: the full cycle">
        <P>
          A loop is three onchain actions that cancel out into a net
          position. You keep your stock exposure, and the stablecoin you
          borrowed earns something while your stock sits there as
          collateral.
        </P>

        <Step
          n={1}
          title="Supply collateral"
          body="Deposit the tokenized stock into the market. It earns supply APY and becomes your borrowing power."
        />
        <Step
          n={2}
          title="Borrow a stablecoin"
          body="Draw a stablecoin loan against that collateral. You pay borrow APY on it."
        />
        <Step
          n={3}
          title="Route into a yield venue"
          body="Send the borrowed stablecoin into a verified vault earning venue APY."
        />

        <Callout kind="info" title="What you end up with">
          The same stock exposure, minus the spread, plus the yield. Net carry
          is{" "}
          <Mono>venue APY − borrow APY − fees</Mono>.
        </Callout>
      </Section>

      <Rule />

      {/* ── Reading the numbers ───────────────────────────────────── */}
      <Section id="numbers" title="Reading the numbers">
        <P>
          Four figures drive every screen. They are not interchangeable, and
          mixing them up is the most common way to misread a position.
        </P>

        <Def
          term="Supply APY"
          desc="What you earn for supplying collateral into a market. Paid by borrowers."
        />
        <Def
          term="Borrow APY"
          desc="What you pay for drawing a loan. This is your ongoing cost of leverage."
        />
        <Def
          term="LLTV"
          desc="Loan-to-value threshold. The maximum the protocol will let you borrow against a position, set per market. It is the liquidation boundary — not a target."
        />
        <Def
          term="LTV"
          desc="How much you have actually borrowed, as a share of collateral value. Always keep it well under LLTV."
        />

        <Callout kind="warn" title="LLTV is a cliff, not a slope">
          At LLTV your collateral can be liquidated against the loan. Aim to
          sit far below it. Because stock prices move, a position that looks
          comfortable can cross the line without you doing anything.
        </Callout>
      </Section>

      <Rule />

      {/* ── Risk bands ────────────────────────────────────────────── */}
      <Section id="risk" title="How risk is banded">
        <P>
          The loop screen grades a position by comparing estimated LTV to
          the market&apos;s LLTV. The bands are fixed:
        </P>

        <Band tone="up" label="Safe" rule="LTV ≤ 50% of LLTV" />
        <Band
          tone="neutral"
          label="Caution"
          rule="50–80% of LLTV"
        />
        <Band
          tone="down"
          label="Danger"
          rule="LTV > 80% of LLTV"
        />

        <P>
          Bands are shown relative to LLTV rather than as raw percentages,
          because LLTV differs per market. The same raw LTV can be safe in a
          permissive market and dangerous in a strict one.
        </P>
      </Section>

      <Rule />

      {/* ── Fees ──────────────────────────────────────────────────── */}
      <Section id="fees" title="Fees and net carry">
        <P>
          Opening and closing a loop costs gas and venue fees. ZEKS carries
          them as a single flat estimate of{" "}
          <Mono>0.15%</Mono>, deducted from gross carry to produce the net
          figure.
        </P>

        <Callout kind="warn" title="Treat it as a hint">
          The 0.15% is deliberately coarse. Onchain fee telemetry is not yet
          wired in, so a thin net carry can be wiped out by real gas. Confirm
          the fee before you commit, and do not open a loop whose net carry
          is within a rounding error of zero.
        </Callout>
      </Section>

      <Rule />

      {/* ── Oracle ────────────────────────────────────────────────── */}
      <Section id="pricing" title="Which price you are looking at">
        <P>
          Every price in ZEKS is the token price, not the underlying share
          price. A tokenized AAPL is not quoted at the NASDAQ price — it
          tracks it through an issuer-set multiplier, so the two differ
          slightly and the gap moves over time.
        </P>

        <P>
          The consequence is worth internalizing: the historical chart, your
          position value, and the live quote all use the token price, so they
          stay consistent with each other. Expect them to differ from a
          conventional stock screener by a fraction of a percent.
        </P>
      </Section>

      <Rule />

      <Section id="next" title="Where to go next">
        <P>
          Start with Markets to see live liquidity, then open any market to
          read its chart and rates before committing anything.
        </P>
        <LinkRow href="/terminal/markets" label="Browse markets" />
        <LinkRow href="/terminal/portfolio" label="Review your positions" />
      </Section>
    </div>
  )
}

/* ── Local primitives ────────────────────────────────────────────── */

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "15px",
        lineHeight: 1.6,
        color: "var(--muted-foreground)",
        margin: "14px 0 0",
        maxWidth: "68ch",
      }}
    >
      {children}
    </p>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "13.5px",
        lineHeight: 1.65,
        color: "var(--foreground)",
        margin: "0 0 12px",
      }}
    >
      {children}
    </p>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="zeks-num"
      style={{
        fontSize: "12.5px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        borderRadius: "5px",
        padding: "1px 5px",
      }}
    >
      {children}
    </code>
  )
}

function Rule() {
  return (
    <hr
      style={{
        border: 0,
        borderTop: "1px solid var(--border)",
        margin: "30px 0",
      }}
    />
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ scrollMarginTop: "80px" }}>
      <h2
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "17px",
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--foreground)",
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Card({
  href,
  title,
  blurb,
}: {
  href: string
  title: string
  blurb: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        padding: "13px 15px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card-soft)",
        marginBottom: "8px",
        transition: "border-color 130ms ease-out",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13.5px",
          fontWeight: 600,
          color: "var(--foreground)",
          marginBottom: "3px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {blurb}
      </div>
    </Link>
  )
}

function Step({
  n,
  title,
  body,
}: {
  n: number
  title: string
  body: string
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "10px 0",
        borderTop: "1px solid var(--border)",
      }}
    >
      <span
        aria-hidden="true"
        className="zeks-num"
        style={{
          flexShrink: 0,
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "11px",
          color: "var(--muted-foreground)",
          border: "1px solid var(--border)",
          marginTop: "1px",
        }}
      >
        {n}
      </span>
      <div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13.5px",
            fontWeight: 600,
            color: "var(--foreground)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "12.5px",
            lineHeight: 1.55,
            color: "var(--muted-foreground)",
            marginTop: "2px",
          }}
        >
          {body}
        </div>
      </div>
    </div>
  )
}

function Def({ term, desc }: { term: string; desc: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "14px",
        padding: "9px 0",
        borderTop: "1px solid var(--border)",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: "104px",
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        {term}
      </span>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {desc}
      </span>
    </div>
  )
}

function Band({
  tone,
  label,
  rule,
}: {
  tone: Tone
  label: string
  rule: string
}) {
  const color =
    tone === "up"
      ? "var(--up)"
      : tone === "down"
        ? "var(--down)"
        : "var(--muted-foreground)"
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "9px 0",
        borderTop: "1px solid var(--border)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flexShrink: 0,
          width: "104px",
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        {label}
      </span>
      <span
        className="zeks-num"
        style={{
          fontSize: "12.5px",
          color: "var(--muted-foreground)",
        }}
      >
        {rule}
      </span>
    </div>
  )
}

function Callout({
  kind,
  title,
  children,
}: {
  kind: "info" | "warn"
  title: string
  children: React.ReactNode
}) {
  const color = kind === "warn" ? "var(--down)" : "var(--foreground)"
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card-soft)",
        borderLeft: `2px solid ${color}`,
        margin: "14px 0",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          fontWeight: 600,
          color: "var(--foreground)",
          marginBottom: "4px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "12.5px",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="docs-link-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "11px 14px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card-soft)",
        textDecoration: "none",
        marginBottom: "8px",
        fontFamily: "var(--font-sans)",
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--foreground)",
      }}
    >
      {label}
      <span aria-hidden="true" style={{ color: "var(--muted-foreground)" }}>
        →
      </span>
    </Link>
  )
}
