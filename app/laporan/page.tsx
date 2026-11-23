import { requireOwner } from '@/lib/auth/server'
import { getDailyReport, getSettings } from '@/lib/data'
import { persen, rupiah, tanggal } from '@/lib/format'
import LaporanActions from '@/components/LaporanActions'
import type { PayMethod } from '@/lib/types'

export const dynamic = 'force-dynamic'

const METHOD_LABEL: Record<PayMethod, string> = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' }

export default async function LaporanPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requireOwner()
  const { t } = await searchParams
  const today = new Date().toLocaleDateString('en-CA')
  const day = t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : today
  const r = await getDailyReport(day)
  const settings = await getSettings()

  const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const delta = r.prevRevenue > 0 ? ((r.revenue - r.prevRevenue) / r.prevRevenue) * 100 : null
  const netCash = r.income - r.expense

  const waText = [
    `*Laporan Harian ${settings.store_name} — ${dayLabel}*`,
    `Omzet: ${rupiah(r.revenue)} (${r.count} transaksi)`,
    `Laba kotor: ${rupiah(r.grossProfit)}`,
    ...r.methods.map((m) => `• ${METHOD_LABEL[m.method]}: ${rupiah(m.total)} (${m.count}x)`),
    `Kasbon baru: ${rupiah(r.kasbonBaru)} · Pelunasan: ${rupiah(r.pelunasan)}`,
    `Pendapatan kas: ${rupiah(r.income)} · Pengeluaran: ${rupiah(r.expense)}`,
    `Void: ${r.voidCount} transaksi (${rupiah(r.voidTotal)})`,
    r.shifts.length ? `Shift tutup: ${r.shifts.filter((s) => s.closed_at).length}` : '',
  ].filter(Boolean).join('\n')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Laporan harian</h1>
          <p className="muted">Rekap tutup buku per tanggal — cetak atau kirim ke WhatsApp</p>
        </div>
      </div>
      <LaporanActions day={day} waText={waText} />

      <div className="card laporan-sheet">
        <h2 style={{ marginTop: 0 }}>{settings.store_name} — Laporan Harian</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {dayLabel}
          {settings.store_address && <> · {settings.store_address}</>}
        </p>

        <div className="stat-grid">
          <div className="card stat">
            <div className="label">Omzet</div>
            <div className="value">{rupiah(r.revenue)}</div>
            <div className="sub">
              {r.count} transaksi
              {delta !== null && <> · {delta >= 0 ? '+' : ''}{persen(delta)} vs kemarin</>}
            </div>
          </div>
          <div className="card stat">
            <div className="label">Laba kotor</div>
            <div className="value">{rupiah(r.grossProfit)}</div>
            <div className="sub">Penjualan − HPP</div>
          </div>
          <div className="card stat">
            <div className="label">Arus kas bersih</div>
            <div className="value">{rupiah(netCash)}</div>
            <div className="sub">Masuk {rupiah(r.income)} · keluar {rupiah(r.expense)}</div>
          </div>
          <div className="card stat">
            <div className="label">Kasbon</div>
            <div className="value">{rupiah(r.kasbonBaru)}</div>
            <div className="sub">Pelunasan hari ini {rupiah(r.pelunasan)}</div>
          </div>
        </div>

        <h3>Metode pembayaran</h3>
        <table className="table">
          <thead>
            <tr><th>Metode</th><th className="num">Transaksi</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {r.methods.map((m) => (
              <tr key={m.method}>
                <td style={{ fontWeight: 600 }}>{METHOD_LABEL[m.method]}</td>
                <td className="num">{m.count}</td>
                <td className="num">{rupiah(m.total)}</td>
              </tr>
            ))}
            {r.methods.length === 0 && <tr><td colSpan={3} className="muted">Tidak ada penjualan.</td></tr>}
          </tbody>
        </table>

        <h3>Produk terlaris</h3>
        <table className="table">
          <thead>
            <tr><th>Produk</th><th className="num">Qty</th><th className="num">Omzet</th></tr>
          </thead>
          <tbody>
            {r.topProducts.map((p) => (
              <tr key={p.name}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="num">{p.qty}</td>
                <td className="num">{rupiah(p.revenue)}</td>
              </tr>
            ))}
            {r.topProducts.length === 0 && <tr><td colSpan={3} className="muted">Tidak ada item terjual.</td></tr>}
          </tbody>
        </table>

        <h3>Pengeluaran per kategori</h3>
        <table className="table">
          <thead>
            <tr><th>Kategori</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {r.expenseByCategory.map((e) => (
              <tr key={e.category}>
                <td style={{ fontWeight: 600 }}>{e.category}</td>
                <td className="num">{rupiah(e.total)}</td>
              </tr>
            ))}
            {r.expenseByCategory.length === 0 && <tr><td colSpan={2} className="muted">Tidak ada pengeluaran.</td></tr>}
          </tbody>
        </table>

        <h3>Shift</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Kasir</th><th>Buka</th><th>Tutup</th>
              <th className="num">Penjualan tunai</th><th className="num">Non-tunai</th><th className="num">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {r.shifts.map((sh) => (
              <tr key={sh.id}>
                <td style={{ fontWeight: 600 }}>{sh.user_email}</td>
                <td>{tanggal(sh.opened_at)}</td>
                <td>{sh.closed_at ? tanggal(sh.closed_at) : <span className="badge auto">Masih buka</span>}</td>
                <td className="num">{rupiah(sh.sales_cash)}</td>
                <td className="num">{rupiah(sh.sales_noncash)}</td>
                <td className="num">{sh.difference !== null ? rupiah(sh.difference) : '—'}</td>
              </tr>
            ))}
            {r.shifts.length === 0 && <tr><td colSpan={6} className="muted">Tidak ada shift pada tanggal ini.</td></tr>}
          </tbody>
        </table>

        {r.voidCount > 0 && (
          <p className="muted">
            Void hari ini: {r.voidCount} transaksi senilai {rupiah(r.voidTotal)} (stok sudah dikembalikan, tidak dihitung ke omzet).
          </p>
        )}
        <p className="muted" style={{ marginBottom: 0 }}>
          Omzet mencakup semua metode (termasuk kasbon). Arus kas hanya mencatat uang yang benar-benar masuk/keluar.
        </p>
      </div>
    </>
  )
}