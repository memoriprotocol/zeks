import type React from "react"
import type { Metadata } from "next"
import { Inter, DM_Sans, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" })
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })

export const metadata: Metadata = {
  title: "ZEKS — Onchain Markets & Capital",
  description: "Tokenized assets, onchain markets, trading, yield, borrowing and portfolio infrastructure for Robinhood Chain.",
  keywords: ["onchain", "tokenized assets", "onchain markets", "trading", "yield", "borrowing", "portfolio", "Robinhood Chain"],
  authors: [{ name: "ZEKS" }],
  creator: "ZEKS",
  publisher: "ZEKS",
  metadataBase: new URL("https://zeks.fun"),
  alternates: {
    canonical: "https://zeks.fun",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zeks.fun",
    siteName: "ZEKS",
    title: "ZEKS — Onchain Markets & Capital",
    description: "Tokenized assets, onchain markets, trading, yield, borrowing and portfolio infrastructure for Robinhood Chain.",
  },
  twitter: {
    card: "summary",
    title: "ZEKS — Onchain Markets & Capital",
    description: "Tokenized assets, onchain markets, trading, yield, borrowing and portfolio infrastructure for Robinhood Chain.",
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
