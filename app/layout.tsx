import type React from "react"
import type { Metadata } from "next"
import { Inter, DM_Sans, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { IS_DOCS_SURFACE, IS_APP_SURFACE } from "@/lib/config/surface"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })

/**
 * One repo, two deployments. Canonical URLs and social metadata
 * must name the domain the visitor is actually on, otherwise both
 * surfaces claim the same canonical address and search engines
 * collapse them into one.
 */
const SITE_ORIGIN = IS_DOCS_SURFACE
  ? process.env.NEXT_PUBLIC_DOCS_ORIGIN?.trim() || "https://docs.zeks.fund"
  : "https://app.zeks.fund"

const siteTitle = IS_DOCS_SURFACE
  ? "ZEKS Docs — Tokenized stock lending"
  : "ZEKS — Onchain Markets & Capital"

const siteDescription = IS_DOCS_SURFACE
  ? "How the loop works, how to read the numbers, where the risk sits, and which price you are actually looking at."
  : "Tokenized assets, onchain markets, trading, yield, borrowing and portfolio infrastructure for Robinhood Chain."

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  keywords: IS_DOCS_SURFACE
    ? ["ZEKS docs", "tokenized stock lending", "loop strategy", "net carry", "LTV", "LLTV", "Morpho", "Robinhood Chain"]
    : ["onchain", "tokenized assets", "onchain markets", "trading", "yield", "borrowing", "portfolio", "Robinhood Chain"],
  authors: [{ name: "ZEKS" }],
  creator: "ZEKS",
  publisher: "ZEKS",
  metadataBase: new URL(SITE_ORIGIN),
  alternates: {
    canonical: SITE_ORIGIN,
  },
  robots: IS_APP_SURFACE
    ? undefined
    : { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_ORIGIN,
    siteName: "ZEKS",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    creator: "@zeks",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
