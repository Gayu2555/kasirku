'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addIngredient, fetchRecipe, saveRecipe, updateIngredientCost } from '@/lib/actions'
import { persen, rupiah } from '@/lib/format'
import type { Ingredient, Product } from '@/lib/types'

interface Row {
  ingredientId: string
  quantity: string
}

export default function HppClient({ products, ingredients }: { products: Product[]; ingredients: Ingredient[] }) {
  const router = useRouter()
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [rows, setRows] = useState<Row[]>([])
  const [overhead, setOverhead] = useState('0')
  const [target, setTarget] = useState('30')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const [ingName, setIngName] = useState('')
  const [ingUnit, setIngUnit] = useState('g')
  const [ingCost, setIngCost] = useState('')
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let alive = true
    if (!productId) return
    fetchRecipe(productId).then((recipe) => {
      if (!alive) return
      setRows(recipe.map((r) => ({ ingredientId: r.ingredient_id, quantity: String(r.quantity) })))
      const p = products.find((x) => x.id === productId)
      setOverhead(String(p?.overhead ?? 0))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const product = products.find((p) => p.id === productId)
  const ingById = new Map(ingredients.map((i) => [i.id, i]))
  const hppBahan = rows.reduce((sum, r) => {
    const ing = ingById.get(r.ingredientId)
    return sum + (ing ? ing.cost_per_unit * (Number(r.quantity) || 0) : 0)
  }, 0)
  const hpp = hppBahan + (Number(overhead) || 0)
  const price = product?.price ?? 0
  const margin = price > 0 ? ((price - hpp) / price) * 100 : 0
  const targetNum = Math.min(Number(target) || 0, 95)
  const suggested = hpp / (1 - targetNum / 100)

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await saveRecipe(
      productId,
      rows.map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity) || 0 })),
      Number(overhead) || 0,
    )
    setBusy(false)
    if (res.ok) {
      setToast(`HPP tersimpan: ${rupiah(res.hpp)}`)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const addIng = async () => {
    const res = await addIngredient(ingName.trim(), ingUnit.trim() || 'pcs', Number(ingCost) || 0)
    if (res.ok) {
      setIngName('')
      setIngCost('')
      setToast('Bahan ditambahkan')
      router.refresh()
    } else {
      setToast(res.error)
    }
  }

  const saveCost = async (id: string) => {
    const res = await updateIngredientCost(id, Number(costDrafts[id]) || 0)
    if (res.ok) {
      setToast('Harga bahan diperbarui')
      router.refresh()
    } else {
      setToast(res.error)
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2 className="section-title">Resep produk</h2>
        <label className="field" style={{ marginBottom: 14 }}>
          Produk
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {rows.length === 0 && <p className="muted">Belum ada resep. Tambahkan bahan di bawah.</p>}
        {rows.map((r, idx) => {
          const ing = ingById.get(r.ingredientId)
          const subtotal = (ing?.cost_per_unit ?? 0) * (Number(r.quantity) || 0)
          return (
            <div className="hpp-row" key={idx}>
              <select
                className="select"
                value={r.ingredientId}
                onChange={(e) =>
                  setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, ingredientId: e.target.value } : x)))
                }
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="Jumlah"
                value={r.quantity}
                onChange={(e) =>
                  setRows((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                }
              />
              <span className="muted">
                {ing ? `${rupiah(ing.cost_per_unit)}/${ing.unit}` : '—'}
              </span>
              <span className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>
                {rupiah(subtotal)}
              </span>
              <button
                className="qty-btn"
                title="Hapus bahan"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </div>
          )
        })}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setRows((prev) => [...prev, { ingredientId: ingredients[0]?.id ?? '', quantity: '' }])
          }
        >
          + Tambah bahan
        </button>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <label className="field">
            Overhead / kemasan lain (Rp)
            <input className="input" type="number" min={0} value={overhead} onChange={(e) => setOverhead(e.target.value)} />
          </label>
          <label className="field">
            Target margin (%)
            <input className="input" type="number" min={0} max={95} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="receipt-line"><span>HPP bahan</span><span>{rupiah(hppBahan)}</span></div>
          <div className="receipt-line"><span>Overhead</span><span>{rupiah(Number(overhead) || 0)}</span></div>
          <div className="receipt-total"><span>HPP per {product?.unit ?? 'porsi'}</span><span>{rupiah(hpp)}</span></div>
          <div className="receipt-line"><span>Harga jual saat ini</span><span>{rupiah(price)}</span></div>
          <div className="receipt-line">
            <span>Margin saat ini</span>
            <strong style={{ color: margin >= 0 ? 'var(--ok)' : 'var(--red)' }}>{persen(margin)}</strong>
          </div>
          <div className="receipt-line">
            <span>Saran harga (margin {persen(targetNum)})</span>
            <strong style={{ color: 'var(--green-deep)' }}>{rupiah(suggested)}</strong>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" disabled={busy || !productId} onClick={save}>
            {busy ? 'Menyimpan…' : 'Simpan resep & HPP'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Bahan baku</h2>
        <div className="form-grid">
          <label className="field">
            Nama bahan
            <input className="input" value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="mis. Keju" />
          </label>
          <label className="field">
            Satuan
            <input className="input" value={ingUnit} onChange={(e) => setIngUnit(e.target.value)} placeholder="g / ml / pcs" />
          </label>
          <label className="field">
            Harga per satuan (Rp)
            <input className="input" type="number" min={0} value={ingCost} onChange={(e) => setIngCost(e.target.value)} />
          </label>
          <label className="field">
            &nbsp;
            <button className="btn btn-ghost" onClick={addIng}>+ Tambah bahan</button>
          </label>
        </div>

        <table className="table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Bahan</th>
              <th className="num">Harga / satuan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((i) => (
              <tr key={i.id}>
                <td style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {i.name} <span className="muted">({i.unit})</span>
                </td>
                <td className="num">
                  <input
                    className="input"
                    style={{ width: 110, textAlign: 'right' }}
                    type="number"
                    min={0}
                    value={costDrafts[i.id] ?? String(i.cost_per_unit)}
                    onChange={(e) => setCostDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                  />
                </td>
                <td className="num">
                  <button className="btn btn-ghost btn-sm" onClick={() => saveCost(i.id)}>Simpan</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 10 }}>
          Mengubah harga bahan otomatis memperbarui perhitungan HPP semua resep yang memakainya.
        </p>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}