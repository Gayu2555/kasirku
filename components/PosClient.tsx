'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkout, closeShift, deleteHeldOrder, holdOrder, openShift as openShiftAction, recallOrder, togglePin } from '@/lib/actions'
import { rupiah, tanggal } from '@/lib/format'
import { promoActive, wibMinutes } from '@/lib/promo'
import Icon from './Icon'
import type { Customer, HeldOrder, PayMethod, Product, Receipt, Shift, StoreSettings } from '@/lib/types'

const METHOD_LABEL: Record<PayMethod, string> = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' }

// Konfeti kecil saat tutup shift dengan selisih nol
function Confetti() {
  const colors = ['#d9a441', '#7a9b6d', '#b3402e', '#4a6fa5', '#e0c341']
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 10) * 0.12}s`,
            animationDuration: `${2.2 + (i % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function PosClient({ products, openShift, customers, settings, todayRevenue, heldOrders }: { products: Product[]; openShift: Shift | null; customers: Customer[]; settings: StoreSettings; todayRevenue: number; heldOrders: HeldOrder[] }) {
  const router = useRouter()
  const [cart, setCart] = useState<{ productId: string; qty: number; note: string }[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Semua')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PayMethod>('tunai')
  const [discType, setDiscType] = useState<'persen' | 'nominal'>('persen')
  const [discValue, setDiscValue] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [shiftModal, setShiftModal] = useState<'open' | 'close' | null>(null)
  const [openingCash, setOpeningCash] = useState('100000')
  const [countedCash, setCountedCash] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [closeResult, setCloseResult] = useState<{ expected: number; difference: number; nonCash: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [parkModal, setParkModal] = useState(false)
  const [parkLabel, setParkLabel] = useState('')
  const [heldModal, setHeldModal] = useState(false)
  const [held, setHeld] = useState<HeldOrder[]>(heldOrders)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [nowMin, setNowMin] = useState(-1)

  useEffect(() => setHeld(heldOrders), [heldOrders])

  // Jam WIB untuk preview happy hour; checkout tetap otoritatif di server
  useEffect(() => {
    const tick = () => setNowMin(wibMinutes())
    tick()
    const t = window.setInterval(tick, 30000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(t)
  }, [toast])

  const categories = useMemo(
    () => ['Semua', ...Array.from(new Set(products.map((p) => p.category)))],
    [products],
  )
  const q = search.trim().toLowerCase()
  const visible = products.filter(
    (p) =>
      (category === 'Semua' || p.category === category) &&
      (p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)),
  )
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const bestIds = useMemo(
    () => products.filter((p) => p.sold30 > 0).sort((a, b) => b.sold30 - a.sold30).slice(0, 3).map((p) => p.id),
    [products],
  )
  const subtotal = cart.reduce((sum, line) => sum + (byId.get(line.productId)?.price ?? 0) * line.qty, 0)
  const discNum = Math.max(0, discType === 'persen'
    ? Math.round(subtotal * Math.min(Number(discValue) || 0, 100) / 100)
    : Math.min(Math.round(Number(discValue) || 0), subtotal))
  const promoOn = nowMin >= 0 && promoActive(settings.promo_enabled, settings.promo_start, settings.promo_end, nowMin)
  const promoDisc = promoOn && discNum === 0 ? Math.round(subtotal * Math.min(settings.promo_persen, 100) / 100) : 0
  const effectiveDisc = discNum > 0 ? discNum : promoDisc
  const total = subtotal - effectiveDisc
  const paidNum = method === 'tunai' ? Number(paid) || 0 : method === 'kasbon' ? 0 : total
  const change = paidNum - total
  const customerOk = method !== 'kasbon' || !!customerId || !!newName.trim()
  const canPay = !busy && cart.length > 0 && paidNum >= total && !!openShift && customerOk
  const expectedNow = openShift ? openShift.opening_cash + openShift.sales_cash : 0
  const targetPct = settings.daily_target > 0 ? Math.min(100, Math.round((todayRevenue / settings.daily_target) * 100)) : 0
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const stampEarned = customerId && settings.stamp_per > 0 ? Math.floor(total / settings.stamp_per) : 0

  const add = (id: string) => {
    const p = byId.get(id)
    if (!p) return
    setCart((prev) => {
      const line = prev.find((l) => l.productId === id)
      if (line) {
        if (line.qty >= p.stock) return prev
        return prev.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, { productId: id, qty: 1, note: '' }]
    })
  }

  const setNote = (id: string, note: string) => {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, note } : l)))
  }

  const setQty = (id: string, qty: number) => {
    const p = byId.get(id)
    if (!p) return
    if (qty <= 0) setCart((prev) => prev.filter((l) => l.productId !== id))
    else if (qty <= p.stock) setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty } : l)))
  }

  const submit = async () => {
    if (!openShift) {
      setError('Buka shift dulu sebelum bertransaksi')
      return
    }
    setBusy(true)
    setError('')
    const res = await checkout(
      cart,
      paidNum,
      method,
      customerId ? { id: customerId } : method === 'kasbon' ? { name: newName, phone: newPhone } : undefined,
      discNum > 0 ? { type: discType, value: Number(discValue) } : undefined,
    )
    setBusy(false)
    if (res.ok) {
      setReceipt(res.receipt)
      setCart([])
      setPaid('')
      setDiscValue('')
      setCustomerId('')
      setNewName('')
      setNewPhone('')
      setNewCustomer(false)
      router.refresh()
    } else {
      setError(res.error)
    }
  }

  const doOpenShift = async () => {
    setBusy(true)
    setError('')
    const res = await openShiftAction(Number(openingCash) || 0)
    setBusy(false)
    if (res.ok) {
      setShiftModal(null)
      router.refresh()
    } else setError(res.error)
  }

  const doCloseShift = async () => {
    setBusy(true)
    setError('')
    const res = await closeShift(Number(countedCash) || 0, closeNote.trim())
    setBusy(false)
    if (res.ok) {
      setShiftModal(null)
      setCloseResult({ expected: res.expected, difference: res.difference, nonCash: res.nonCash })
      router.refresh()
    } else setError(res.error)
  }

  const doPark = async () => {
    if (!cart.length) return
    setBusy(true)
    setError('')
    const res = await holdOrder(cart, parkLabel.trim() || 'Tanpa nama', customerId || undefined)
    setBusy(false)
    if (res.ok) {
      setParkModal(false)
      setParkLabel('')
      setCart([])
      setCustomerId('')
      setNewName('')
      setNewPhone('')
      setNewCustomer(false)
      setToast({ text: 'Pesanan diparkir — panggil lagi lewat tombol Diparkir' })
      router.refresh()
    } else setError(res.error)
  }

  const doRecall = async (h: HeldOrder) => {
    setBusy(true)
    setError('')
    const swapped = cart.length > 0
    if (swapped) {
      // Keranjang sekarang ikut diparkir dulu supaya tidak hilang
      const auto = await holdOrder(cart, 'Keranjang sebelumnya', customerId || undefined)
      if (!auto.ok) {
        setBusy(false)
        setError(auto.error)
        return
      }
    }
    const res = await recallOrder(h.id)
    setBusy(false)
    if (res.ok) {
      setCart(res.items)
      setCustomerId(res.customerId ?? '')
      setNewCustomer(false)
      setHeldModal(false)
      setToast({ text: swapped ? 'Pesanan dipanggil — keranjang sebelumnya diparkir otomatis' : 'Pesanan dipanggil ke keranjang' })
      router.refresh()
    } else setError(res.error)
  }

  const doDeleteHeld = async (h: HeldOrder) => {
    setHeld((prev) => prev.filter((x) => x.id !== h.id))
    const res = await deleteHeldOrder(h.id)
    if (res.ok) {
      setToast({
        text: `Parkiran "${h.label || 'Tanpa nama'}" dihapus`,
        undo: async () => {
          const back = await holdOrder(h.items, h.label, h.customerId ?? undefined)
          setToast({ text: back.ok ? 'Pesanan dikembalikan' : back.error })
          if (back.ok) router.refresh()
        },
      })
      router.refresh()
    } else {
      setHeld((prev) => [h, ...prev])
      setToast({ text: res.error })
    }
  }

  // Shortcut: / fokus cari, Enter tambah via SKU/nama persis (scanner barcode), F2 bayar, Esc bersihkan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Enter' && e.target === searchRef.current) {
        const hit = products.find((p) => p.sku?.toLowerCase() === q || p.name.toLowerCase() === q)
        if (hit) {
          add(hit.id)
          setSearch('')
        }
      } else if (e.key === 'F2' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault()
        if (canPay) submit()
      } else if (e.key === 'Escape') {
        if (receipt) setReceipt(null)
        else if (closeResult) setCloseResult(null)
        else if (shiftModal) setShiftModal(null)
        else if (parkModal) setParkModal(false)
        else if (heldModal) setHeldModal(false)
        else setCart([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const waText = receipt
    ? [
        `*${settings.store_name}* — Struk ${receipt.receipt_no}`,
        tanggal(receipt.created_at),
        ...receipt.items.map((i) => `${i.qty}x ${i.name}${i.note ? ' (' + i.note + ')' : ''} = ${rupiah(i.price * i.qty)}`),
        ...(receipt.discount > 0 ? [`${receipt.promo ? 'Diskon Happy Hour' : 'Diskon'}: -${rupiah(receipt.discount)}`] : []),
        `Total: ${rupiah(receipt.total)}`,
        `Metode: ${METHOD_LABEL[receipt.payment_method]}${receipt.customer_name ? ' a.n. ' + receipt.customer_name : ''}`,
        ...(receipt.stamps_earned > 0 ? [`Stamp: +${receipt.stamps_earned} ⭐ (${receipt.customer_stamps}/${settings.stamp_goal} menuju ${settings.stamp_reward})`] : []),
        receipt.payment_method === 'kasbon'
          ? 'Dicatat sebagai kasbon (belum dibayar)'
          : `Bayar: ${rupiah(receipt.paid)} | Kembali: ${rupiah(receipt.change)}`,
        settings.receipt_footer,
      ].join('\n')
    : ''

  return (
    <>
      {!openShift ? (
        <div className="card shift-banner">
          <div>
            <strong style={{ color: 'var(--ink)' }}>Shift belum dibuka.</strong>{' '}
            <span className="muted">Buka shift dengan modal awal laci untuk mulai transaksi.</span>
          </div>
          <button className="btn btn-primary" onClick={() => { setError(''); setShiftModal('open') }}>
            Buka shift
          </button>
        </div>
      ) : (
        <div className="card shift-banner">
          <div className="muted">
            Shift aktif sejak {tanggal(openShift.opened_at)} · Modal {rupiah(openShift.opening_cash)} · Tunai{' '}
            {rupiah(openShift.sales_cash)} · Non-tunai {rupiah(openShift.sales_noncash)}
          </div>
          <button className="btn btn-ghost" onClick={() => { setError(''); setCountedCash(''); setCloseNote(''); setShiftModal('close') }}>
            Tutup shift
          </button>
        </div>
      )}

      {settings.daily_target > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="muted">Target hari ini {rupiah(settings.daily_target)}</span>
            {targetPct >= 100
              ? <span className="badge ok">Target tercapai!</span>
              : <span className="muted">{rupiah(todayRevenue)} · kurang {rupiah(Math.max(settings.daily_target - todayRevenue, 0))}</span>}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${targetPct}%` }} />
          </div>
        </div>
      )}

      {settings.promo_enabled && (
        promoOn ? (
          <div className="promo-banner active">
            <Icon name="clock" size={20} />
            <div className="grow">
              <strong>Happy Hour aktif — diskon {settings.promo_persen}% otomatis</strong>
              <span className="promo-sub">Berlaku sampai {settings.promo_end} WIB · tidak berlaku jika ada diskon manual</span>
            </div>
            <span className="promo-pill">−{settings.promo_persen}%</span>
          </div>
        ) : (
          <div className="promo-banner">
            <Icon name="clock" size={18} />
            <span>Happy Hour {settings.promo_start}–{settings.promo_end} WIB · diskon {settings.promo_persen}% otomatis di jam itu.</span>
          </div>
        )
      )}

      <div className="pos-layout">
        <div className="pos-left">
          <div className="chips">
            {categories.map((c) => (
              <button key={c} className={`chip${category === c ? ' active' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <input
            ref={searchRef}
            className="input"
            style={{ marginBottom: 6 }}
            placeholder="Cari nama / SKU, atau scan barcode… ( / )"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="muted" style={{ marginTop: 0 }}>
            Shortcut: <b>/</b> cari · <b>Enter</b> tambah (SKU/nama persis) · <b>F2</b> bayar · <b>Esc</b> bersihkan
          </p>
          <div className="product-grid">
            {visible.map((p) => (
              <button key={p.id} className="product-tile" disabled={p.stock === 0} onClick={() => add(p.id)}>
                <span
                  className={`pin-btn${p.pinned ? ' pinned' : ''}`}
                  role="button"
                  title={p.pinned ? 'Lepas dari favorit' : 'Pin sebagai favorit'}
                  onClick={(e) => { e.stopPropagation(); togglePin(p.id).then(() => router.refresh()) }}
                >
                  {p.pinned ? '★' : '☆'}
                </span>
                {bestIds.includes(p.id) && <span className="badge ok best-badge">Terlaris</span>}
                {p.image_url
                  ? <img className="p-img" src={p.image_url} alt={p.name} loading="lazy" />
                  : <span className="p-img p-img-empty" aria-hidden>{p.name.slice(0, 1)}</span>}
                <span className="p-name">{p.name}</span>
                <span className="p-price">{rupiah(p.price)}</span>
                <span className="p-stock">
                  {p.sku ? `${p.sku} · ` : ''}{p.stock === 0 ? 'Habis' : `Stok ${p.stock} ${p.unit}`}
                </span>
              </button>
            ))}
            {visible.length === 0 && <p className="muted">Tidak ada produk yang cocok.</p>}
          </div>
        </div>

        <div className="card cart">
          <div className="cart-head">
            <h2 className="section-title" style={{ margin: 0 }}>Keranjang</h2>
            <div className="cart-head-actions">
              <button
                className="btn btn-ghost btn-sm"
                disabled={!cart.length || busy}
                title="Tahan pesanan ini, layani yang lain dulu"
                onClick={() => { setError(''); setParkLabel(''); setParkModal(true) }}
              >
                <Icon name="pause" size={14} /> Parkir
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setHeldModal(true) }}>
                <Icon name="clock" size={14} /> Diparkir{held.length > 0 ? ` (${held.length})` : ''}
              </button>
            </div>
          </div>
          {cart.length === 0 && <p className="muted">Klik produk untuk menambahkan.</p>}
          {cart.map((line) => {
            const p = byId.get(line.productId)
            if (!p) return null
            return (
              <div className="cart-item" key={line.productId}>
                <div className="cart-line">
                  {p.image_url && <img className="cart-thumb" src={p.image_url} alt={p.name} loading="lazy" />}
                  <div className="grow">
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.name}</div>
                    <div className="muted">{rupiah(p.price * line.qty)}</div>
                  </div>
                  <button className="qty-btn" onClick={() => setQty(line.productId, line.qty - 1)}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center' }}>{line.qty}</span>
                  <button className="qty-btn" onClick={() => setQty(line.productId, line.qty + 1)}>+</button>
                </div>
                <input
                  className="input note-input"
                  value={line.note}
                  onChange={(e) => setNote(line.productId, e.target.value)}
                  placeholder="Catatan: pedas lv3, tanpa es, bungkus…"
                />
                <div className="note-chips">
                  {['Pedas', 'Extra pedas', 'Tanpa es', 'Bungkus'].map((t) => (
                    <button
                      key={t}
                      className={`chip chip-xs${line.note === t ? ' active' : ''}`}
                      onClick={() => setNote(line.productId, line.note === t ? '' : t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="discount-row">
            <select className="input" style={{ width: 92 }} value={discType} onChange={(e) => setDiscType(e.target.value as 'persen' | 'nominal')}>
              <option value="persen">%</option>
              <option value="nominal">Rp</option>
            </select>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="Diskon (opsional)"
              value={discValue}
              onChange={(e) => setDiscValue(e.target.value)}
            />
          </div>
          {effectiveDisc > 0 && (
            <>
              <div className="receipt-line"><span>Subtotal</span><span>{rupiah(subtotal)}</span></div>
              <div className="receipt-line">
                <span>{discNum > 0 ? 'Diskon' : `Diskon Happy Hour −${settings.promo_persen}%`}</span>
                <span style={{ color: 'var(--red)' }}>−{rupiah(effectiveDisc)}</span>
              </div>
            </>
          )}
          <div className="cart-total">
            <span>Total</span>
            <span>{rupiah(total)}</span>
          </div>
          {stampEarned > 0 && (
            <p className="muted stamp-hint">⭐ {selectedCustomer?.name} dapat +{stampEarned} stamp menuju {settings.stamp_reward}</p>
          )}
          <div className="chips" style={{ marginBottom: 8 }}>
            {(['tunai', 'qris', 'transfer', 'kasbon'] as PayMethod[]).map((m) => (
              <button key={m} className={`chip${method === m ? ' active' : ''}`} onClick={() => setMethod(m)}>
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {method !== 'kasbon' && settings.stamp_per > 0 && (
            <label className="field" style={{ marginBottom: 8 }}>
              Pelanggan (opsional — kumpulkan stamp)
              <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— tanpa pelanggan —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.stamps}/{settings.stamp_goal} stamp</option>
                ))}
              </select>
            </label>
          )}
          {method === 'kasbon' && (
            <div style={{ marginBottom: 8 }}>
              {!newCustomer ? (
                <>
                  <label className="field">
                    Pelanggan kasbon
                    <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">— pilih pelanggan —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.debt > 0 ? ` (hutang ${rupiah(c.debt)})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => setNewCustomer(true)}>+ pelanggan baru</button>
                </>
              ) : (
                <>
                  <label className="field">
                    Nama pelanggan baru
                    <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Mis. Bu Sari" />
                  </label>
                  <label className="field">
                    No WA (opsional)
                    <input className="input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="08xx…" />
                  </label>
                  <button className="btn btn-ghost btn-sm" onClick={() => setNewCustomer(false)}>pilih yang sudah ada</button>
                </>
              )}
            </div>
          )}
          {method === 'tunai' ? (
            <>
              <label className="field">
                Uang diterima
                <input className="input" type="number" min={0} placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
              </label>
              <div className="chips" style={{ marginBottom: 0 }}>
                <button className="chip" onClick={() => setPaid(String(total))}>Uang pas</button>
                {[20000, 50000, 100000].map((n) => (
                  <button key={n} className="chip" onClick={() => setPaid(String(n))}>{rupiah(n)}</button>
                ))}
              </div>
            </>
          ) : method === 'kasbon' ? (
            <p className="muted" style={{ marginTop: 0 }}>
              Kasbon: dicatat sebagai hutang pelanggan, belum masuk laci/QRIS.
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>
              {METHOD_LABEL[method]}: nominal pas otomatis ({rupiah(total)}), tanpa kembalian.
            </p>
          )}
          <div className="receipt-line">
            <span>Kembalian</span>
            <strong style={{ color: change >= 0 && cart.length ? 'var(--ok)' : 'var(--muted)' }}>
              {cart.length ? rupiah(Math.max(change, 0)) : '—'}
            </strong>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" disabled={!canPay} onClick={submit}>
            {busy ? 'Memproses…' : 'Bayar & cetak struk (F2)'}
          </button>
        </div>
      </div>

      {shiftModal === 'open' && (
        <div className="modal-overlay" onClick={() => setShiftModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Buka shift</h2>
            <label className="field">
              Modal awal laci (Rp)
              <input className="input" type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShiftModal(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy} onClick={doOpenShift}>
                {busy ? 'Memproses…' : 'Buka shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {shiftModal === 'close' && openShift && (
        <div className="modal-overlay" onClick={() => setShiftModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Tutup shift & hitung laci</h2>
            <div className="receipt-line"><span>Modal awal</span><span>{rupiah(openShift.opening_cash)}</span></div>
            <div className="receipt-line"><span>Penjualan tunai</span><span>{rupiah(openShift.sales_cash)}</span></div>
            <div className="receipt-line"><span>Non-tunai (QRIS/transfer)</span><span>{rupiah(openShift.sales_noncash)}</span></div>
            <div className="receipt-total"><span>Uang seharusnya di laci</span><span>{rupiah(expectedNow)}</span></div>
            <label className="field" style={{ marginTop: 12 }}>
              Uang fisik dihitung (Rp)
              <input className="input" type="number" min={0} value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
            </label>
            <div className="receipt-line">
              <span>Selisih</span>
              <strong style={{ color: (Number(countedCash) || 0) - expectedNow === 0 ? 'var(--ok)' : 'var(--red)' }}>
                {rupiah((Number(countedCash) || 0) - expectedNow)}
              </strong>
            </div>
            <label className="field">
              Catatan
              <input className="input" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="Opsional" />
            </label>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShiftModal(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy} onClick={doCloseShift}>
                {busy ? 'Memproses…' : 'Tutup shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {closeResult && closeResult.difference === 0 && <Confetti />}

      {closeResult && (
        <div className="modal-overlay" onClick={() => setCloseResult(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Shift ditutup</h2>
            <div className="receipt-line"><span>Uang seharusnya (tunai)</span><span>{rupiah(closeResult.expected)}</span></div>
            <div className="receipt-line"><span>Non-tunai (QRIS/transfer)</span><span>{rupiah(closeResult.nonCash)}</span></div>
            <div className="receipt-line">
              <span>Selisih</span>
              <strong style={{ color: closeResult.difference === 0 ? 'var(--ok)' : 'var(--red)' }}>
                {rupiah(closeResult.difference)}
              </strong>
            </div>
            <p className="muted">
              {closeResult.difference === 0 ? 'Laci pas, tidak ada selisih.' : 'Ada selisih — periksa catatan shift di Dashboard.'}
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setCloseResult(null)}>Selesai</button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="modal-overlay" onClick={() => setReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-store">
              <strong>{settings.store_name}</strong>
              {settings.store_address && <div className="muted">{settings.store_address}</div>}
              {settings.store_phone && <div className="muted">WA {settings.store_phone}</div>}
            </div>
            <h2>Struk {receipt.receipt_no}</h2>
            <p className="muted">{tanggal(receipt.created_at)}</p>
            {receipt.items.map((i, idx) => (
              <div key={idx}>
                <div className="receipt-line">
                  <span>{i.name} × {i.qty}</span>
                  <span>{rupiah(i.price * i.qty)}</span>
                </div>
                {i.note && <div className="receipt-note">↳ {i.note}</div>}
              </div>
            ))}
            {receipt.discount > 0 && (
              <>
                <div className="receipt-line"><span>Subtotal</span><span>{rupiah(receipt.total + receipt.discount)}</span></div>
                <div className="receipt-line"><span>{receipt.promo ? 'Diskon Happy Hour' : 'Diskon'}</span><span>−{rupiah(receipt.discount)}</span></div>
              </>
            )}
            <div className="receipt-total"><span>Total</span><span>{rupiah(receipt.total)}</span></div>
            <div className="receipt-line"><span>Metode</span><span>{METHOD_LABEL[receipt.payment_method]}</span></div>
            {receipt.customer_name && (
              <div className="receipt-line"><span>Pelanggan</span><span>{receipt.customer_name}</span></div>
            )}
            {receipt.stamps_earned > 0 && (
              <div className="receipt-line"><span>Stamp diperoleh</span><span>+{receipt.stamps_earned} ⭐ ({receipt.customer_stamps}/{settings.stamp_goal})</span></div>
            )}
            <div className="receipt-line"><span>Dibayar</span><span>{rupiah(receipt.paid)}</span></div>
            <div className="receipt-line"><span>Kembalian</span><span>{rupiah(receipt.change)}</span></div>
            {receipt.payment_method === 'kasbon' && (
              <p className="muted">Dicatat sebagai kasbon — tagih lewat halaman Pelanggan.</p>
            )}
            <p className="muted receipt-footer">{settings.receipt_footer}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => window.print()}>Cetak</button>
              <button
                className="btn btn-ghost"
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank', 'noopener')}
              >
                Kirim WA
              </button>
              <button className="btn btn-primary" onClick={() => setReceipt(null)}>Selesai</button>
            </div>
          </div>
        </div>
      )}
      {parkModal && (
        <div className="modal-overlay" onClick={() => setParkModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Parkir pesanan</h2>
            <p className="muted">Keranjang disimpan dan bisa dipanggil lagi nanti. Stok belum dipotong sampai dibayar.</p>
            <label className="field">
              Nama parkiran
              <input
                className="input"
                value={parkLabel}
                onChange={(e) => setParkLabel(e.target.value)}
                placeholder="Mis. Meja 2 — tunggu teman"
                maxLength={60}
                autoFocus
              />
            </label>
            <div className="chips" style={{ marginBottom: 4 }}>
              {['Meja 1', 'Meja 2', 'Meja 3', 'Bungkus', 'Tunggu teman'].map((t) => (
                <button key={t} className={`chip chip-xs${parkLabel === t ? ' active' : ''}`} onClick={() => setParkLabel(parkLabel === t ? '' : t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="receipt-line"><span>Item</span><span>{cart.reduce((n, l) => n + l.qty, 0)} item</span></div>
            <div className="receipt-total"><span>Nilai pesanan</span><span>{rupiah(subtotal)}</span></div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setParkModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={busy || !cart.length} onClick={doPark}>
                {busy ? 'Memarkir…' : 'Parkir sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {heldModal && (
        <div className="modal-overlay" onClick={() => setHeldModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pesanan diparkir ({held.length})</h2>
            <p className="muted">Panggil untuk melanjutkan pembayaran. Jika keranjang sedang terisi, isinya diparkir otomatis dulu.</p>
            {held.length === 0 ? (
              <p className="muted">Belum ada pesanan diparkir. Klik tombol Parkir di keranjang untuk menahan pesanan.</p>
            ) : (
              <div className="held-list">
                {held.map((h) => {
                  const c = h.customerId ? customers.find((x) => x.id === h.customerId) : null
                  return (
                    <div className="held-row" key={h.id}>
                      <div className="grow">
                        <div className="held-label">{h.label || 'Tanpa nama'}</div>
                        <div className="muted held-meta">
                          {h.itemCount} item · {rupiah(h.total)} · {tanggal(h.createdAt)}{c ? ` · ${c.name}` : ''}
                        </div>
                      </div>
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => doRecall(h)}>Panggil</button>
                      <button className="btn btn-ghost btn-sm held-del" title="Hapus parkiran" onClick={() => doDeleteHeld(h)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setHeldModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          {toast.text}
          {toast.undo && (
            <button className="toast-action" onClick={() => { const u = toast.undo; setToast(null); u?.() }}>
              Urungkan
            </button>
          )}
        </div>
      )}
    </>
  )
}