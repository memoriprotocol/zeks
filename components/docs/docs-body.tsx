"use client"

/**
 * Docs body — the actual prose.
 *
 * Split from the layout so the reading column can be edited without
 * touching the rail or the IntersectionObserver.
 *
 * Accuracy rules applied throughout:
 *   · No invented numbers. Market names, chain id, fee estimate and
 *     risk thresholds match lib/markets/* exactly.
 *   · No promised features. Anything not shipped is either omitted
 *     or stated plainly as a limit, never as roadmap.
 *   · Risks are stated before benefits wherever they are the
 *     dominant fact — the 24/5 feed problem is the defining risk of
 *     equity collateral and is not buried.
 */

import * as React from "react"
import Link from "next/link"
import { APP_URL, APP_MARKETS_URL, APP_IS_EXTERNAL } from "@/lib/config/surface-urls"

/* ── Section ─────────────────────────────────────────────────────── */

function Sec({
  id,
  num,
  title,
  children,
}: {
  id: string
  num: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ marginBottom: "62px", scrollMarginTop: "86px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "11px", marginBottom: "18px" }}>
        <span
          className="zeks-num"
          style={{ fontSize: "12px", color: "var(--muted-foreground)", opacity: 0.7 }}
        >
          {num}
        </span>
        <h2
          style={{
            fontSize: "23px",
            fontWeight: 500,
            letterSpacing: "-0.018em",
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

/* ── Primitives ──────────────────────────────────────────────────── */

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 15px", fontSize: "15px", lineHeight: 1.68, color: "var(--foreground)" }}>
      {children}
    </p>
  )
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 15px", fontSize: "15px", lineHeight: 1.68, color: "var(--muted-foreground)" }}>
      {children}
    </p>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "16.5px",
        fontWeight: 600,
        letterSpacing: "-0.008em",
        margin: "30px 0 11px",
        lineHeight: 1.35,
      }}
    >
      {children}
    </h3>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="zeks-num"
      style={{
        fontSize: "13px",
        backgroundColor: "var(--card-soft)",
        border: "1px solid var(--border)",
        borderRadius: "5px",
        padding: "1.5px 5px",
      }}
    >
      {children}
    </code>
  )
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: "0 0 15px", paddingLeft: "20px", fontSize: "14.5px", lineHeight: 1.66 }}>
      {children}
    </ul>
  )
}

function LI({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: "8px" }}>{children}</li>
  )
}

/** Emphasis line — the one sentence a section turns on. */
function KeyLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "20px 0 22px",
        fontSize: "16.5px",
        lineHeight: 1.55,
        fontWeight: 500,
        letterSpacing: "-0.012em",
        color: "var(--foreground)",
        paddingLeft: "15px",
        borderLeft: "2px solid var(--primary)",
      }}
    >
      {children}
    </p>
  )
}

function Note({
  kind,
  title,
  children,
}: {
  kind: "info" | "warn"
  title: string
  children: React.ReactNode
}) {
  const accent = kind === "warn" ? "var(--down)" : "var(--muted-foreground)"
  return (
    <div
      style={{
        padding: "14px 17px",
        borderRadius: "10px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--card-soft)",
        borderLeft: `2px solid ${accent}`,
        margin: "18px 0",
      }}
    >
      <div style={{ fontSize: "13.5px", fontWeight: 600, marginBottom: "5px" }}>
        {title}
      </div>
      <div style={{ fontSize: "13.5px", lineHeight: 1.6, color: "var(--muted-foreground)" }}>
        {children}
      </div>
    </div>
  )
}

interface Col {
  h: string
  c: string[]
}

