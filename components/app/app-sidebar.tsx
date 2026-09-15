"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  LineChart,
  RefreshCw,
  Coins,
  Banknote,
  Briefcase,
  Activity,
} from "lucide-react"

interface NavItem {
  key: string
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview",   label: "Dashboard",  href: "/terminal",            icon: LayoutGrid  },
  { key: "markets",    label: "Markets",   href: "/terminal/markets",    icon: LineChart   },
  { key: "loop",       label: "Loop",      href: "/terminal/loop",      icon: RefreshCw   },
  { key: "earn",       label: "Earn",      href: "/terminal/earn",      icon: Coins      },
  { key: "borrow",     label: "Borrow",    href: "/terminal/borrow",    icon: Banknote    },
  { key: "portfolio",  label: "Portfolio", href: "/terminal/portfolio", icon: Briefcase   },
  { key: "activity",   label: "Activity", href: "/terminal/activity",  icon: Activity   },
]

/**
 * AppSidebar — fixed left rail: brand logo + icon + label navigation.
 *
 * Layout (top→bottom):
 *   ┌──────────┐
 *   │  ZEKS    │  ← 76px brand block, centered logo, divider below
 *   │  logo    │
 *   ├──────────┤
 *   │ Dashboard│  ← nav items: icon + label, 62px each
 *   │ Markets  │
 *   │ Loop     │
 *   │ Earn     │
 *   │ Borrow   │
 *   │ Portfolio│
 *   │ Activity │
 *   ├──────────┤
 *   │  ● Live  │  ← 44px bottom status
 *   └──────────┘
 *
 * Active: soft cream background, 3px lime left indicator, bold label.
 * Width: 92px — compact enough for a nav rail; all labels render fully.
 * Fixed positioning; does not scroll with page content.
 */
export default function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 zeks-shell-sidebar"
      aria-label="Primary navigation"
      style={{
        width: "var(--shell-sidebar-w)",
        backgroundColor: "var(--sidebar)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* ── Brand block ─────────────────────────────── */}
      <div
        style={{
          minHeight: "76px",
          padding: "12px 0 10px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/terminal"
          aria-label="ZEKS — back to Dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "60px",
            height: "60px",
            borderRadius: "14px",
            backgroundColor: "var(--sidebar-accent)",
            boxShadow: "0 1px 0 rgba(0,0,0,0.04) inset",
          }}
        >
          {/* ZEKS wordmark — sourced from /assets/brand/zeks-logo.png */}
          <img
            src="/assets/brand/zeks-logo.png"
            alt="ZEKS"
            width={52}
            height={52}
            style={{
              display: "block",
              objectFit: "contain",
              objectPosition: "center",
            }}
          />
        </Link>
      </div>

      {/* ── Navigation ───────────────────────────────── */}
      <nav
        aria-label="Page navigation"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          paddingTop: "8px",
          paddingBottom: "8px",
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                minHeight: "62px",
                paddingLeft: "3px",
                paddingRight: "3px",
                paddingTop: "7px",
                paddingBottom: "7px",
                marginLeft: "6px",
                marginRight: "6px",
                marginTop: "1px",
                marginBottom: "1px",
                textDecoration: "none",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                backgroundColor: isActive ? "var(--sidebar-accent)" : "transparent",
                borderRadius: "10px",
                transition: "background-color 130ms ease-out, color 130ms ease-out",
                position: "relative",
                outline: "none",
                whiteSpace: "nowrap",
                overflow: "visible",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--sidebar-accent)"
                  e.currentTarget.style.color = "var(--foreground)"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent"
                  e.currentTarget.style.color = "var(--muted-foreground)"
                }
              }}
            >
              {/* Lime left indicator */}
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "-6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "3px",
                    height: "32px",
                    borderRadius: "0 3px 3px 0",
                    backgroundColor: "var(--primary)",
                  }}
                />
              )}
              <Icon size={20} />
              <span
                style={{
                  fontSize: "10.5px",
                  fontFamily: "var(--font-mono, 'Courier New', monospace)",
                  fontWeight: isActive ? 600 : 500,
                  lineHeight: 1.1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                  color: "inherit",
                  letterSpacing: "0.01em",
                }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom status ───────────────────────────── */}
      <div
        style={{
          minHeight: "44px",
          padding: "6px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
          gap: "5px",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "var(--up, #22c55e)",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono, 'Courier New', monospace)",
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
            fontWeight: 400,
          }}
        >
          Live
        </span>
      </div>
    </aside>
  )
}
