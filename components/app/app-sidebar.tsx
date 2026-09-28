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
  BookOpen,
} from "lucide-react"
import { DOCS_URL, DOCS_IS_EXTERNAL } from "@/lib/config/surface-urls"

interface NavItem {
  key: string
  label: string
  href: string
  icon: React.ComponentType<LucideIconProps>
  /**
   * Off-app destination. Rendered as a plain anchor opening in a new
   * tab rather than a next/link, because the client router can only
   * resolve paths inside this deployment.
   */
  external?: boolean
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
  { key: "docs",       label: "Docs",     href: DOCS_URL,              icon: BookOpen, external: DOCS_IS_EXTERNAL },
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
          const isActive = !item.external && pathname === item.href
          const itemStyle = (active: boolean): React.CSSProperties => ({
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
            color: active ? "var(--foreground)" : "var(--muted-foreground)",
            backgroundColor: active ? "var(--card-soft)" : "transparent",
            borderRadius: "10px",
            transition:
              "background-color 130ms ease-out, color 130ms ease-out",
            position: "relative",
            outline: "none",
            whiteSpace: "nowrap",
            fontSize: "10px",
            fontWeight: active ? 600 : 500,
            fontFamily: "var(--font-sans)",
            letterSpacing: "0.005em",
          })
          const hoverProps = {
            onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = "var(--card-soft)"
                e.currentTarget.style.color = "var(--foreground)"
              }
            },
            onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = "transparent"
                e.currentTarget.style.color = "var(--muted-foreground)"
              }
            },
          }
          const inner = (
            <>
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
            </>
          )

          // Off-app destination: a plain anchor. next/link would
          // hand the URL to the client router, which cannot resolve
          // a path that does not exist on this deployment.
          if (item.external) {
            return (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${item.label} (opens in a new tab)`}
                style={itemStyle(false)}
                {...hoverProps}
              >
                {inner}
              </a>
            )
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              style={itemStyle(isActive)}
              {...hoverProps}
            >
              {inner}
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
