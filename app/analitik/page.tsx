import { requireOwner } from '@/lib/auth/server'
import { getAnalytics, getBusyHours } from '@/lib/data'
import { BusyHeatmap, DailyChart, ProfitBars } from '@/components/Charts'
import { persen, rupiah } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function AnalitikPage() {
  await requireOwner()
  const { daily, products, methods } = await getAnalytics()
  const busy = await getBusyHours()
  const totalRev = daily.reduce((s, d) => s + d.revenue, 0)
  const totalCount = daily.reduce((s, d) => s + d.count, 0)
  const totalProfit = products.reduce((s, p) => s + p.profit, 0)
  const methodTotal = methods.reduce((s, m) => s + m.total, 0)
  const methodLabel = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' } as const

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analitik</h1>
          <p className="muted">Tren penjualan 30 hari & laba per produk</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="label">Penjualan 30 hari</div>
          <div className="value">{rupiah(totalRev)}</div>
        </div>
        <div className="card stat">
          <div className="label">Transaksi</div>
          <div className="value">{totalCount}</div>
        </div>
        <div className="card stat">
          <div className="label">Laba kotor 30 hari</div>
          <div className="value">{rupiah(totalProfit)}</div>
          <div className="sub">Penjualan − HPP</div>
        </div>
        <div className="card stat">
          <div className="label">Rata-rata / hari</div>
          <div className="value">{rupiah(totalRev / 30)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="section-title">Penjualan harian</h2>
        <DailyChart data={daily} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="section-title">Jam ramai (30 hari, WIB)</h2>
        <p className="muted" style={{ marginTop: 0 }}>Kapan pelanggan paling banyak datang — buat atur shift & siap-siap stok.</p>
        <BusyHeatmap matrix={busy.matrix} max={busy.max} peak={busy.peak} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 className="section-title">Metode pembayaran (30 hari)</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Metode</th>
              <th className="num">Transaksi</th>
              <th className="num">Omzet</th>
              <th className="num">Porsi</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.method}>
                <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{methodLabel[m.method]}</td>
                <td className="num">{m.count}</td>
                <td className="num">{rupiah(m.total)}</td>
                <td className="num">{methodTotal > 0 ? persen((m.total / methodTotal) * 100) : '—'}</td>
              </tr>
            ))}
            {methods.length === 0 && (
              <tr><td colSpan={4} className="muted">Belum ada penjualan.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Laba per produk</h2>
          <ProfitBars products={products} />
        </div>
        <div className="card">
          <h2 className="section-title">Detail produk</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th className="num">Terjual</th>
                <th className="num">Omzet</th>
                <th className="num">Laba</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.name}</td>
                  <td className="num">{p.qty}</td>
                  <td className="num">{rupiah(p.revenue)}</td>
                  <td className="num" style={{ color: 'var(--ok)', fontWeight: 600 }}>{rupiah(p.profit)}</td>
                  <td className="num">{p.price > 0 ? persen(((p.price - p.cost) / p.price) * 100) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}