import Link from "next/link"
import {
  LayoutGrid,
  LineChart,
  Coins,
  RefreshCw,
  Banknote,
  Briefcase,
  Activity,
} from "lucide-react"

interface AppSidebarProps {
  /** Current route key, used to mark active item */
  current?: string
}

interface NavItem {
  key: string
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const PRIMARY_NAV: NavItem[] = [
  { key: "overview",  label: "Overview",  href: "/terminal",            icon: LayoutGrid },
  { key: "markets",   label: "Markets",   href: "/terminal/markets",   icon: LineChart },
  { key: "loop",      label: "Loop",      href: "/terminal/loop",      icon: RefreshCw },
  { key: "earn",      label: "Earn",      href: "/terminal/earn",      icon: Coins },
  { key: "borrow",    label: "Borrow",    href: "/terminal/borrow",    icon: Banknote },
  { key: "portfolio", label: "Portfolio", href: "/terminal/portfolio", icon: Briefcase },
  { key: "activity",  label: "Activity",  href: "/terminal/activity",  icon: Activity },
]

/**
 * AppSidebar — 64px icon-only rail.
 *
 * Slim chrome · tooltip labels on hover.
 * - Brand block aligned to header (48px).
 * - Nav items have a 44px hit area and 36px visual badge, both
 *   horizontally centered in the rail.
 */
export default function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside
      className="hidden md:flex shrink-0 flex-col bg-sidebar zeks-shell-sidebar"
      aria-label="Primary navigation"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      {/* Brand — aligned to header height */}
      <Link
        href="/terminal"
        aria-label="ZEKS"
        className="h-12 flex items-center justify-center"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          aria-hidden="true"
          className="relative inline-flex w-2 h-2 shrink-0"
        >
          <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
          <span className="relative inline-block w-2 h-2 rounded-full bg-primary" />
        </span>
      </Link>

      {/* Primary nav */}
      <nav
        className="flex-1 py-2 flex flex-col items-center gap-px"
        style={{ paddingTop: 12, paddingBottom: 12 }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          const active = current === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={
                "group relative flex items-center justify-center transition-colors " +
                (active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
              style={{
                height: "44px",
                width: "100%",
              }}
            >
              <span
                className="relative flex items-center justify-center rounded-md"
                style={{
                  height: 36,
                  width: 40,
                  backgroundColor: active ? "var(--secondary)" : "transparent",
                  transition: "background-color 140ms ease-out",
                }}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      left: -12,
                      top: 7,
                      bottom: 7,
                      width: 2,
                      borderRadius: "0 2px 2px 0",
                      backgroundColor: "var(--primary)",
                    }}
                  />
                ) : null}
                <Icon className="w-[16px] h-[16px] shrink-0" />
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
