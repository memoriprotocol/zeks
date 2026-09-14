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
  CircleDot,
} from "lucide-react"

/** ZEKS logo mark — inline SVG, 32px, matching public/icon.svg identity */
function ZeksLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ZEKS"
      role="img"
    >
      {/* Dark background for the logo mark */}
      <rect width="180" height="180" rx="37" fill="#1A1814" />
      <g transform="translate(9, 9) scale(0.9)">
        <path
          d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z"
          fill="#B7F34A"
        />
        <path
          d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z"
          fill="#B7F34A"
        />
      </g>
    </svg>
  )
}

interface NavItem {
  key: string
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview",  label: "Dashboard",  href: "/terminal",           icon: LayoutGrid },
  { key: "markets",   label: "Markets",    href: "/terminal/markets",   icon: LineChart  },
  { key: "loop",      label: "Loop",       href: "/terminal/loop",     icon: RefreshCw  },
  { key: "earn",      label: "Earn",       href: "/terminal/earn",     icon: Coins      },
  { key: "borrow",    label: "Borrow",     href: "/terminal/borrow",   icon: Banknote   },
  { key: "portfolio", label: "Portfolio",  href: "/terminal/portfolio", icon: Briefcase  },
  { key: "activity",  label: "Activity",   href: "/terminal/activity",  icon: Activity   },
]

/**
 * AppSidebar — fixed left rail with brand + icon + label navigation.
 *
 * Layout:
 *   ┌──────────┐
 *   │  ZEKS    │  ← brand block (60px), logo + divider
 *   │  logo    │
 *   ├──────────┤
 *   │ Dashboard│  ← nav items: icon + label, 56px each
 *   │ Markets  │
 *   │ Loop     │
 *   │ Earn     │
 *   │ Borrow   │
 *   │ Portfolio│
 *   │ Activity │
 *   ├──────────┤
 *   │  ● Live  │  ← bottom status (40px)
 *   └──────────┘
 *
 * Active state: soft lime-tinted background, lime left indicator.
 * Width: 72px fixed.
 * Fixed positioning so it stays in place while content scrolls.
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
          height: "60px",
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
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ZeksLogo size={34} />
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
                gap: "3px",
                height: "56px",
                paddingLeft: "4px",
                paddingRight: "4px",
                textDecoration: "none",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                backgroundColor: isActive ? "var(--sidebar-accent)" : "transparent",
                borderRadius: "10px",
                marginLeft: "6px",
                marginRight: "6px",
                marginTop: "1px",
                marginBottom: "1px",
                transition: "background-color 130ms ease-out, color 130ms ease-out",
                position: "relative",
                outline: "none",
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
              <Icon size={18} />
              <span
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono, 'Courier New', monospace)",
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  paddingLeft: "2px",
                  paddingRight: "2px",
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
          height: "40px",
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
