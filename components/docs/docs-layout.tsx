"use client"

/**
 * Docs layout — independent of the app shell.
 *
 * A documentation site has different navigation than a trading
 * terminal, so this page deliberately does NOT use AppShell and
 * does NOT import the product sidebar. It is a self-contained
 * scroll container with its own doc rail.
 *
 * Design: ZEKS light theme (cream) with lime accent, matching the
 * product. Layout is a two-column grid — sticky doc rail on the
 * left, single reading column on the right.
 *
 * The doc rail is position:sticky rather than a fixed element, so
 * it scrolls naturally with the page and needs no JS to stay put.
 */

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import {
  DOC_GROUPS,
  DOC_HERO_STATS,
  DOC_LAST_UPDATED,
} from "./docs-content"
import { DocsBody } from "./docs-body"

export default function DocsLayout() {
  const [active, setActive] = React.useState<string>("")

  // Highlight the section nearest the top of the viewport.
  // IntersectionObserver is the right tool: it fires on scroll
  // without a scroll listener re-running on every frame.
  React.useEffect(() => {
    const ids = DOC_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null)
    if (els.length === 0) return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      // A band near the top of the viewport defines "current".
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div
      data-testid="docs-root"
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--background)",
          opacity: 0.97,
        }}
      >
        <div
          style={{
            maxWidth: "1240px",
            margin: "0 auto",
            padding: "0 28px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
          }}
        >
          <Link
            href="/docs"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              textDecoration: "none",
              color: "var(--foreground)",
            }}
          >
            <img
              src="/assets/brand/zeks-logo.png"
              alt="ZEKS"
              width={22}
              height={22}
              style={{ display: "block", objectFit: "contain" }}
            />
            <span style={{ fontSize: "14.5px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              ZEKS{" "}
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>
                Docs
              </span>
            </span>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <RailLink href="/terminal">App</RailLink>
            <RailLink href="/terminal/markets">Markets</RailLink>
            <a
              href="#"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "13px",
                fontWeight: 500,
                textDecoration: "none",
                padding: "6px 13px",
                borderRadius: "7px",
                backgroundColor: "var(--primary)",
                color: "#15130F",
              }}
            >
              Launch App
              <ArrowUpRight size={14} strokeWidth={2.2} />
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section
        className="zeks-docs-hero"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "76px 28px 40px",
        }}
      >
        <h1
          className="zeks-display"
          style={{
            fontSize: "clamp(30px, 4.4vw, 46px)",
            lineHeight: 1.14,
            letterSpacing: "-0.028em",
            maxWidth: "17ch",
            margin: 0,
            fontWeight: 500,
          }}
        >
          Your stock keeps its job. Your capital gets a second one.
        </h1>

        <p
          style={{
            margin: "20px 0 0",
            fontSize: "16px",
            lineHeight: 1.62,
            color: "var(--muted-foreground)",
            maxWidth: "62ch",
          }}
        >
          ZEKS is an execution layer for tokenized stock positions. It borrows
          against a stock you already hold and deploys the borrowed dollars
          into a yield venue, then closes the whole position the same way. You
          keep the stock the entire time.
        </p>

        {/* Stat row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0",
            marginTop: "44px",
            borderTop: "1px solid var(--border)",
            paddingTop: "22px",
          }}
        >
          {DOC_HERO_STATS.map((s, i) => (
            <div
              key={s.label}
              className="zeks-docs-stat"
              style={{
                paddingRight: 48,
                marginRight: 48,
                borderRight:
                  i < DOC_HERO_STATS.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: "11.5px",
                  fontWeight: 500,
                  color: "var(--muted-foreground)",
                  marginBottom: "3px",
                }}
              >
                {s.label}
              </div>
              <div
                className="zeks-num-lg"
                style={{ fontSize: "23px", color: "var(--foreground)" }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Body: rail + reading column ─────────────────────────── */}
      <div
        className="zeks-docs-grid"
        style={{
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "34px 28px 96px",
        }}
      >
        {/* Doc rail — sticky on desktop, horizontal scroller below 1000px */}
        <nav aria-label="Documentation" className="zeks-docs-rail">
          {DOC_GROUPS.map((grp) => (
            <div key={grp.group} className="zeks-docs-rail-group" style={{ marginBottom: "22px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted-foreground)",
                  marginBottom: "8px",
                  paddingLeft: "9px",
                }}
              >
                {grp.group}
              </div>
              {grp.items.map((item) => {
                const isActive = active === item.id
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    aria-current={isActive ? "location" : undefined}
                    style={{
                      display: "flex",
                      gap: "8px",
                      padding: "4px 9px",
                      borderRadius: "6px",
                      textDecoration: "none",
                      fontSize: "13px",
                      lineHeight: 1.4,
                      color: isActive
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                      fontWeight: isActive ? 600 : 500,
                      backgroundColor: isActive
                        ? "var(--card-soft)"
                        : "transparent",
                      transition: "color 120ms ease-out, background-color 120ms ease-out",
                    }}
                  >
                    <span
                      className="zeks-num"
                      style={{
                        fontSize: "10.5px",
                        color: isActive
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                        opacity: isActive ? 1 : 0.65,
                        flexShrink: 0,
                        marginTop: "1px",
                      }}
                    >
                      {item.num}
                    </span>
                    <span>{item.title}</span>
                  </a>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Reading column */}
        <main style={{ maxWidth: "68ch", minWidth: 0 }}>
          <DocsBody />
        </main>
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "40px 28px 64px",
        }}
      >
        <div
          style={{
            maxWidth: "74ch",
            margin: "0 auto",
            fontSize: "12.5px",
            lineHeight: 1.65,
            color: "var(--muted-foreground)",
          }}
        >
          <p style={{ margin: "0 0 12px", fontWeight: 600, color: "var(--foreground)" }}>
            Not financial advice
          </p>
          <p style={{ margin: 0 }}>
            Borrowing against tokenized equity carries liquidation risk, and the
            price feeds behind that collateral do not update when markets are
            closed. Yield rates and borrowing costs float independently, and a
            position that is profitable when opened can become unprofitable
            while it is open. ZEKS does not operate the lending engine, the
            destination vaults, the price feeds, or the network it builds on;
            those are independent systems with their own risks.
          </p>
          <p style={{ margin: "14px 0 0", fontSize: "11.5px" }}>
            ZEKS · Protocol documentation · Robinhood Chain 4663 · Updated{" "}
            {DOC_LAST_UPDATED}
          </p>
        </div>
      </footer>
    </div>
  )
}

function RailLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: "13px",
        fontWeight: 500,
        color: "var(--muted-foreground)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  )
}
