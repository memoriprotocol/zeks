import LaunchAppButton from "@/components/launch-app-button"

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Main hero area */}
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-full px-3 py-1">
              <span>ONCHAIN FINANCIAL INFRASTRUCTURE</span>
            </div>

            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl leading-[1.1] text-balance">
              Your assets.
              <br />
              Working for you.
            </h1>

            <p className="text-muted-foreground text-lg max-w-md">
              One financial layer for tokenized assets and onchain markets on Robinhood Chain.
            </p>

            <LaunchAppButton
              variant="primary"
              withArrow
              className="px-6 py-3"
            />
          </div>

          {/* Right visual */}
          <div className="relative">
            {/* Interface mockup container */}
            <div className="relative bg-secondary/50 rounded-3xl p-8 border border-border/50">
              {/* Top labels */}
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-4">
                <span>NO.01 — LEDGER.AGGREGATE</span>
                <span>DEMO_DATA · PRESENTATION_ONLY</span>
              </div>

              {/* Sticky note */}
              <div className="absolute -left-4 top-20 bg-card p-3 rounded shadow-sm rotate-[-3deg] border border-border w-36">
                <p className="text-xs font-mono text-foreground/80">PORTFOLIO_VALUE</p>
                <p className="text-sm font-serif italic mt-1">$24,821.40</p>
              </div>

              {/* Sparkline panel */}
              <div className="bg-ink rounded-2xl p-6 my-6 mx-auto max-w-sm">
                <div className="flex justify-between text-[8px] text-white/70 font-mono mb-2 px-2">
                  <span>24H RETURN</span>
                  <span>+$428.21 / +1.76%</span>
                </div>
                <div className="text-[10px] text-white/80 font-mono mb-4 px-2">
                  <p>Assets:</p>
                  <p>AAPL · TSLA · NVDA · ETH · USDG</p>
                </div>
                <div className="bg-ink/80 rounded-xl p-3 text-chart-lime">
                  <svg viewBox="0 0 200 60" className="w-full h-[88px]" aria-hidden="true">
                    <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" strokeDasharray="2 3" />
                    <line x1="0" y1="40" x2="200" y2="40" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.5" strokeDasharray="2 3" />
                    <path d="M0 42 L18 38 L36 40 L54 30 L72 32 L90 24 L108 28 L126 18 L144 22 L162 14 L180 18 L200 8 L200 60 L0 60 Z" fill="currentColor" fillOpacity="0.18" />
                    <path d="M0 42 L18 38 L36 40 L54 30 L72 32 L90 24 L108 28 L126 18 L144 22 L162 14 L180 18 L200 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="200" cy="8" r="2" fill="currentColor" />
                  </svg>
                </div>
              </div>

              {/* Chat bubbles */}
              <div className="absolute -right-2 top-32 space-y-2">
                <div className="bg-card border border-border rounded-xl p-3 shadow-sm max-w-[180px]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-secondary rounded-full" />
                    <span className="text-xs font-medium">Borrow</span>
                    <span className="text-[10px] text-muted-foreground">AVAILABLE</span>
                  </div>
                  <p className="text-xs text-muted-foreground">$6,284</p>
                </div>

                <div className="bg-card border border-border rounded-xl p-3 shadow-sm max-w-[200px]">
                  <button className="text-xs text-ink-foreground bg-primary hover:bg-primary/90 transition-colors px-2 py-1 rounded">
                    Earn Yield →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