function Table({ head, rows }: { head: string[]; rows: (string | { text: string; strong?: boolean })[][] }) {
  const cell = (v: string | { text: string; strong?: boolean }) =>
    typeof v === "string" ? v : v.text
  const isStrong = (v: string | { text: string; strong?: boolean }) =>
    typeof v !== "string" && !!v.strong

  return (
    <div style={{ overflowX: "auto", margin: "18px 0 20px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "8px 14px 8px 0",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--muted-foreground)",
                  borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td
                  key={j}
                  style={{
                    padding: "9px 14px 9px 0",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontWeight: isStrong(v) ? 600 : 400,
                    lineHeight: 1.55,
                    verticalAlign: "top",
                  }}
                >
                  {cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Numbered flow — used for the loop steps and unwind steps. */
function Flow({ steps }: { steps: Col[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
        gap: "1px",
        backgroundColor: "var(--border)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        overflow: "hidden",
        margin: "20px 0 22px",
      }}
    >
      {steps.map((s, i) => (
        <div key={s.h} style={{ backgroundColor: "var(--background)", padding: "15px 15px 17px" }}>
          <div
            className="zeks-num"
            style={{ fontSize: "10.5px", color: "var(--muted-foreground)", opacity: 0.65 }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
          <div style={{ fontSize: "13.5px", fontWeight: 600, margin: "5px 0 4px", lineHeight: 1.3 }}>
            {s.h}
          </div>
          <div style={{ fontSize: "12.5px", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            {s.c[0]}
          </div>
        </div>
      ))}
    </div>
  )
}

function CalloutLinks() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", margin: "22px 0 8px" }}>
      <GoLink href={APP_MARKETS_URL}>Browse markets</GoLink>
      <GoLink href={`${APP_URL}/loop`}>Open a loop</GoLink>
      <GoLink href={`${APP_URL}/portfolio`}>Your positions</GoLink>
    </div>
  )
}

/**
 * Call-to-action into the terminal. On the docs deployment the
 * terminal is a different origin, so this must be a plain anchor
 * rather than next/link.
 */
function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 15px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--card-soft)",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--foreground)",
  }
  const inner = (
    <>
      {children}
      <span aria-hidden="true" style={{ color: "var(--muted-foreground)" }}>
        →
      </span>
    </>
  )
  if (APP_IS_EXTERNAL) {
    return (
      <a href={href} style={style}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} style={style}>
      {inner}
    </Link>
  )
}

/* ── Body ────────────────────────────────────────────────────────── */

export function DocsBody() {
  return (
    <>
      {/* 01 ──────────────────────────────────────────────────── */}
      <Sec id="what-is-zeks" num="01" title="What ZEKS is">
        <P>
          A tokenized stock in a wallet does one thing: it tracks a price. That
          is useful, and it is also the whole of it. The position produces
          nothing while you hold it, and the only way to get capital out of it
          is to sell.
        </P>
        <P>
          Lending markets solve half of that. You post the stock, you draw
          stablecoins against it, and you keep the exposure. But you are then
          holding borrowed dollars that cost you interest and earn you nothing
          until you go somewhere else and put them to work. That second step is
          a separate approval and a separate transaction that can fail on its
          own.
        </P>
        <KeyLine>
          ZEKS closes that gap. The borrow and the deployment are composed as
          one operation, so there is no state in which you hold idle borrowed
          dollars and a debt against your stock.
        </KeyLine>
        <P>
          Everything in this document builds on public infrastructure. ZEKS
          reads a lending market, routes into a yield venue, and prices
          collateral from a published feed. It does not operate the lending
          engine, the vaults, or the price feeds.
        </P>
      </Sec>

      {/* 02 ──────────────────────────────────────────────────── */}
      <Sec id="the-loop" num="02" title="The loop">
        <P>
          A loop is one position with two legs. The collateral leg holds your
          stock and carries debt. The yield leg holds the borrowed dollars
          where they earn. Treating them as one object is what makes entry and
          exit a single decision rather than a checklist.
        </P>
        <Flow
          steps={[
            { h: "Stock token", c: ["Your wallet"] },
            { h: "Isolated market", c: ["Collateral + debt"] },
            { h: "Stablecoin", c: ["Borrowed"] },
            { h: "Yield venue", c: ["Earning"] },
          ]}
        />
        <P>
          Entry runs left to right. Exit reverses it: redeem the venue position,
          repay the debt, withdraw the collateral.
        </P>

        <H3>Opening a position</H3>
        <UL>
          <LI>
            <strong>Supply collateral.</strong> Your stock token is deposited
            into its own isolated market. It stays yours. Nothing is sold, and
            price exposure is unchanged.
          </LI>
          <LI>
            <strong>Borrow a stablecoin.</strong> The engine draws dollars
            against that collateral at a loan-to-value ratio you choose, bounded
            by the market&apos;s liquidation LTV.
          </LI>
          <LI>
            <strong>Route into a venue.</strong> Those dollars go straight into
            an allowlisted market. They are never returned to your wallet as an
            intermediate step, which is what removes the window where a second
            transaction could fail.
          </LI>
        </UL>
        <UL>
          <LI>
            <strong>Compound.</strong> The venue position accrues. Your share
            count stays constant and each share becomes redeemable for more
            dollars over time.
          </LI>
        </UL>

        <Note kind="warn" title="Custody">
          The engine acts under approvals you grant and can revoke. It does not
          take discretionary custody between operations, and there is no step
          where your assets sit under protocol control waiting for someone else
          to act.
        </Note>
      </Sec>

      {/* 03 ──────────────────────────────────────────────────── */}
      <Sec id="net-carry" num="03" title="Net carry">
        <P>
          Most interfaces quote a gross yield, because a gross yield is the only
          number they can see. A venue knows its own rate. A lending market
          knows its own borrow rate. Neither knows what you actually made.
        </P>
        <KeyLine>
          Net carry is the only figure worth quoting on a loop:{" "}
          <Mono>venue APY − borrow APY − fees</Mono>
        </KeyLine>
        <P>
          Both inputs float. Venue rates move with demand for the strategy
          behind them. Borrow rates move with utilisation in the isolated
          market. A loop that is positive when you open it is not guaranteed to
          stay positive, and ZEKS shows a negative carry as negative rather than
          hiding it behind a headline APY.
        </P>

        <H3>Where leverage enters</H3>
        <P>
          Carry is a spread, and a spread is small. The multiplier on it is how
          much you borrow relative to your collateral — which is also the
          multiplier on your liquidation risk. Those are the same dial.
        </P>
        <P>
          Borrowing near the maximum LTV maximises the carry and minimises the
          room you have when the price moves against you overnight.
        </P>
        <Note kind="warn" title="On the maximum">
          The liquidation LTV is a boundary, not a recommendation. It is the
          point where you are liquidated, not the point you should aim for.
          Equity prices gap between sessions, and a gap does not give you time
          to react.
        </Note>
      </Sec>

      {/* 04 ──────────────────────────────────────────────────── */}
      <Sec id="markets" num="04" title="Markets">
        <P>
          Each supported stock has its own market, and each market is a fixed
          set of rules: the collateral asset, the borrowable asset, the oracle,
          the interest model, and the liquidation LTV. Those are set when the
          market is created and cannot be changed afterwards.
        </P>

        <H3>Why isolation matters here specifically</H3>
        <P>
          Tokenized equities do not share a risk profile. A company two decades
          into public trading and one three months past its IPO carry different
          event risk — and so do two megacaps in different sectors: trading
          halts, corporate actions, thin secondary liquidity. In a shared pool,
          a bad day in one name reaches every depositor. In an isolated design,
          the blast radius of any single stock is its own market.
        </P>
        <P>
          The cost of isolation is that liquidity is per market too. Dollars
          supplied against one stock can only be borrowed against that same
          stock.
        </P>

        <H3>The eight markets</H3>
        <Table
          head={["Symbol", "Company", "Collateral", "Borrowable"]}
          rows={[
            [{ text: "AAPL", strong: true }, "Apple", "AAPL", "USDG / USDC / USDT"],
            [{ text: "SPCX", strong: true }, "SpaceX", "SPCX", "USDG / USDC / USDT"],
            [{ text: "TSLA", strong: true }, "Tesla", "TSLA", "USDG / USDC / USDT"],
            [{ text: "NVDA", strong: true }, "Nvidia", "NVDA", "USDG / USDC / USDT"],
            [{ text: "GOOGL", strong: true }, "Alphabet", "GOOGL", "USDG / USDC / USDT"],
            [{ text: "AMZN", strong: true }, "Amazon", "AMZN", "USDG / USDC / USDT"],
            [{ text: "MSFT", strong: true }, "Microsoft", "MSFT", "USDG / USDC / USDT"],
            [{ text: "META", strong: true }, "Meta Platforms", "META", "USDG / USDC / USDT"],
          ]}
        />
        <Note kind="info" title="Why SPCX carries a lower LTV">
          SPCX is the newest listing of the eight. A shorter trading history
          gives less data to size a parameter against, and newly listed names
          generally trade wider than established ones until that history exists.
          The lower LTV is the conservative setting that follows. The exact LTV
          for each market is shown live in the Markets screen — read it there
          rather than relying on a number written in a document.
        </Note>
      </Sec>

      {/* 05 ──────────────────────────────────────────────────── */}
      <Sec id="oracles" num="05" title="Oracles and market hours">
        <P>
          This is the part of tokenized equity lending that has no analogue in
          crypto collateral, and it is where most of the real risk lives.
        </P>

        <H3>Pricing</H3>
        <P>
          Collateral is priced from a published feed, not from the raw ticker.
          For a stock token the relevant figure is not the headline share price
          but a total return value — the share price multiplied by a dividend
          and split multiplier. A dividend or a split changes what one token
          represents. Pricing the raw ticker and ignoring the multiplier would
          misvalue collateral in exactly the moments it matters.
        </P>

        <H3>The 24/5 problem</H3>
        <P>
          Stock feeds follow market hours. They update through the trading week
          and then stop. Overnight, over a weekend, and across a market holiday,
          the feed holds its last value. The chain keeps running, your debt keeps
          accruing interest, and the price of your collateral does not move
          because nobody is publishing a new one.
        </P>
        <UL>
          <LI>
            <strong>Your health factor is stale, not stable.</strong> A position
            that looks safe at 2am Sunday is priced off Friday&apos;s close. It
            is not evidence of anything.
          </LI>
          <LI>
            <strong>Gaps arrive fully formed.</strong> When the feed resumes it
            can jump straight to a new level. There is no gradual move to react
            to and no opportunity to add collateral on the way down.
          </LI>
          <LI>
            <strong>Liquidation can be immediate at the open.</strong> If the gap
            puts you past the liquidation LTV, you are liquidatable the moment
            the feed updates, not some time after.
          </LI>
        </UL>
        <KeyLine>
          Treat this as the defining property of equity collateral, not an edge
          case. A safe-looking health factor outside market hours is not
          information.
        </KeyLine>
      </Sec>

      {/* 06 ──────────────────────────────────────────────────── */}
      <Sec id="yield-venues" num="06" title="Yield venues">
        <P>
          Borrowed dollars are routed into an allowlisted market. ZEKS does not
          operate these venues and does not intend to. They are external
          protocols with their own contracts, curators, caps, and liquidity
          conditions.
        </P>
        <P>
          The reason is strategic and worth stating outright: a router that
          sends capital wherever the best net carry is available gets stronger
          as the ecosystem grows. A venue has to win on its own rate.
        </P>
        <Table
          head={["Loan asset", "Venue", "Risk tier"]}
          rows={[
            [{ text: "USDG", strong: true }, "USDG Supply", "Low"],
            [{ text: "USDC", strong: true }, "USDC Supply", "Low"],
            [{ text: "USDT", strong: true }, "USDT Supply", "Low"],
          ]}
        />

        <H3>How allowlisting works</H3>
        <P>
          Venues are allowlisted by exact contract address, not by name, curator,
          or interface. A loop can only route capital to an address on the list.
          This is a deliberately blunt mechanism: it is easy to verify from
          outside and hard to subvert from inside.
        </P>

        <H3>Compounding</H3>
        <P>
          Venue positions accrue through share price. You are not paid a stream
          of dollars and there is no claim button. Your share balance stays the
          same and each share becomes redeemable for more over time. The yield
          leg needs no maintenance from you.
        </P>

        <H3>Depositing without a loop</H3>
        <P>
          You can deposit a stablecoin you already hold directly into a venue
          with no collateral and no borrow leg. That path carries venue risk and
          liquidity risk, and carries no liquidation risk, because there is no
          debt. It is a different product with a different risk profile, and it
          should not be confused with a loop.
        </P>
      </Sec>

      {/* 07 ──────────────────────────────────────────────────── */}
      <Sec id="unwinding" num="07" title="Unwinding">
        <P>
          Opening a leveraged position is the easy half. Interfaces that make
          entry effortless and exit a four step manual process have solved the
          wrong problem.
        </P>
        <Flow
          steps={[
            { h: "Redeem venue", c: ["Shares back to dollars"] },
            { h: "Repay debt", c: ["Principal + interest"] },
            { h: "Withdraw collateral", c: ["Debt cleared"] },
            { h: "Back to wallet", c: ["Stock restored"] },
          ]}
        />
        <P>
          All four run under your authorisation as one operation. The engine
          does not need to hold your assets between unrelated steps to make it
          work.
        </P>

        <H3>What an unwind depends on</H3>
        <P>
          Composed execution does not mean unconditional. An unwind needs two
          external conditions to hold, and both sit outside ZEKS&apos; control:
        </P>
        <UL>
          <LI>
            <strong>Withdrawal liquidity in the venue.</strong> If the venue&apos;s
            own liquidity is constrained, redemption can be limited or delayed.
            Utilisation is a real dependency, not a footnote.
          </LI>
          <LI>
            <strong>The market accepting repayment and collateral
            withdrawal.</strong> Under normal conditions this always holds.
            Repayment and collateral recovery are the operations that survive
            every other kind of failure, including a stale or dead feed.
          </LI>
        </UL>

        <H3>Partial exits</H3>
        <P>
          You do not have to close the whole thing. Collateral can be added,
          debt can be repaid in part, and the position can be de-risked without
          unwinding it — which is usually the right response to a health factor
          drifting toward the line.
        </P>
      </Sec>

      {/* 08 ──────────────────────────────────────────────────── */}
      <Sec id="risk" num="08" title="Risk">
        <Lead>In rough order of how likely it is to actually cost you money.</Lead>
        <Table
          head={["Risk", "Mechanism", "What reduces it"]}
          rows={[
            [
              { text: "Overnight and weekend gaps", strong: true },
              "The feed is frozen while the world is not. Price can jump straight past your liquidation LTV.",
              "Borrowing well below the maximum. Monitoring around sessions and events.",
            ],
            [
              { text: "Liquidation", strong: true },
              "A health factor below 1 makes the position liquidatable by anyone, at a bonus paid out of your collateral.",
              "A wide buffer, and monitoring around sessions and events.",
            ],
            [
              { text: "Carry inversion", strong: true },
              "The borrow rate rises above the venue rate. The loop now costs you money continuously.",
              "Net carry as the displayed metric. Unwinding is immediate.",
            ],
            [
              { text: "Venue risk", strong: true },
              "Destination venues are third-party protocols. Their contracts, curators and strategies are outside ZEKS.",
              "Allowlisting by exact address. Reading the venue's own docs before routing to it.",
            ],
            [
              { text: "Venue liquidity", strong: true },
              "A constrained venue can limit or delay redemption, which delays your unwind.",
              "Prefer deeper venues. Treat utilisation as a live input.",
            ],
            [
              { text: "Oracle and issuer risk", strong: true },
              "Feed failure, issuer failure, or a corporate action handled badly upstream.",
              "Verification against the feed the interface already trusts. Reduces this risk; does not remove it.",
            ],
            [
              { text: "Smart contract risk", strong: true },
              "Bugs in the lending engine, the venues, or the interactions between them.",
              "Minimal new code over audited, immutable primitives.",
            ],
          ]}
        />
        <Note kind="warn" title="The honest counterpart">
          None of this protects you from the price of your collateral falling, or
          from a destination venue failing. Structure bounds what the protocol
          can do to you. It does not bound the market.
        </Note>
      </Sec>

      {/* 09 ──────────────────────────────────────────────────── */}
      <Sec id="reading-numbers" num="09" title="Reading the numbers">
        <P>
          Four figures drive every screen. They are not interchangeable, and
          mixing them up is the most common way to misread a position.
        </P>
        <Table
          head={["Figure", "Meaning"]}
          rows={[
            [
              { text: "Supply APY", strong: true },
              "What you earn for supplying collateral into a market. Paid by borrowers.",
            ],
            [
              { text: "Borrow APY", strong: true },
              "What you pay for drawing a loan. This is your ongoing cost of leverage.",
            ],
            [
              { text: "LLTV", strong: true },
              "Loan-to-value threshold. The maximum the protocol will let you borrow against a position, set per market. It is the liquidation boundary — not a target.",
            ],
            [
              { text: "LTV", strong: true },
              "How much you have actually borrowed, as a share of collateral value. Always keep it well under LLTV.",
            ],
          ]}
        />

        <H3>How risk is banded</H3>
        <P>
          The loop screen grades a position by comparing estimated LTV to the
          market&apos;s LLTV. The bands are fixed:
        </P>
        <Table
          head={["Band", "Rule"]}
          rows={[
            [{ text: "Safe", strong: true }, "LTV ≤ 50% of LLTV"],
            [{ text: "Caution", strong: true }, "50–80% of LLTV"],
            [{ text: "Danger", strong: true }, "LTV > 80% of LLTV"],
          ]}
        />
        <P>
          Bands are expressed relative to LLTV rather than as raw percentages,
          because LLTV differs per market. The same raw LTV can be safe in a
          permissive market and dangerous in a strict one.
        </P>
      </Sec>

      {/* 10 ──────────────────────────────────────────────────── */}
      <Sec id="fees" num="10" title="Fees">
        <P>Every cost in one place. If a cost is not on this list, it is not charged by ZEKS.</P>
        <Table
          head={["Item", "Charge", "Notes"]}
          rows={[
            [{ text: "Opening a loop", strong: true }, "None", "Gas only"],
            [{ text: "Unwinding a loop", strong: true }, "None", "Gas only. No exit penalty, no lockup"],
            [
              { text: "Borrow interest", strong: true },
              "Variable",
              "Set by the market's rate model against utilisation. Accrues continuously into your debt",
            ],
            [
              { text: "Protocol fee on interest", strong: true },
              "Market level",
              "Taken by the lending market from interest paid, never from principal or collateral",
            ],
            [
              { text: "Venue fees", strong: true },
              "Venue level",
              "Charged by the destination venue under its own terms, not by ZEKS",
            ],
            [
              { text: "Liquidation bonus", strong: true },
              "Market level",
              "Paid out of a liquidated borrower's collateral to whoever liquidates. Not protocol revenue",
            ],
            [{ text: "Deposit or withdrawal fee", strong: true }, "None", "No entry, exit or management fee"],
          ]}
        />

        <H3>The carried fee estimate</H3>
        <P>
          To show a net carry figure, the loop screen deducts a flat estimated
          cost of <Mono>0.15%</Mono> covering opening and closing a loop.
        </P>
        <Note kind="warn" title="Treat it as a hint, not a quote">
          The 0.15% is deliberately coarse. Onchain fee telemetry is not wired
          in, so a thin net carry can be wiped out by real gas. Confirm the fee
          before you commit, and do not open a loop whose net carry is within a
          rounding error of zero.
        </Note>
      </Sec>

      {/* 11 ──────────────────────────────────────────────────── */}
      <Sec id="pricing" num="11" title="Which price you are looking at">
        <P>
          Every price in ZEKS is the token price, not the underlying share price.
          A tokenized AAPL is not quoted at the NASDAQ price — it tracks it
          through an issuer-set multiplier, so the two differ slightly and the
          gap moves over time.
        </P>
        <P>
          The consequence is worth internalizing: the historical chart, your
          position value, and the live quote all use the token price, so they
          stay consistent with each other. Expect them to differ from a
          conventional stock screener by a fraction of a percent — and expect
          that gap to differ per symbol rather than being one constant.
        </P>
        <Note kind="info" title="Why charts show sparse early data">
          Token prices are not backfillable from a public feed in a form that
          matches what the app quotes. The chart is built from samples collected
          as they happen, so short ranges are sparse at first and fill in as
          data accumulates. It shows what has been measured, not an
          interpolated line.
        </Note>
      </Sec>

      {/* 12 ──────────────────────────────────────────────────── */}
      <Sec id="architecture" num="12" title="How the data works">
        <P>
          A short, honest account of where the numbers on each screen come
          from. It is here because the data provenance is the part most likely
          to be assumed rather than checked.
        </P>

        <H3>Live quotes</H3>
        <P>
          Prices, market rows and position reads are fetched server-side from
          the live market pipeline on Robinhood Chain (4663) through the
          lending interface. Quote responses are cached for a short window and
          labelled with the time they were fetched, so a stale figure is
          visible as stale rather than presented as current.
        </P>

        <H3>Historical charts</H3>
        <P>
          The chart does not query a third-party historical vendor. A scheduled
          job samples the same live price pipeline on an interval and writes
          each sample to storage. The chart reads back only what has actually
          been collected for the requested range.
        </P>
        <P>Two consequences follow from that, and both are deliberate:</P>
        <UL>
          <LI>
            <strong>No synthetic candles.</strong> A gap in collection is a gap
            in the line. Nothing is interpolated to hide it.
          </LI>
          <LI>
            <strong>Early ranges are sparse.</strong> A range needs two samples
            before it can draw a line, and reads as still-accumulating until
            enough points exist to plot.
          </LI>
        </UL>

        <H3>Rates and fees</H3>
        <P>
          Supply and borrow APYs are read from the market itself. The fee
          estimate shown on the loop screen is a constant carried in the
          interface, not a measured onchain value — see{" "}
          <a href="#fees" style={{ color: "var(--foreground)" }}>Fees</a>.
        </P>
      </Sec>

      {/* 13 ──────────────────────────────────────────────────── */}
      <Sec id="faq" num="13" title="FAQ">
        <H3>Do I still have exposure to the stock?</H3>
        <P>
          Yes. Nothing is sold. The token is collateral, not a disposal, and
          price exposure is unchanged for the entire life of the position. That
          is the whole reason to loop rather than to sell.
        </P>

        <H3>Can I lose the stock?</H3>
        <P>
          Yes, through liquidation. If the collateral&apos;s value falls far
          enough relative to your debt, the position can be liquidated and the
          collateral pays the liquidator a bonus. This is the primary risk, and
          it is not hypothetical for equity collateral that gaps between
          sessions.
        </P>

        <H3>What happens if the yield goes below the borrow rate?</H3>
        <P>
          The loop costs you money for as long as that holds. There is no
          lockup, so the response is to unwind or reduce the debt. This is
          exactly why net carry rather than gross yield is the number shown.
        </P>

        <H3>What if I want the yield without the leverage?</H3>
        <P>
          Deposit a stablecoin directly into a venue. No collateral, no borrow,
          no liquidation risk. You still carry venue and liquidity risk.
        </P>

        <H3>Is a loop the same as just supplying collateral?</H3>
        <P>
          No. Supplying alone earns supply APY with no borrowing cost and no
          liquidation risk. A loop adds a debt leg: more capital at work, and
          with it liquidation risk. Earn is the first, Loop is the second.
        </P>

        <H3>Why does my chart differ from a stock screener?</H3>
        <P>
          Because the app quotes the token, not the share. See{" "}
          <a href="#pricing" style={{ color: "var(--foreground)" }}>
            Which price you are looking at
          </a>
          . The chart, your position value, and the live quote all agree with
          each other; they simply are not the NASDAQ ticker.
        </P>

        <H3>Is ZEKS affiliated with the network or the vaults it uses?</H3>
        <P>
          No. ZEKS is an independent interface built on public infrastructure.
          Stock tokens and their price feeds are issued and operated by their
          respective providers.
        </P>

        <CalloutLinks />
      </Sec>
    </>
  )
}
