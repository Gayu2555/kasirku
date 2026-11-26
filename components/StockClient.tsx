'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adjustStock, deleteProduct, fetchMoves, saveProduct, stockOpname, uploadProductImage } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import Icon from './Icon'
import type { Product, StockMove } from '@/lib/types'

interface FormState {
  id?: string
  sku: string
  name: string
  category: string
  price: string
  cost: string
  stock: string
  unit: string
  min_stock: string
  image?: File
  imagePreview?: string
  originalImage?: string
  deleteImage: boolean
}

const emptyForm: FormState = {
  sku: '',
  name: '',
  category: '',
  price: '',
  cost: '',
  stock: '0',
  unit: 'porsi',
  min_stock: '5',
  deleteImage: false,
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export default function StockClient({ products }: { products: Product[] }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [adjust, setAdjust] = useState<{ product: Product; delta: string; note: string; moves: StockMove[] } | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [opname, setOpname] = useState<{ counts: Record<string, string>; note: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(t)
  }, [toast])

  const openCreate = () => {
    setError('')
    setForm({ ...emptyForm })
  }

  const openEdit = (p: Product) => {
    setError('')
    setForm({
      id: p.id,
      sku: p.sku ?? '',
      name: p.name,
      category: p.category,
      price: String(p.price),
      cost: String(p.cost),
      stock: String(p.stock),
      unit: p.unit,
      min_stock: String(p.min_stock),
      imagePreview: p.image_url,
      originalImage: p.image_url,
      deleteImage: false,
    })
  }

  const openAdjust = async (p: Product) => {
    setError('')
    const moves = await fetchMoves(p.id)
    setAdjust({ product: p, delta: '', note: '', moves })
  }

  const openOpname = () => {
    setError('')
    setOpname({ counts: Object.fromEntries(products.map((p) => [p.id, String(p.stock)])), note: '' })
  }

  const resetOpname = () => {
    setOpname((o) => (o ? { ...o, counts: Object.fromEntries(products.map((p) => [p.id, String(p.stock)])) } : o))
  }

  // Selisih live per produk: hanya dihitung kalau input angka bulat valid
  const opnameRows = opname
    ? products.map((p) => {
        const raw = opname.counts[p.id] ?? ''
        const counted = Number(raw)
        const valid = raw.trim() !== '' && Number.isInteger(counted) && counted >= 0
        return { p, raw, counted, valid, diff: valid ? counted - p.stock : 0 }
      })
    : []
  const opnameChanged = opnameRows.filter((r) => r.valid && r.diff !== 0)
  const opnamePlus = opnameChanged.reduce((n, r) => n + Math.max(r.diff, 0), 0)
  const opnameMinus = opnameChanged.reduce((n, r) => n + Math.max(-r.diff, 0), 0)
  const opnameInvalid = opnameRows.some((r) => !r.valid)

  const submitOpname = async () => {
    if (!opname) return
    if (opnameInvalid) {
      setError('Hasil hitung harus angka bulat ≥ 0')
      return
    }
    setBusy(true)
    setError('')
    const res = await stockOpname(opnameRows.map((r) => ({ productId: r.p.id, counted: r.counted })), opname.note)
    setBusy(false)
    if (res.ok) {
      setOpname(null)
      setToast(res.changed === 0
        ? 'Opname selesai — semua stok sudah cocok'
        : `Opname selesai: ${res.changed} produk disesuaikan (+${res.plus} / −${res.minus})`)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const closeForm = () => {
    if (form?.image && form.imagePreview) URL.revokeObjectURL(form.imagePreview)
    setForm(null)
  }

  const pickImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPEG, PNG, WebP)')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Ukuran gambar maksimal 5MB')
      return
    }
    setError('')
    if (form?.image && form.imagePreview) URL.revokeObjectURL(form.imagePreview)
    const url = URL.createObjectURL(file)
    setForm((f) => (f ? { ...f, image: file, imagePreview: url, deleteImage: false } : f))
  }

  // Hapus: kalau ada file baru -> batalkan file baru; kalau gambar lama -> tandai untuk dihapus
  const removeImage = () => {
    if (form?.image && form.imagePreview) URL.revokeObjectURL(form.imagePreview)
    setForm((f) => {
      if (!f) return f
      if (f.image) return { ...f, image: undefined, imagePreview: f.originalImage, deleteImage: false }
      return { ...f, deleteImage: true }
    })
  }

  const submitForm = async () => {
    if (!form) return
    setBusy(true)
    setError('')

    let imageFile = undefined
    if (form.image) {
      const uploadRes = await uploadProductImage(form.image)
      if (!uploadRes.ok) {
        setBusy(false)
        setError(uploadRes.error)
        return
      }
      imageFile = form.image
    }

    const res = await saveProduct({
      id: form.id,
      sku: form.sku,
      name: form.name.trim(),
      category: form.category.trim() || 'Umum',
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      unit: form.unit.trim() || 'pcs',
      min_stock: Number(form.min_stock) || 0,
      image: imageFile,
      deleteImage: form.deleteImage,
    })
    setBusy(false)
    if (res.ok) {
      closeForm()
      setToast(form.id ? 'Produk diperbarui' : 'Produk ditambahkan')
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const submitAdjust = async () => {
    if (!adjust) return
    const delta = Number(adjust.delta)
    setBusy(true)
    setError('')
    const res = await adjustStock(adjust.product.id, delta, adjust.note.trim())
    setBusy(false)
    if (res.ok) {
      setAdjust(null)
      setToast('Stok disesuaikan')
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    setError('')
    const res = await deleteProduct(deleteTarget.id)
    setBusy(false)
    if (res.ok) {
      setDeleteTarget(null)
      setToast(`${deleteTarget.name} dihapus`)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f))

  const previewUrl = form && !form.deleteImage ? form.imagePreview : undefined
  const canRemoveImage = !!form && !form.deleteImage && !!form.imagePreview

  return (
    <>
      <div className="bg-card border border-[var(--line)] rounded-[16px] p-5 shadow-[0_1px_3px_var(--shadow-c)]">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-3">
          <h2 className="font-serif text-[19px] text-ink font-semibold mb-0">Daftar produk</h2>
          <div className="flex gap-2">
            <button className="btn btn-ghost flex items-center gap-1.5" onClick={openOpname}>
              <Icon name="clipboard" size={16} /> Stock opname
            </button>
            <button className="btn btn-primary" onClick={openCreate}>+ Tambah produk</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Kategori</th>
                <th className="num">Harga jual</th>
                <th className="num">HPP</th>
                <th className="num">Stok</th>
                <th className="num">Min</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = p.stock <= p.min_stock
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-[34px] h-[34px] flex-shrink-0 rounded-[8px] overflow-hidden border border-[var(--line)] bg-[var(--cream)] flex items-center justify-center">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[13px] font-semibold text-[var(--muted)]">
                              {p.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td>{p.category}</td>
                    <td className="num">{rupiah(p.price)}</td>
                    <td className="num">{rupiah(p.cost)}</td>
                    <td className="num">
                      <span className={`badge ${low ? 'low' : 'ok'}`}>{p.stock} {p.unit}</span>
                    </td>
                    <td className="num">{p.min_stock}</td>
                    <td className="num">
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openAdjust(p)}>Stok</button>
                        <button
                          className="btn btn-danger btn-sm"
                          title={`Hapus ${p.name}`}
                          onClick={() => { setError(''); setDeleteTarget(p) }}
                        >
                          <Icon name="trash" size={14} /> Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? 'Edit produk' : 'Tambah produk'}</h2>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                Gambar produk
                <div className="flex items-center gap-4 mt-1.5">
                  <div className="relative w-[104px] h-[104px] flex-shrink-0 rounded-[14px] overflow-hidden border border-dashed border-[var(--line)] bg-[var(--cream)] flex items-center justify-center">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview gambar" className="w-full h-full object-cover" />
                    ) : (
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[var(--muted)] opacity-60"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <label className="btn btn-ghost btn-sm cursor-pointer">
                        {previewUrl ? 'Ganti gambar' : 'Pilih gambar'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            pickImage(e.target.files?.[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {canRemoveImage && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={removeImage}>
                          Hapus
                        </button>
                      )}
                      {form.deleteImage && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setForm((f) => (f ? { ...f, deleteImage: false } : f))}
                        >
                          Batalkan hapus
                        </button>
                      )}
                    </div>
                    <span className="text-[12px] text-[var(--muted)] leading-snug">
                      {form.deleteImage
                        ? 'Gambar akan dihapus saat disimpan.'
                        : form.image
                          ? `${form.image.name} · ${(form.image.size / 1024).toFixed(0)} KB`
                          : 'JPEG, PNG, atau WebP. Maksimal 5MB.'}
                    </span>
                  </div>
                </div>
              </div>

              <label className="field" style={{ gridColumn: '1 / -1' }}>
                Nama
                <input className="input" value={form.name} onChange={set('name')} />
              </label>
              <label className="field">
                SKU / barcode
                <input className="input" value={form.sku} onChange={set('sku')} placeholder="AY01" />
              </label>
              <label className="field">
                Kategori
                <input className="input" value={form.category} onChange={set('category')} placeholder="Makanan / Minuman / …" />
              </label>
              <label className="field">
                Satuan
                <input className="input" value={form.unit} onChange={set('unit')} />
              </label>
              <label className="field">
                Stok minimum
                <input className="input" type="number" min={0} value={form.min_stock} onChange={set('min_stock')} />
              </label>
              <label className="field">
                Harga jual (Rp)
                <input className="input" type="number" min={0} value={form.price} onChange={set('price')} />
              </label>
              <label className="field">
                HPP / modal (Rp)
                <input className="input" type="number" min={0} value={form.cost} onChange={set('cost')} />
              </label>
              {!form.id && (
                <label className="field">
                  Stok awal
                  <input className="input" type="number" min={0} value={form.stock} onChange={set('stock')} />
                </label>
              )}
            </div>
            {form.id && (
              <p className="muted" style={{ marginTop: 10 }}>
                HPP produk dengan resep dihitung otomatis di halaman Kalkulator HPP.
              </p>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeForm}>Batal</button>
              <button className="btn btn-primary" disabled={busy} onClick={submitForm}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjust && (
        <div className="modal-overlay" onClick={() => setAdjust(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Penyesuaian stok — {adjust.product.name}</h2>
            <p className="muted">Stok saat ini: {adjust.product.stock} {adjust.product.unit}</p>
            <div className="form-grid">
              <label className="field">
                Jumlah (+ masuk / − keluar)
                <input
                  className="input"
                  type="number"
                  value={adjust.delta}
                  onChange={(e) => setAdjust((a) => (a ? { ...a, delta: e.target.value } : a))}
                  placeholder="contoh: 10 atau -3"
                />
              </label>
              <label className="field">
                Catatan
                <input
                  className="input"
                  value={adjust.note}
                  onChange={(e) => setAdjust((a) => (a ? { ...a, note: e.target.value } : a))}
                  placeholder="Belanja bahan / rusak / …"
                />
              </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <h2 className="section-title" style={{ marginTop: 18 }}>Riwayat terakhir</h2>
            {adjust.moves.length === 0 ? (
              <p className="muted">Belum ada riwayat.</p>
            ) : (
              <table className="table">
                <tbody>
                  {adjust.moves.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className={`badge ${m.qty >= 0 ? 'in' : 'out'}`}>
                          {m.qty >= 0 ? `+${m.qty}` : m.qty}
                        </span>
                      </td>
                      <td>{m.note || m.type}</td>
                      <td className="num muted">{tanggal(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setAdjust(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy} onClick={submitAdjust}>
                {busy ? 'Menyimpan…' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {opname && (
        <div className="modal-overlay" onClick={() => setOpname(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Stock opname</h2>
            <p className="muted">
              Hitung fisik semua produk, masukkan hasilnya, lalu terapkan. Selisih dicatat sebagai riwayat penyesuaian stok.
            </p>
            <div className="opname-scroll">
              <table className="table opname-table">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th className="num">Stok sistem</th>
                    <th className="num">Hasil hitung</th>
                    <th className="num">Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {opnameRows.map(({ p, raw, valid, diff }) => (
                    <tr key={p.id} className={valid && diff !== 0 ? 'opname-diff' : ''}>
                      <td style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.name}</td>
                      <td className="num muted">{p.stock} {p.unit}</td>
                      <td className="num">
                        <input
                          className={`input opname-input${!valid ? ' invalid' : ''}`}
                          type="number"
                          min={0}
                          step={1}
                          value={raw}
                          onChange={(e) => setOpname((o) => (o ? { ...o, counts: { ...o.counts, [p.id]: e.target.value } } : o))}
                        />
                      </td>
                      <td className="num">
                        {!valid
                          ? <span className="muted">—</span>
                          : diff === 0
                            ? <span className="badge opname-zero">cocok</span>
                            : <span className={`badge ${diff > 0 ? 'in' : 'out'}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="opname-summary">
              <span><b>{opnameChanged.length}</b> produk berubah</span>
              <span className="opname-plus">+{opnamePlus} masuk</span>
              <span className="opname-minus">−{opnameMinus} keluar</span>
              <button className="btn btn-ghost btn-sm" onClick={resetOpname}>
                <Icon name="reset" size={14} /> Isi ulang dari sistem
              </button>
            </div>
            <label className="field">
              Catatan opname
              <input
                className="input"
                value={opname.note}
                onChange={(e) => setOpname((o) => (o ? { ...o, note: e.target.value } : o))}
                placeholder="Mis. Opname tutup bulan November"
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setOpname(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy || opnameChanged.length === 0 || opnameInvalid} onClick={submitOpname}>
                {busy ? 'Menyimpan…' : `Terapkan ${opnameChanged.length} penyesuaian`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Hapus produk</h2>
            <p className="muted">
              Hapus <b style={{ color: 'var(--ink)' }}>{deleteTarget.name}</b> dari daftar produk? Riwayat penjualan tetap tersimpan.
            </p>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Batal</button>
              <button className="btn btn-danger" disabled={busy} onClick={confirmDelete}>
                {busy ? 'Menghapus…' : 'Hapus produk'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}