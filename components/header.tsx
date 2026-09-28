import Link from "next/link"
import LaunchAppButton from "@/components/launch-app-button"

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          {/* Minimal Z wordmark */}
          <span className="font-mono text-lg font-semibold tracking-tight text-foreground">ZEKS</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="#markets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Markets
          </Link>
          <Link href="/launchpad" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Launch
          </Link>
          <Link href="#earn" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Earn
          </Link>
          <Link href="#borrow" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Borrow
          </Link>
          <Link href="#portfolio" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Portfolio
          </Link>
        </nav>

        <LaunchAppButton
          variant="primary"
          withArrow={false}
          className="px-4 py-2"
        />
      </div>
    </header>
  )
}
