'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPurchase } from '@/lib/actions'
import { rupiah } from '@/lib/format'
import type { Product } from '@/lib/types'

type Row = { productId: string; qty: string; unitCost: string }

const emptyRow = (): Row => ({ productId: '', qty: '', unitCost: '' })

export default function PurchaseForm({ products }: { products: Product[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [supplier, setSupplier] = useState('')
  const [expense, setExpense] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)))

  const pick = (i: number, id: string) => {
    const prod = products.find((p) => p.id === id)
    patch(i, { productId: id, unitCost: prod ? String(prod.cost) : '' })
  }

  const filled = rows.filter((r) => r.productId)
  const total = filled.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0)
  const canSubmit = filled.length > 0 && filled.every((r) => Number(r.qty) >= 1)

  const submit = async () => {
    setBusy(true)
    setError('')
    const items = filled.map((r) => ({
      productId: r.productId,
      qty: Number(r.qty),
      unitCost: Number(r.unitCost) || 0,
    }))
    const res = await addPurchase(items, supplier, expense)
    setBusy(false)
    if (res.ok) {
      setRows([emptyRow()])
      setSupplier('')
      setToast(`Pembelian ${rupiah(res.total)} tersimpan, stok bertambah`)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Pembelian stok</h2>

        <label className="field">
          Supplier / no. nota
          <input
            className="input"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Opsional"
          />
        </label>

        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Produk</th>
              <th className="num">Jumlah</th>
              <th className="num">Harga beli / unit</th>
              <th className="num">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <select className="select" value={r.productId} onChange={(e) => pick(i, e.target.value)}>
                    <option value="">Pilih produk…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (stok {p.stock} {p.unit})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={r.qty}
                    onChange={(e) => patch(i, { qty: e.target.value })}
                  />
                </td>
                <td className="num">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={r.unitCost}
                    onChange={(e) => patch(i, { unitCost: e.target.value })}
                  />
                </td>
                <td className="num">{rupiah((Number(r.qty) || 0) * (Number(r.unitCost) || 0))}</td>
                <td className="num">
                  {rows.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                    >
                      Hapus
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            + Tambah barang
          </button>
          <strong>Total {rupiah(total)}</strong>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
          <input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />
          Catat sebagai pengeluaran di arus kas
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" disabled={busy || !canSubmit} onClick={submit}>
            {busy ? 'Menyimpan…' : 'Simpan pembelian'}
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}