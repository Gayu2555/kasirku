import { getSettings, getShifts, getStats } from '@/lib/data'
import { rupiah, tanggal } from '@/lib/format'
import { requireOwner } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  await requireOwner()
  const s = await getStats()
  const shifts = await getShifts(7)
  const settings = await getSettings()
  const labaKotor = s.monthRevenue - s.monthHpp
  const labaBersih = s.monthIncome - s.monthExpense
  const targetPct = settings.daily_target > 0 ? Math.min(100, Math.round((s.todayRevenue / settings.daily_target) * 100)) : 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">{settings.store_name} — ringkasan usaha hari ini & bulan ini</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="label">Pendapatan hari ini</div>
          <div className="value">{rupiah(s.todayRevenue)}</div>
          <div className="sub">{s.todayCount} transaksi</div>
        </div>
        <div className="card stat">
          <div className="label">Laba kotor bulan ini</div>
          <div className="value">{rupiah(labaKotor)}</div>
          <div className="sub">Penjualan − HPP</div>
        </div>
        <div className="card stat">
          <div className="label">Pengeluaran bulan ini</div>
          <div className="value">{rupiah(s.monthExpense)}</div>
          <div className="sub">Semua kategori</div>
        </div>
        <div className="card stat">
          <div className="label">Laba bersih bulan ini</div>
          <div className="value">{rupiah(labaBersih)}</div>
          <div className="sub">Pendapatan − pengeluaran</div>
        </div>
      </div>

      {settings.daily_target > 0 && (
        <div className="card" style={{ marginTop: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ color: 'var(--ink)' }}>Target harian {rupiah(settings.daily_target)}</strong>
            {targetPct >= 100
              ? <span className="badge ok">Target tercapai!</span>
              : <span className="muted">{targetPct}% · kurang {rupiah(Math.max(settings.daily_target - s.todayRevenue, 0))}</span>}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${targetPct}%` }} />
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Stok menipis</h2>
          {s.lowStock.length === 0 ? (
            <p className="muted">Semua stok aman.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th className="num">Sisa</th>
                  <th className="num">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {s.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="num">
                      <span className="badge low">
                        {p.stock} {p.unit}
                      </span>
                    </td>
                    <td className="num">{p.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="section-title">Transaksi terakhir</h2>
          {s.recentSales.length === 0 ? (
            <p className="muted">Belum ada penjualan. Buka halaman Kasir untuk mulai transaksi.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Struk</th>
                  <th>Waktu</th>
                  <th>Metode</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      {sale.receipt_no}
                      {sale.voided_at && <span className="badge low" style={{ marginLeft: 6 }}>Void</span>}
                    </td>
                    <td>{tanggal(sale.created_at)}</td>
                    <td><span className="badge auto">{{ tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' }[sale.payment_method]}</span></td>
                    <td className="num">{rupiah(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 className="section-title">Riwayat shift</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Kasir</th>
              <th>Dibuka</th>
              <th>Ditutup</th>
              <th className="num">Seharusnya</th>
              <th className="num">Dihitung</th>
              <th className="num">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((sh) => (
              <tr key={sh.id}>
                <td>{sh.user_email}</td>
                <td>{tanggal(sh.opened_at)}</td>
                <td>{sh.closed_at ? tanggal(sh.closed_at) : <span className="badge ok">Buka</span>}</td>
                <td className="num">{sh.expected_cash !== null ? rupiah(sh.expected_cash) : rupiah(sh.opening_cash + sh.sales_cash)}</td>
                <td className="num">{sh.counted_cash !== null ? rupiah(sh.counted_cash) : '—'}</td>
                <td className="num">
                  {sh.difference === null ? '—' : (
                    <span className={`badge ${sh.difference === 0 ? 'ok' : 'low'}`}>{rupiah(sh.difference)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}