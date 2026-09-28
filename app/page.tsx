import { IS_DOCS_SURFACE } from "@/lib/config/surface"
import DocsLayout from "@/components/docs/docs-layout"

import Header from "@/components/header"
import HeroSection from "@/components/hero-section"
import OnchainFinanceSection from "@/components/onchain-finance-section"
import MarketsSection from "@/components/markets-section"
import LaunchSection from "@/components/launch-section"
import BorrowSection from "@/components/borrow-section"
import YieldSection from "@/components/yield-section"
import PortfolioSection from "@/components/portfolio-section"
import CTASection from "@/components/cta-section"
import Footer from "@/components/footer"

/**
 * / — surface-aware root.
 *
 * This one route serves both deployments. A build-time branch is
 * used rather than a runtime hostname check because the two
 * deployments already ship different bundles; there is no shared
 * runtime to branch inside, and no redirect hop for the visitor.
 *
 * DocsLayout is imported at module scope in both cases, so a docs
 * deployment carries the docs bundle and an app deployment carries
 * the marketing bundle. That is the intent — see
 * lib/config/surface.ts.
 */
export default function Home() {
  if (IS_DOCS_SURFACE) {
    return <DocsLayout />
  }

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <OnchainFinanceSection />
      <MarketsSection />
      <LaunchSection />
      <BorrowSection />
      <YieldSection />
      <PortfolioSection />
      <CTASection />
      <Footer />
    </main>
  )
}
