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
 * AppSidebar (v3 — Loopr-density)
 *
 * Narrow, icon-first navigation with a subtle active indicator
 *   - Width: 168px
 *   - Soft lime-accent active state (no harsh rectangle)
 *   - Secondary network info tucked in the footer (no chrome bar
 *     duplicated with the header)
 */
export default function AppSidebar({ current }: AppSidebarProps) {
  return (
    <aside className="hidden md:flex w-[168px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="h-12 px-4 flex items-center border-b border-sidebar-border">
        <Link
          href="/terminal"
          className="flex items-center gap-1.5"
          aria-label="ZEKS"
        >
          <span
            aria-hidden="true"
            className="relative inline-flex w-1.5 h-1.5 shrink-0"
          >
            <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          </span>
          <span className="font-serif text-[15px] font-semibold tracking-tight text-sidebar-foreground leading-none">
            ZEKS
          </span>
        </Link>
      </div>

      {/* Primary nav — icon-first, soft active */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon
          const active = current === item.key
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors " +
                (active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60")
              }
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
                />
              ) : null}
              <Icon className="w-[15px] h-[15px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer — slim network line, no chrome bar duplication */}
      <div className="px-4 py-3 border-t border-sidebar-border space-y-1">
        <p className="text-[10px] font-mono tracking-wider text-muted-foreground/70">
          NETWORK
        </p>
        <p className="text-xs text-foreground font-medium">Robinhood Chain</p>
        <p className="text-[10px] font-mono text-muted-foreground">
          Live · Morpho
        </p>
      </div>
    </aside>
  )
}
