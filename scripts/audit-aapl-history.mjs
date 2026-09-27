import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('NO DATABASE_URL')
  process.exit(1)
}
const sql = neon(url)

const all = await sql`
  SELECT symbol,
         COUNT(*)::int AS n,
         MIN("timestamp") AS min_ts,
         MAX("timestamp") AS max_ts
    FROM price_history
   GROUP BY symbol
   ORDER BY symbol
`
console.log('PER_SYMBOL:', JSON.stringify(all, null, 2))

const aapl = await sql`
  SELECT "timestamp", price, source
    FROM price_history
   WHERE symbol = 'AAPL'
   ORDER BY "timestamp"
`
console.log('AAPL_ROWS:', JSON.stringify(aapl, null, 2))

const now = Math.floor(Date.now() / 1000)
const oneDayAgo = now - 86400
const inWindow = await sql`
  SELECT COUNT(*)::int AS n
    FROM price_history
   WHERE symbol = 'AAPL'
     AND "timestamp" >= TO_TIMESTAMP(${oneDayAgo})
     AND "timestamp" <= TO_TIMESTAMP(${now})
`
console.log('AAPL_IN_1D_NOW:', JSON.stringify(inWindow))
console.log('now=', now, 'oneDayAgo=', oneDayAgo)
