import Header from "@/components/header"
import HeroSection from "@/components/hero-section"
import OnchainFinanceSection from "@/components/onchain-finance-section"
import MarketsSection from "@/components/markets-section"
import BorrowSection from "@/components/borrow-section"
import YieldSection from "@/components/yield-section"
import PortfolioSection from "@/components/portfolio-section"
import CTASection from "@/components/cta-section"
import Footer from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <OnchainFinanceSection />
      <MarketsSection />
      <BorrowSection />
      <YieldSection />
      <PortfolioSection />
      <CTASection />
      <Footer />
    </main>
  )
}
