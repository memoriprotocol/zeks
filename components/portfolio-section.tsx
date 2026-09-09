import AssetLogo from "@/components/asset-logo"

export default function PortfolioSection() {
  // Mock presentation sparkline data (presentation UI only)
  const sparkline = [40, 42, 41, 45, 48, 47, 50, 53, 52, 56, 58, 61, 64, 63, 67, 70]
  const min = Math.min(...sparkline)
  const max = Math.max(...sparkline)
  const range = max - min || 1
  const w = 280
  const h = 60
  const stepX = w / (sparkline.length - 1)
  const points = sparkline
    .map((v, i) => {
      const x = i * stepX
      const y = h - ((v - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const areaPoints = `0,${h} ${points} ${w},${h}`

  const timeframes = ["1D", "1W", "1M", "1Y"] as const

  const allocations = [
    { label: "Stocks", percent: 48 },
    { label: "Crypto", percent: 22 },
    { label: "Stablecoins", percent: 18 },
    { label: "Yield", percent: 12 },
  ]

  const positions = [
    { ticker: "AAPL", value: "$28,420", tag: "STOCK" },
    { ticker: "NVDA", value: "$18,281", tag: "STOCK" },
    { ticker: "ETH", value: "$12,281", tag: "CRYPTO" },
    { ticker: "USDG", value: "$24,210", tag: "STABLE" },
  ]

  return (
    <section id="portfolio" className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-12 items-start">
          {/* LEFT: label + headline + copy + CTA */}
          <div className="md:col-span-2">
            <span className="zeks-label" style={{ fontSize: "11px" }}>
              PORTFOLIO_INTELLIGENCE
            </span>
            <h2 className="font-serif text-3xl md:text-4xl mt-4 leading-tight tracking-tight">
              Every position.
              <br />
              One view.
            </h2>
            <p className="text-muted-foreground text-sm mt-4 leading-relaxed max-w-xs">
              Track tokenized stocks, crypto, stablecoins and onchain positions from a single portfolio.
            </p>

            <div className="mt-8">
              <a
                href="#portfolio"
                className="text-sm font-mono text-foreground hover:underline"
              >
                View Portfolio →
              </a>
            </div>
          </div>

          {/* RIGHT: one premium interface container */}
          <div className="md:col-span-3">
            <div className="bg-card border border-border rounded-2xl divide-y divide-border">

              {/* 1. Portfolio value header */}
              <div className="p-6">
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div>
                    <p className="zeks-label-inline">Portfolio Value</p>
                    <p className="font-serif text-2xl md:text-3xl mt-1 tabular-nums tracking-tight">$128,482.21</p>
                  </div>
                  <div className="text-right">
                    <p className="zeks-label-inline">Today</p>
                    <p className="font-serif text-lg mt-1 tabular-nums tracking-tight">+$2,842.18</p>
                    <p className="zeks-num-sm text-muted-foreground mt-0.5">+2.26%</p>
                  </div>
                </div>
              </div>

              {/* 2. Sparkline + timeframe */}
              <div className="p-6">
                <svg
                  viewBox={`0 0 ${w} ${h}`}
                  className="w-full h-16"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <polygon
                    points={areaPoints}
                    fill="currentColor"
                    className="text-primary/10"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  />
                </svg>

                <div className="flex gap-1 mt-4">
                  {timeframes.map((t, i) => (
                    <button
                      key={t}
                      type="button"
                      className={
                        "text-xs font-mono px-3 py-1 rounded-md transition-colors " +
                        (i === 0
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Allocation */}
              <div className="p-6">
                <p className="zeks-label-inline">Allocation</p>

                {/* Single thin segmented bar */}
                <div className="flex h-1.5 w-full mt-4 overflow-hidden rounded-full bg-secondary">
                  {allocations.map((a, i) => (
                    <div
                      key={a.label}
                      className={
                        "h-full " +
                        (i === 0
                          ? "bg-primary"
                          : i === 1
                          ? "bg-foreground/70"
                          : i === 2
                          ? "bg-foreground/40"
                          : "bg-foreground/20")
                      }
                      style={{ width: `${a.percent}%` }}
                      aria-label={`${a.label} ${a.percent}%`}
                    />
                  ))}
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
                  {allocations.map((a) => (
                    <div key={a.label} className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">{a.label}</span>
                      <span className="zeks-num-sm">{a.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Positions */}
              <div className="p-6">
                <p className="zeks-label-inline">Positions</p>
                <ul className="mt-4 divide-y divide-border">
                  {positions.map((p) => (
                    <li
                      key={p.ticker}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AssetLogo
                          symbol={p.ticker}
                          name={p.ticker}
                          size={24}
                          shape="rounded"
                        />
                        <span className="font-mono text-[12px]">{p.ticker}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.tag}</span>
                      </div>
                      <span className="font-serif text-[14px] tracking-tight">{p.value}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 5. Footer */}
              <div className="px-6 py-4">
                <span className="font-mono text-[10px] text-muted-foreground opacity-60">
                  DEMO_DATA · PRESENTATION_ONLY
                </span>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
