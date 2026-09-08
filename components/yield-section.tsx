import AssetIdentity, { AssetIdentityItem } from "@/components/asset-identity"

export default function YieldSection() {
  const strategies: Array<{
    number: string
    name: string
    assets: AssetIdentityItem[]
    label: string
    apy: string
    risk: string
    liquidity: string
  }> = [
    {
      number: "01",
      name: "STABLE YIELD",
      assets: [{ symbol: "USDG", name: "USDG" }],
      label: "USDG",
      apy: "4.82%",
      risk: "LOW",
      liquidity: "HIGH",
    },
    {
      number: "02",
      name: "TOKENIZED ASSET STRATEGY",
      assets: [
        { symbol: "AAPL", name: "Apple" },
        { symbol: "USDG", name: "USDG" },
      ],
      label: "AAPL / USDG",
      apy: "8.42%",
      risk: "MEDIUM",
      liquidity: "MEDIUM",
    },
    {
      number: "03",
      name: "ONCHAIN LIQUIDITY",
      assets: [
        { symbol: "ETH", name: "Ethereum" },
        { symbol: "USDG", name: "USDG" },
      ],
      label: "ETH / USDG",
      apy: "7.18%",
      risk: "MEDIUM",
      liquidity: "HIGH",
    },
  ]

  return (
    <section id="earn" className="py-24 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-12 items-start">
          {/* Left: section label + headline + copy */}
          <div className="md:col-span-2">
            <span className="text-xs font-mono text-muted-foreground tracking-wider">YIELD_MARKETS</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-4 leading-tight">
              Put idle capital
              <br />
              to work.
            </h2>
            <p className="text-muted-foreground text-sm mt-4 leading-relaxed max-w-xs">
              Compare onchain opportunities and deploy assets into selected yield strategies.
            </p>

            {/* CTA */}
            <div className="mt-8">
              <a
                href="#earn"
                className="text-sm font-mono text-foreground hover:underline"
              >
                Explore Yield →
              </a>
            </div>
          </div>

          {/* Right: curated strategies interface */}
          <div className="md:col-span-3">
            <div className="bg-card border border-border rounded-2xl divide-y divide-border">
              {strategies.map((s) => (
                <div key={s.number} className="p-6 hover:bg-secondary/30 transition-colors group">
                  {/* Header row */}
                  <div className="flex items-baseline justify-between mb-3">
                    <div className="flex items-baseline gap-4">
                      <span className="text-xs font-mono text-muted-foreground">{s.number}</span>
                      <div>
                        <p className="text-sm font-mono font-medium tracking-wider">{s.name}</p>
                        <AssetIdentity
                          assets={s.assets}
                          size={22}
                          shape="rounded"
                          label={s.label}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-1">INDICATIVE APY</p>
                      <p className="text-xl font-serif">{s.apy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-1">RISK</p>
                      <p className="text-sm font-mono">{s.risk}</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-1">LIQUIDITY</p>
                      <p className="text-sm font-mono">{s.liquidity}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Footer row */}
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">DEMO_DATA · PRESENTATION_ONLY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
