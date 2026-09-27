import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
const sql = neon(url)

const aapl = await sql`
  SELECT "timestamp" AS ts, price
    FROM price_history
   WHERE symbol = 'AAPL'
   ORDER BY "timestamp"
`
const now = new Date()
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

function fmt(d) { return d.toISOString() }
function countSince(rows, since) {
  return rows.filter((r) => new Date(r.ts).getTime() >= since.getTime()).length
}

console.log('NOW     :', fmt(now))
console.log('1D_AGO  :', fmt(oneDayAgo))
console.log('1W_AGO  :', fmt(oneWeekAgo))
console.log('1M_AGO  :', fmt(oneMonthAgo))
console.log('---')
console.log('AAPL total rows :', aapl.length)
console.log('AAPL in 1D      :', countSince(aapl, oneDayAgo))
console.log('AAPL in 1W      :', countSince(aapl, oneWeekAgo))
console.log('AAPL in 1M      :', countSince(aapl, oneMonthAgo))
console.log('---')
console.log('AAPL min_ts     :', aapl[0]?.ts)
console.log('AAPL max_ts     :', aapl[aapl.length - 1]?.ts)
console.log('Days since max  :', ((now.getTime() - new Date(aapl[aapl.length - 1]?.ts).getTime()) / 86400000).toFixed(2))
