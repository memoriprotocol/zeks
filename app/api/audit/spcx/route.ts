/**
 * GET /api/audit/spcx
 *
 * DEVELOPMENT-ONLY diagnostic for SPCX upstream identity tracing.
 * Surfaces the raw `/rhj/assets` row for SPCX and the raw
 * `/rhj/prices/SPCX` response, plus the normalized quote result.
 *
 * Gated behind NODE_ENV !== "production" so it is never exposed in
 * production builds. Used to diagnose the SPCX canonical upstream
 * identifier so the card and ticker can display the real reference
 * price when the upstream actually provides one.
 *
 * No mutations. No writes. Read-only.
 */

import { NextResponse } from "next/server"
import {
  ROBINHOOD_API_BASE,
  robinhoodHeaders,
  fetchWithTimeout,
} from "@/lib/markets/http"
import { normalizeAsset, normalizeQuote } from "@/lib/markets/normalize"
import { fetchRobinhoodAssets } from "@/lib/markets/robinhood-assets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SYMBOL = "SPCX"
const TIMEOUT_MS = 6_000

function summarizeQuoteRow(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return { kind: "not-object" }
  const r = raw as Record<string, unknown>
  const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
  const pick = (key: string): unknown => r[key] ?? r[snake(key)]
  return {
    tokenSymbol: pick("tokenSymbol") ?? null,
    symbol: pick("symbol") ?? null,
    tokenContractAddress:
      pick("tokenContractAddress") ?? pick("contractAddress") ?? null,
    instrumentId: pick("instrumentId") ?? null,
    rhid: pick("rhid") ?? null,
    id: pick("id") ?? null,
    bid: pick("bid") ?? null,
    ask: pick("ask") ?? null,
    price: pick("price") ?? null,
    markPrice: pick("markPrice") ?? null,
    lastPrice: pick("lastPrice") ?? null,
    referencePrice: pick("referencePrice") ?? null,
    previousClose: pick("previousClose") ?? null,
    currency: pick("currency") ?? null,
    generatedAt: pick("generatedAt") ?? null,
    isTradingHalt: pick("isTradingHalt") ?? null,
    dailyTradingVolume: pick("dailyTradingVolume") ?? null,
    fullKeys: Object.keys(r),
  }
}

async function fetchRawQuotes(symbol: string): Promise<{
  status: number
  ok: boolean
  body: unknown
  listLength: number
  rows: unknown[]
}> {
  const url = `${ROBINHOOD_API_BASE}/rhj/prices/${encodeURIComponent(symbol)}`
  try {
    const res = await fetchWithTimeout(url, {
      headers: robinhoodHeaders(),
      cache: "no-store",
      timeoutMs: TIMEOUT_MS,
    })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    let arr: unknown[] = []
    if (Array.isArray(body)) arr = body as unknown[]
    else if (body && typeof body === "object") {
      const b = body as Record<string, unknown>
      if (Array.isArray(b.quotes)) arr = b.quotes as unknown[]
      else if (Array.isArray(b.data)) arr = b.data as unknown[]
      else if (Array.isArray(b.results)) arr = b.results as unknown[]
      else arr = [body]
    }
    return {
      status: res.status,
      ok: res.ok,
      body,
      listLength: arr.length,
      rows: arr,
    }
  } catch (err) {
    return {
      status: 0,
      ok: false,
      body: err instanceof Error ? err.message : String(err),
      listLength: 0,
      rows: [],
    }
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, message: "dev-only" },
      { status: 404 },
    )
  }

  // 1. Inspect /rhj/assets — does SPCX appear in upstream asset list?
  let upstreamAssetRaw: unknown[] = []
  let spcxAssetNormalized: Record<string, unknown> | null = null
  try {
    const assetsUrl = `${ROBINHOOD_API_BASE}/rhj/assets`
    const res = await fetchWithTimeout(
      assetsUrl,
      {
        headers: robinhoodHeaders(),
        cache: "no-store",
        timeoutMs: TIMEOUT_MS,
      },
    )
    const body = await res.json()
    upstreamAssetRaw = Array.isArray(body)
      ? (body as unknown[])
      : body && typeof body === "object"
        ? Array.isArray((body as Record<string, unknown>).results)
          ? ((body as Record<string, unknown>).results as unknown[])
          : Array.isArray((body as Record<string, unknown>).assets)
            ? ((body as Record<string, unknown>).assets as unknown[])
            : []
        : []

    const spcxRaw = upstreamAssetRaw.find((r) => {
      if (!r || typeof r !== "object") return false
      const rr = r as Record<string, unknown>
      const sym =
        typeof rr.tokenSymbol === "string"
          ? rr.tokenSymbol.toUpperCase()
          : typeof rr.symbol === "string"
            ? rr.symbol.toUpperCase()
            : ""
      return sym === SYMBOL
    })
    const normalized = spcxRaw ? normalizeAsset(spcxRaw) : null
    spcxAssetNormalized = normalized
      ? {
          id: normalized.id,
          symbol: normalized.symbol,
          displayName: normalized.displayName,
          contractAddress: normalized.contractAddress,
          logoUrl: normalized.logoUrl,
          status: normalized.status,
          tokenDecimals: normalized.tokenDecimals,
          currentMultiplier: normalized.currentMultiplier,
        }
      : null
  } catch {
    upstreamAssetRaw = []
  }

  // 2. Inspect /rhj/prices/SPCX — does the quote endpoint return data?
  const raw = await fetchRawQuotes(SYMBOL)
  const normalizedRows = raw.rows.map((r) => {
    const n = normalizeQuote(r)
    return {
      raw: summarizeQuoteRow(r),
      normalized: n
        ? {
            symbol: n.symbol,
            bid: n.bid,
            ask: n.ask,
            referencePrice: n.referencePrice,
            previousClose: n.previousClose,
            changePercent: n.changePercent,
            generatedAt: n.generatedAt,
            isTradingHalt: n.isTradingHalt,
          }
        : null,
    }
  })

  // 3. Also try the locally-cached canonical asset registry — does the
  //    project already register SPCX with a contract address?
  const localAssets = await fetchRobinhoodAssets()
  const localSpcx = localAssets.find((a) => a.symbol === SYMBOL)

  return NextResponse.json(
    {
      ok: true,
      symbol: SYMBOL,
      assetRegistry: {
        upstreamUniverseLength: upstreamAssetRaw.length,
        upstreamFound: spcxAssetNormalized != null,
        normalized: spcxAssetNormalized,
        localRegistry: localSpcx
          ? {
              symbol: localSpcx.symbol,
              contractAddress: localSpcx.contractAddress,
              id: localSpcx.id,
            }
          : null,
      },
      quoteEndpoint: {
        url: `${ROBINHOOD_API_BASE}/rhj/prices/${encodeURIComponent(SYMBOL)}`,
        status: raw.status,
        ok: raw.ok,
        listLength: raw.listLength,
        rows: normalizedRows,
      },
      verdict: {
        quoteFound: normalizedRows.some((r) => r.normalized != null),
        referencePriceFound: normalizedRows.some(
          (r) => r.normalized?.referencePrice != null,
        ),
        previousCloseFound: normalizedRows.some(
          (r) => r.normalized?.previousClose != null,
        ),
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  )
}
