'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addCashEntry, deleteCashEntry } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import type { CashEntry, Sale } from '@/lib/types'

type Period = 'today' | '7d' | '30d' | 'all'

const periods: { id: Period; label: string }[] = [
  { id: 'today', label: 'Hari ini' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: '30 hari' },
  { id: 'all', label: 'Semua' },
]

const PAGE_SIZES = [10, 25, 50]

const stickyTh: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--card, #fffdf7)',
}

function cutoff(period: Period): number {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (period === '7d') return now.getTime() - 7 * 86400000
  if (period === '30d') return now.getTime() - 30 * 86400000
  return 0
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

function Pager({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, totalPages)
  const start = (current - 1) * pageSize
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(start + pageSize, total)
  if (total === 0) return null
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
      }}
    >
      <div className="muted" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{from}–{to} dari {total}</span>
        <select
          className="select"
          style={{ width: 'auto' }}
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Jumlah per halaman"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} / halaman</option>
          ))}
        </select>
      </div>
      <div className="chips" style={{ margin: 0, alignItems: 'center' }}>
        <button className="btn btn-ghost btn-sm" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          ‹
        </button>
        {pageList(current, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="muted">…</span>
          ) : (
            <button key={p} className={`chip${p === current ? ' active' : ''}`} onClick={() => onPage(p)}>
              {p}
            </button>
          ),
        )}
        <button className="btn btn-ghost btn-sm" disabled={current >= totalPages} onClick={() => onPage(current + 1)}>
          ›
        </button>
      </div>
    </div>
  )
}

