import { Check, Lock, Zap } from "lucide-react"

export default function OnchainFinanceSection() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-start justify-between mb-16">
          <div>
            <span className="text-xs font-mono text-muted-foreground tracking-wider">ONCHAIN_FINANCE</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-4 max-w-lg leading-tight">
              Stocks meet Web3.
            </h2>
          </div>
          <p className="text-muted-foreground text-sm max-w-xs hidden md:block">
            Move seamlessly between tokenized assets, liquidity and onchain yield.
          </p>
        </div>

        {/* Top row features */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {/* Tokenized Assets */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <span className="text-xs font-mono text-muted-foreground">FIELD</span>
              <span className="text-xs font-mono text-muted-foreground">TOKENIZED_ASSETS</span>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-card rounded-full px-3 py-1 border border-border">
                  <div className="w-4 h-4 rounded-full bg-foreground" />
                  <div className="w-4 h-4 rounded-full border-2 border-border" />
                </div>
                <div className="flex-1 h-1 bg-border rounded-full">
                  <div className="w-2/3 h-full bg-foreground rounded-full" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">FRACTIONAL</span>
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-2">Tokenized Assets</h3>
            <p className="text-sm text-muted-foreground">
              Access financial assets in onchain form.
            </p>
          </div>

          {/* Onchain Markets */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <span className="text-xs font-mono text-muted-foreground">FIELD</span>
              <span className="text-xs font-mono text-muted-foreground">ONCHAIN_MARKETS</span>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 mb-6">
              <div className="grid grid-cols-3 gap-2">
                {["AAPL", "TSLA", "NVDA", "ETH", "USDG", "More"].map((app, i) => (
                  <div
                    key={app}
                    className={`text-center p-2 rounded-lg ${i < 5 ? "bg-card border border-border" : "border border-dashed border-border"}`}
                  >
                    <div className="w-6 h-6 mx-auto mb-1 rounded bg-secondary flex items-center justify-center">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {app === "More" ? "+" : app.charAt(0)}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{app}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <span className="text-[10px] font-mono text-accent-foreground bg-accent px-2 py-0.5 rounded">
                  + MORE
                </span>
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-2">Onchain Markets</h3>
            <p className="text-sm text-muted-foreground">Discover and compare markets from one interface.</p>
          </div>

          {/* Self-Custody */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <span className="text-xs font-mono text-muted-foreground">FIELD</span>
              <span className="text-xs font-mono text-muted-foreground">SELF_CUSTODY</span>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 mb-6 flex items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-accent flex items-center justify-center">
                  <Lock className="w-6 h-6 text-foreground" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              </div>
            </div>
            <h3 className="font-semibold text-lg mb-2">Self-Custody</h3>
            <p className="text-sm text-muted-foreground">
              Keep control of your assets while interacting onchain.
            </p>
          </div>
        </div>

        {/* Bottom row features */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Capital Efficiency */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex gap-6">
              <div className="bg-secondary/50 rounded-xl p-4 flex-shrink-0">
                <div className="relative w-20 h-20 rounded-full border-4 border-accent flex items-center justify-center">
                  <Zap className="w-8 h-8 text-foreground" />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">METRIC</span>
                </div>
                <h3 className="font-semibold text-2xl mb-1">Capital Efficiency</h3>
                <p className="text-sm text-muted-foreground">
                  Use eligible assets across multiple financial workflows.
                </p>
              </div>
            </div>
          </div>

          {/* Real-Time Portfolio */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground">OUTPUT</span>
                </div>
                <h3 className="font-semibold text-2xl mb-1">Real-Time Portfolio</h3>
                <p className="text-sm text-muted-foreground">
                  Track positions, liquidity and performance in one place.
                </p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-4 flex-shrink-0">
                <div className="flex gap-1">
                  {["5", "0", "0", "+"].map((num, i) => (
                    <div
                      key={i}
                      className="w-8 h-10 bg-card border border-border rounded flex items-center justify-center"
                    >
                      <span className="font-mono text-lg">{num}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
