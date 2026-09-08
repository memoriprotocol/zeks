"use client"

import { useState } from "react"
import AssetLogo from "@/components/asset-logo"

const tabs = ["All", "Tokenized Assets", "Crypto", "New Markets"]

const assets = [
  { ticker: "AAPL", price: "$231.42", change: "+1.82%", volume: "$12.4M", liquidity: "$8.2M", name: "Apple", up: true },
  { ticker: "TSLA", price: "$418.21", change: "-0.71%", volume: "$18.1M", liquidity: "$9.4M", name: "Tesla", up: false },
  { ticker: "NVDA", price: "$184.20", change: "+2.42%", volume: "$22.8M", liquidity: "$11.2M", name: "Nvidia", up: true },
  { ticker: "ETH", price: "$206.82", change: "+4.11%", volume: "$48.2M", liquidity: "$31.1M", name: "Ethereum", up: true },
  { ticker: "USDG", price: "$1.00", change: "+0.01%", volume: "$32.8M", liquidity: "$64.2M", name: "USDG", up: true },
]

export default function MarketsSection() {
  const [activeTab, setActiveTab] = useState("All")

  return (
    <section id="markets" className="py-24 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <span className="text-xs font-mono text-muted-foreground tracking-wider">MARKET_INTELLIGENCE</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-4 max-w-md leading-tight">
              Markets, without
              <br />
              the noise.
            </h2>
          </div>
          <p className="text-muted-foreground text-sm max-w-xs hidden md:block">
            Discover tokenized assets and emerging markets across Robinhood Chain.
          </p>
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 px-6 pt-6 pb-4">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-mono px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === tab
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-5 px-6 pb-3 border-b border-border">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Asset</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider text-right">Price</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider text-right">24H</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider text-right">Volume</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider text-right">Liquidity</span>
          </div>

          {/* Table rows */}
          {assets.map((asset, i) => (
            <div
              key={asset.ticker}
              className={`grid grid-cols-5 px-6 py-4 items-center ${
                i < assets.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <AssetLogo symbol={asset.ticker} name={asset.name} size={30} />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-mono font-semibold text-foreground">
                    {asset.ticker}
                  </span>
                  {asset.name && (
                    <span className="text-xs text-muted-foreground truncate">
                      {asset.name}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-mono text-right">{asset.price}</span>
              <span className={`text-sm font-mono text-right ${asset.up ? "text-up" : "text-down"}`}>
                {asset.change}
              </span>
              <span className="text-sm font-mono text-muted-foreground text-right">{asset.volume}</span>
              <span className="text-sm font-mono text-muted-foreground text-right">{asset.liquidity}</span>
            </div>
          ))}

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <span className="text-xs font-mono text-muted-foreground">DEMO_DATA · PRESENTATION_ONLY</span>
            <a
              href="#"
              className="text-sm font-mono text-foreground hover:underline"
            >
              Explore Markets →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
