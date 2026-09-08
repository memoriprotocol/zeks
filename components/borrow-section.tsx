import AssetLogo from "@/components/asset-logo"

export default function BorrowSection() {
  return (
    <section id="borrow" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-12 items-center">
          {/* Left: headline + explanation */}
          <div className="md:col-span-2">
            <span className="text-xs font-mono text-muted-foreground tracking-wider">LIQUIDITY</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-4 leading-tight">
              Access capital.
              <br />
              Keep your position.
            </h2>
            <p className="text-muted-foreground text-sm mt-4 leading-relaxed">
              Use eligible tokenized assets as collateral and access onchain liquidity without exiting your position.
            </p>
          </div>

          {/* Right: borrowing interface card */}
          <div className="md:col-span-3">
            <div className="bg-card border border-border rounded-2xl p-8">
              {/* Collateral column */}
              <div className="grid md:grid-cols-3 gap-0 divide-x divide-border">
                {/* Collateral */}
                <div className="pr-6">
                  <div className="mb-1">
                    <span className="text-xs font-mono text-muted-foreground">COLLATERAL</span>
                  </div>
                  <div className="mt-4 mb-2">
                    <div className="inline-flex items-center gap-2 bg-secondary rounded-full px-3 py-1 border border-border">
                      <AssetLogo symbol="AAPL" name="Apple" size={20} shape="circle" />
                      <span className="text-sm font-mono font-medium">AAPL</span>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mb-4">Tokenized Stock</p>
                  <div className="mt-6">
                    <p className="text-xs font-mono text-muted-foreground mb-1">Collateral Value</p>
                    <p className="text-xl font-serif">$20,000</p>
                  </div>
                </div>

                {/* Arrow divider */}
                <div className="px-6 flex flex-col items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 rounded-full border border-border flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">↓</span>
                    </div>
                    <div className="w-px h-8 bg-border" />
                  </div>
                </div>

                {/* Borrow */}
                <div className="pl-6">
                  <div className="mb-1">
                    <span className="text-xs font-mono text-muted-foreground">BORROW</span>
                  </div>
                  <div className="mt-4 mb-2">
                    <p className="text-xs font-mono text-muted-foreground mb-1">Receive</p>
                    <div className="flex items-center gap-2">
                      <AssetLogo symbol="USDG" name="USDG" size={20} shape="circle" />
                      <span className="text-sm font-mono font-medium">USDG</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-mono text-muted-foreground mb-1">Amount</p>
                    <p className="text-xl font-serif">$5,000</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">Available to Borrow</p>
                      <p className="text-sm font-mono">$11,000</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">Estimated APR</p>
                      <p className="text-sm font-mono">2.81%</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">Health</p>
                      <p className="text-sm font-mono text-primary">SAFE</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border my-6" />

              {/* Action row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">DEMO_DATA · PRESENTATION_ONLY</span>
                <button className="bg-foreground text-background text-sm font-mono px-5 py-2 rounded-full hover:opacity-80 transition-opacity">
                  Borrow USDG →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