export default function FinanceClient({ entries, sales }: { entries: CashEntry[]; sales: Sale[] }) {
  const router = useRouter()
  const [period, setPeriod] = useState<Period>('30d')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)

  const [cashPage, setCashPage] = useState(1)
  const [cashSize, setCashSize] = useState(10)
  const [salesPage, setSalesPage] = useState(1)
  const [salesSize, setSalesSize] = useState(10)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(t)
  }, [toast])

  const from = cutoff(period)
  const fEntries = useMemo(() => entries.filter((e) => new Date(e.created_at).getTime() >= from), [entries, from])
  const fSales = useMemo(() => sales.filter((s) => new Date(s.created_at).getTime() >= from), [sales, from])

  const income = fEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const expense = fEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const revenue = fSales.reduce((s, x) => s + x.total, 0)
  const hpp = fSales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.cost * i.qty, 0), 0)

  const cashPages = Math.max(1, Math.ceil(fEntries.length / cashSize))
  const cashCur = Math.min(cashPage, cashPages)
  const pagedEntries = fEntries.slice((cashCur - 1) * cashSize, cashCur * cashSize)

  const salesPages = Math.max(1, Math.ceil(fSales.length / salesSize))
  const salesCur = Math.min(salesPage, salesPages)
  const pagedSales = fSales.slice((salesCur - 1) * salesSize, salesCur * salesSize)

  const changePeriod = (p: Period) => {
    setPeriod(p)
    setCashPage(1)
    setSalesPage(1)
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    const res = await addCashEntry(type, Number(amount) || 0, category.trim(), note.trim())
    setBusy(false)
    if (res.ok) {
      setAmount('')
      setCategory('')
      setNote('')
      setCashPage(1)
      setToast('Catatan tersimpan')
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const remove = async (id: string) => {
    const res = await deleteCashEntry(id)
    if (res.ok) {
      setToast('Catatan dihapus')
      router.refresh()
    } else {
      setToast(res.error)
    }
  }

  return (
    <>
      <div className="chips">
        {periods.map((p) => (
          <button key={p.id} className={`chip${period === p.id ? ' active' : ''}`} onClick={() => changePeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="chips" style={{ marginTop: -4 }}>
        <a className="btn btn-ghost btn-sm" href={`/api/export?type=sales${from ? `&from=${from}` : ''}`}>Export penjualan CSV</a>
        <a className="btn btn-ghost btn-sm" href={`/api/export?type=cash${from ? `&from=${from}` : ''}`}>Export arus kas CSV</a>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="label">Pendapatan</div>
          <div className="value">{rupiah(income)}</div>
          <div className="sub">Termasuk penjualan otomatis</div>
        </div>
        <div className="card stat">
          <div className="label">Pengeluaran</div>
          <div className="value">{rupiah(expense)}</div>
          <div className="sub">{fEntries.filter((e) => e.type === 'expense').length} catatan</div>
        </div>
        <div className="card stat">
          <div className="label">Laba kotor</div>
          <div className="value">{rupiah(revenue - hpp)}</div>
          <div className="sub">Penjualan {rupiah(revenue)} − HPP {rupiah(hpp)}</div>
        </div>
        <div className="card stat">
          <div className="label">Laba bersih</div>
          <div className="value">{rupiah(income - expense)}</div>
          <div className="sub">Pendapatan − pengeluaran</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">Tambah catatan</h2>
          <div className="form-grid">
            <label className="field">
              Jenis
              <select className="select" value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
                <option value="expense">Pengeluaran</option>
                <option value="income">Pendapatan</option>
              </select>
            </label>
            <label className="field">
              Nominal (Rp)
              <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              Kategori
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bahan baku / Operasional / …" />
            </label>
            <label className="field">
              Catatan
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" />
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Menyimpan…' : 'Simpan catatan'}
            </button>
          </div>

          <h2 className="section-title" style={{ marginTop: 22 }}>Penjualan (struk)</h2>
          {fSales.length === 0 ? (
            <p className="muted">Belum ada penjualan pada periode ini.</p>
          ) : (
            <>
              <div style={{ overflow: 'auto', maxHeight: '40vh' }}>
                <table className="table" style={{ minWidth: 320 }}>
                  <thead>
                    <tr>
                      <th style={stickyTh}>Struk</th>
                      <th style={stickyTh}>Waktu</th>
                      <th className="num" style={stickyTh}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSales.map((s) => (
                      <tr key={s.id}>
                        <td>{s.receipt_no}</td>
                        <td>{tanggal(s.created_at)}</td>
                        <td className="num">{rupiah(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                total={fSales.length}
                page={salesCur}
                pageSize={salesSize}
                onPage={setSalesPage}
                onPageSize={(n) => { setSalesSize(n); setSalesPage(1) }}
              />
            </>
          )}
        </div>

        <div className="card">
          <h2 className="section-title">Arus kas</h2>
          {fEntries.length === 0 ? (
            <p className="muted">Belum ada catatan pada periode ini.</p>
          ) : (
            <>
              <div style={{ overflow: 'auto', maxHeight: '65vh' }}>
                <table className="table" style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th style={stickyTh}>Waktu</th>
                      <th style={stickyTh}>Kategori</th>
                      <th className="num" style={stickyTh}>Nominal</th>
                      <th style={stickyTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEntries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <span className={`badge ${e.type === 'income' ? 'in' : 'out'}`}>
                            {e.type === 'income' ? 'Masuk' : 'Keluar'}
                          </span>
                          <div className="muted" style={{ marginTop: 4 }}>{tanggal(e.created_at)}</div>
                        </td>
                        <td>
                          <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{e.category}</div>
                          <div className="muted">{e.note || '—'}</div>
                          {e.sale_id && <span className="badge auto">otomatis</span>}
                        </td>
                        <td className="num" style={{ color: e.type === 'income' ? 'var(--ok)' : 'var(--red)', fontWeight: 600 }}>
                          {e.type === 'income' ? '+' : '−'}{rupiah(e.amount)}
                        </td>
                        <td className="num">
                          {!e.sale_id && (
                            <button className="btn btn-danger btn-sm" onClick={() => remove(e.id)}>Hapus</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                total={fEntries.length}
                page={cashCur}
                pageSize={cashSize}
                onPage={setCashPage}
                onPageSize={(n) => { setCashSize(n); setCashPage(1) }}
              />
            </>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}