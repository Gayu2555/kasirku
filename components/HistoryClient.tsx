'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { voidSale } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import type { PayMethod, Sale } from '@/lib/types'

const METHOD_LABEL: Record<PayMethod, string> = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' }
const PAGE_SIZES = [10, 25, 50]

const stickyTh: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--card, #fffdf7)',
}

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, current - 1, current, current + 1])
  const nums = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

export default function HistoryClient({ sales }: { sales: Sale[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | PayMethod | 'void'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [detail, setDetail] = useState<Sale | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return sales.filter((s) => {
      if (qq && !s.receipt_no.toLowerCase().includes(qq)) return false
      if (filter === 'void') return !!s.voided_at
      if (filter !== 'all' && s.payment_method !== filter) return false
      return true
    })
  }, [sales, q, filter])

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, totalPages)
  const startIdx = (current - 1) * pageSize
  const paged = visible.slice(startIdx, startIdx + pageSize)
  const from = visible.length === 0 ? 0 : startIdx + 1
  const to = Math.min(startIdx + pageSize, visible.length)

  const doVoid = async () => {
    if (!detail) return
    setBusy(true)
    setError('')
    const res = await voidSale(detail.id, reason)
    setBusy(false)
    if (res.ok) {
      setDetail(null)
      router.refresh()
    } else setError(res.error)
  }

  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        {([['all', 'Semua'], ['tunai', 'Tunai'], ['qris', 'QRIS'], ['transfer', 'Transfer'], ['kasbon', 'Kasbon'], ['void', 'Void']] as const).map(([k, label]) => (
          <button
            key={k}
            className={`chip${filter === k ? ' active' : ''}`}
            onClick={() => { setFilter(k); setPage(1) }}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        className="input"
        style={{ marginBottom: 12 }}
        placeholder="Cari nomor struk… (mis. INV-20261115)"
        value={q}
        onChange={(e) => { setQ(e.target.value); setPage(1) }}
      />

      <div className="card">
        <div style={{ overflow: 'auto', maxHeight: '65vh' }}>
          <table className="table" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={stickyTh}>Struk</th>
                <th style={stickyTh}>Waktu</th>
                <th style={stickyTh}>Metode</th>
                <th className="num" style={stickyTh}>Total</th>
                <th style={stickyTh}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((s) => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => { setDetail(s); setReason(''); setError('') }}>
                  <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{s.receipt_no}</td>
                  <td>{tanggal(s.created_at)}</td>
                  <td><span className="badge auto">{METHOD_LABEL[s.payment_method]}</span></td>
                  <td className="num" style={s.voided_at ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
                    {rupiah(s.total)}
                  </td>
                  <td>{s.voided_at ? <span className="badge low">Void</span> : <span className="badge ok">OK</span>}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={5} className="muted">Tidak ada transaksi yang cocok.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {visible.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
            }}
          >
            <div className="muted" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Menampilkan {from}–{to} dari {visible.length}</span>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
                aria-label="Jumlah per halaman"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n} / halaman</option>
                ))}
              </select>
            </div>

            <div className="chips" style={{ margin: 0, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                ‹ Sebelumnya
              </button>
              {pageList(current, totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="muted">…</span>
                ) : (
                  <button key={p} className={`chip${p === current ? ' active' : ''}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ),
              )}
              <button className="btn btn-ghost btn-sm" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>
                Berikutnya ›
              </button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Struk {detail.receipt_no}</h2>
            <p className="muted">
              {tanggal(detail.created_at)} · {METHOD_LABEL[detail.payment_method]}
              {detail.voided_at && <> · <span className="badge low">Void</span></>}
            </p>
            {detail.items.map((i, idx) => (
              <div key={idx}>
                <div className="receipt-line">
                  <span>{i.name} × {i.qty}</span>
                  <span>{rupiah(i.price * i.qty)}</span>
                </div>
                {i.note && <div className="receipt-note">↳ {i.note}</div>}
              </div>
            ))}
            {detail.discount > 0 && (
              <>
                <div className="receipt-line"><span>Subtotal</span><span>{rupiah(detail.total + detail.discount)}</span></div>
                <div className="receipt-line"><span>Diskon</span><span>−{rupiah(detail.discount)}</span></div>
              </>
            )}
            <div className="receipt-total"><span>Total</span><span>{rupiah(detail.total)}</span></div>
            <div className="receipt-line"><span>Dibayar</span><span>{rupiah(detail.paid)}</span></div>
            <div className="receipt-line"><span>Kembalian</span><span>{rupiah(detail.change)}</span></div>

            {detail.voided_at ? (
              <p className="muted">
                Di-void oleh {detail.voided_by} pada {tanggal(detail.voided_at)}. Stok sudah dikembalikan.
              </p>
            ) : (
              <>
                <label className="field" style={{ marginTop: 12 }}>
                  Alasan void
                  <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. salah input item" />
                </label>
                {error && <p className="error-text">{error}</p>}
                <p className="muted">Void mengembalikan stok dan membalik pendapatan. Hanya owner.</p>
              </>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Tutup</button>
              {!detail.voided_at && (
                <button className="btn btn-danger" disabled={busy} onClick={doVoid}>
                  {busy ? 'Memproses…' : 'Void transaksi'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}