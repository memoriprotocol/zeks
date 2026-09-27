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
  icon: React.ComponentType<LucideIconProps>
}

type LucideIconProps = {
  size?: number
  strokeWidth?: number | string
  className?: string
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
 * AppSidebar — narrow Loopr-style icon rail (76px).
 *
 *   Width: 76px
 *   Top:    ZEKS logo only
 *   Middle: icon + tiny label nav (active = soft sage + small lime dot)
 *   Bottom: live status dot
 *
 *   Secondary to the product content. Quiet, not a brand panel.
 */
export default function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 zeks-shell-sidebar"
      aria-label="Primary navigation"
      style={{
        width: "var(--shell-sidebar-w)",
        backgroundColor: "var(--background)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* ── Brand block (logo only — no frame) ─────────────────────────── */}
      <div
        style={{
          padding: "18px 0 14px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
            width: "44px",
            height: "44px",
          }}
        >
          <img
            src="/assets/brand/zeks-logo.png"
            alt="ZEKS"
            width={36}
            height={36}
            style={{
              display: "block",
              objectFit: "contain",
              objectPosition: "center",
            }}
          />
        </Link>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav
        aria-label="Page navigation"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          padding: "6px 12px",
          flex: 1,
          gap: "2px",
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
                height: "54px",
                paddingLeft: "3px",
                paddingRight: "3px",
                marginTop: "1px",
                marginBottom: "1px",
                textDecoration: "none",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                backgroundColor: isActive ? "var(--card-soft)" : "transparent",
                borderRadius: "10px",
                transition: "background-color 130ms ease-out, color 130ms ease-out",
                position: "relative",
                outline: "none",
                whiteSpace: "nowrap",
                fontSize: "10px",
                fontWeight: isActive ? 600 : 500,
                fontFamily: "var(--font-sans)",
                letterSpacing: "0.005em",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--card-soft)"
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
              <Icon size={18} strokeWidth={1.7} />
              <span
                style={{
                  lineHeight: 1.1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                  color: "inherit",
                }}
              >
                {item.label}
              </span>
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "12px",
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    backgroundColor: "var(--primary)",
                  }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom status ───────────────────────────────────── */}
      <div
        style={{
          padding: "10px 0 12px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          className="zeks-anim-pulse"
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "var(--up)",
          }}
        />
      </div>
    </aside>
  )
}
