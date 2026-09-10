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
 * AppSidebar — 64px icon-only rail (measured reference spec).
 *
 * Slim chrome · tooltip labels on hover.
 */
export default function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside
      className="hidden md:flex shrink-0 flex-col border-r border-border bg-sidebar zeks-shell-sidebar"
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <Link
        href="/terminal"
        aria-label="ZEKS"
        className="h-12 flex items-center justify-center border-b border-sidebar-border"
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
        className="flex-1 py-2 flex flex-col items-stretch gap-1"
        style={{ padding: "8px 8px" }}
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
                "group relative flex items-center justify-center rounded-md transition-colors " +
                (active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60")
              }
              style={{ height: "36px", width: "48px", alignSelf: "center" }}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-primary"
                />
              ) : null}
              <Icon className="w-[16px] h-[16px] shrink-0" />
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
