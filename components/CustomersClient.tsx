'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addCustomer, fetchCustomer, receivePayment, redeemStamp } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import type { Customer, CustomerPayment, Sale, StoreSettings } from '@/lib/types'

const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`

export default function CustomersClient({ customers, settings }: { customers: Customer[]; settings: StoreSettings }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [onlyDebt, setOnlyDebt] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [detail, setDetail] = useState<{ customer: Customer; sales: Sale[]; payments: CustomerPayment[] } | null>(null)
  const [amount, setAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'tunai' | 'qris' | 'transfer'>('tunai')
  const [payNote, setPayNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return customers.filter((c) => {
      if (onlyDebt && c.debt <= 0) return false
      if (qq && !c.name.toLowerCase().includes(qq) && !c.phone.includes(qq)) return false
      return true
    })
  }, [customers, q, onlyDebt])

  const totalDebt = customers.reduce((a, c) => a + c.debt, 0)

  const openDetail = async (id: string) => {
    setError('')
    const d = await fetchCustomer(id)
    if (d) {
      setDetail(d)
      setAmount('')
      setPayNote('')
    }
  }

  const doAdd = async () => {
    setBusy(true)
    setError('')
    const res = await addCustomer(newName, newPhone)
    setBusy(false)
    if (res.ok) {
      setShowAdd(false)
      setNewName('')
      setNewPhone('')
      router.refresh()
    } else setError(res.error)
  }

  const doPay = async () => {
    if (!detail) return
    setBusy(true)
    setError('')
    const res = await receivePayment(detail.customer.id, Number(amount), payMethod, payNote)
    setBusy(false)
    if (res.ok) {
      setAmount('')
      setPayNote('')
      router.refresh()
      const d = await fetchCustomer(detail.customer.id)
      if (d) setDetail(d)
    } else setError(res.error)
  }

  const doRedeem = async () => {
    if (!detail) return
    setBusy(true)
    setError('')
    const res = await redeemStamp(detail.customer.id)
    setBusy(false)
    if (res.ok) {
      router.refresh()
      const d = await fetchCustomer(detail.customer.id)
      if (d) setDetail(d)
    } else setError(res.error)
  }

  return (
    <>
      <div className="chips" style={{ marginBottom: 10 }}>
        <button className={`chip${!onlyDebt ? ' active' : ''}`} onClick={() => setOnlyDebt(false)}>Semua</button>
        <button className={`chip${onlyDebt ? ' active' : ''}`} onClick={() => setOnlyDebt(true)}>Masih hutang</button>
        <span className="badge low" style={{ marginLeft: 'auto' }}>Total piutang {rupiah(totalDebt)}</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setError('') }}>+ Pelanggan</button>
      </div>
      <input
        className="input"
        style={{ marginBottom: 12 }}
        placeholder="Cari nama atau nomor WA…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>WhatsApp</th>
              <th className="num">Kasbon</th>
              <th className="num">Dibayar</th>
              <th className="num">Sisa hutang</th>
              <th className="num">Stamp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(c.id)}>
                <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.name}</td>
                <td>{c.phone || <span className="muted">—</span>}</td>
                <td className="num">{rupiah(c.kasbon_total)}</td>
                <td className="num">{rupiah(c.paid_total)}</td>
                <td className="num">
                  {c.debt > 0 ? <span className="badge low">{rupiah(c.debt)}</span> : <span className="badge ok">Lunas</span>}
                </td>
                <td className="num">
                  <span className={`badge ${c.stamps >= settings.stamp_goal ? 'ok' : 'auto'}`}>{c.stamps}/{settings.stamp_goal} ⭐</span>
                </td>
                <td className="num">
                  {c.debt > 0 && c.phone && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={waLink(c.phone, `Halo ${c.name}, ini dari KasirKu. Mengingatkan sisa kasbon kamu ${rupiah(c.debt)}. Terima kasih 🙏`)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ingatkan WA
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="muted">Belum ada pelanggan yang cocok.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pelanggan baru</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="field">
                Nama
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Mis. Bu Sari" />
              </label>
              <label className="field">
                Nomor WhatsApp
                <input className="input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
              </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Batal</button>
              <button className="btn btn-primary" disabled={busy || !newName.trim()} onClick={doAdd}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{detail.customer.name}</h2>
            <p className="muted">
              {detail.customer.phone || 'Tanpa nomor WA'} · pelanggan sejak {tanggal(detail.customer.created_at)}
            </p>
            <div className="receipt-total">
              <span>Sisa hutang</span>
              <span>{rupiah(detail.customer.debt)}</span>
            </div>
            <div className="receipt-line"><span>Total kasbon</span><span>{rupiah(detail.customer.kasbon_total)}</span></div>
            <div className="receipt-line"><span>Sudah dibayar</span><span>{rupiah(detail.customer.paid_total)}</span></div>

            <div className="stamp-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--ink)' }}>Stamp loyalitas</strong>
                <span className="muted">{detail.customer.stamps}/{settings.stamp_goal} · hadiah: {settings.stamp_reward}</span>
              </div>
              <div className="stamp-dots">
                {Array.from({ length: settings.stamp_goal }, (_, i) => (
                  <span key={i} className={`stamp-dot${i < detail.customer.stamps ? ' filled' : ''}`}>★</span>
                ))}
              </div>
              <p className="muted" style={{ margin: '4px 0' }}>Total terkumpul {detail.customer.stamps_total} stamp · hadiah ditukar {detail.customer.stamps_redeemed}×</p>
              {detail.customer.stamps >= settings.stamp_goal && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={doRedeem}>
                  {busy ? 'Menukar…' : `Tukar ${settings.stamp_reward} (${settings.stamp_goal} stamp)`}
                </button>
              )}
            </div>

            <h3 style={{ marginBottom: 6 }}>Transaksi kasbon</h3>
            {detail.sales.length === 0 && <p className="muted">Belum ada transaksi.</p>}
            {detail.sales.map((s) => (
              <div className="receipt-line" key={s.id}>
                <span>{s.receipt_no} · {tanggal(s.created_at)}{s.voided_at ? ' (void)' : ''}</span>
                <span>{rupiah(s.total)}</span>
              </div>
            ))}

            <h3 style={{ marginBottom: 6 }}>Riwayat pelunasan</h3>
            {detail.payments.length === 0 && <p className="muted">Belum ada pembayaran.</p>}
            {detail.payments.map((p) => (
              <div className="receipt-line" key={p.id}>
                <span>{tanggal(p.created_at)} · {p.method}{p.note ? ` · ${p.note}` : ''}</span>
                <span>{rupiah(p.amount)}</span>
              </div>
            ))}

            {detail.customer.debt > 0 && (
              <>
                <h3 style={{ marginBottom: 6 }}>Catat pelunasan</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ flex: 1, minWidth: 140 }}
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Nominal (maks ${rupiah(detail.customer.debt)})`}
                  />
                  <select className="input" style={{ width: 120 }} value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                    <option value="tunai">Tunai</option>
                    <option value="qris">QRIS</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Catatan (opsional)"
                />
                <p className="muted">Pelunasan tunai otomatis masuk pendapatan kategori “Pelunasan kasbon”.</p>
              </>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Tutup</button>
              {detail.customer.debt > 0 && detail.customer.phone && (
                <a
                  className="btn btn-ghost"
                  href={waLink(detail.customer.phone, `Halo ${detail.customer.name}, ini dari KasirKu. Mengingatkan sisa kasbon kamu ${rupiah(detail.customer.debt)}. Terima kasih 🙏`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ingatkan WA
                </a>
              )}
              {detail.customer.debt > 0 && (
                <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={doPay}>
                  {busy ? 'Menyimpan…' : 'Catat pelunasan'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}