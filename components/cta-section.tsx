import Link from "next/link"
import LaunchAppButton from "@/components/launch-app-button"

export default function CTASection() {
  return (
    <section id="cta" className="py-24 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="bg-card border border-border rounded-2xl p-12 md:p-16">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-mono text-muted-foreground tracking-wider">
              ONCHAIN_FINANCE
            </span>
            <h2 className="font-serif text-4xl md:text-5xl mt-4 mb-4 leading-tight">
              Put your capital
              <br />
              onchain.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Trade, earn, borrow and manage tokenized assets from one financial layer.
            </p>

            <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
              <LaunchAppButton
                variant="primary"
                withArrow
                className="px-5 py-2.5"
              />
              <Link
                href="#markets"
                className="inline-flex items-center gap-2 bg-transparent text-foreground border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary transition-colors"
              >
                Explore Markets
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
