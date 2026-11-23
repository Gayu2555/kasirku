'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettings } from '@/lib/actions'
import { promoActive, wibMinutes } from '@/lib/promo'
import type { StoreSettings } from '@/lib/types'
import Icon from './Icon'
import AppearanceSettings from './AppearanceSettings'
import MenuSettings from './MenuSettings'

const TABS = [
  { id: 'profil', label: 'Profil Toko', icon: 'store' },
  { id: 'tampilan', label: 'Tampilan', icon: 'palette' },
  { id: 'menu', label: 'Menu', icon: 'sliders' },
  { id: 'loyalitas', label: 'Loyalitas', icon: 'gift' },
  { id: 'promo', label: 'Promo', icon: 'clock' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function SettingsClient({ settings }: { settings: StoreSettings }) {
  const [tab, setTab] = useState<TabId>('profil')
  return (
    <div className="settings-wrap">
      <div className="settings-tabs" role="tablist" aria-label="Kategori pengaturan">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'profil' && <StoreForm settings={settings} />}
      {tab === 'tampilan' && <AppearanceSettings settings={settings} />}
      {tab === 'menu' && <MenuSettings settings={settings} />}
      {tab === 'loyalitas' && <LoyaltyForm settings={settings} />}
      {tab === 'promo' && <PromoForm settings={settings} />}
    </div>
  )
}

function useSaver() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const run = async (input: Parameters<typeof saveSettings>[0]) => {
    setBusy(true)
    setError('')
    const res = await saveSettings(input)
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
    } else setError(res.error)
  }
  return { busy, error, saved, setSaved, run }
}

function StoreForm({ settings }: { settings: StoreSettings }) {
  const { busy, error, saved, setSaved, run } = useSaver()
  const [form, setForm] = useState({
    store_name: settings.store_name,
    store_address: settings.store_address,
    store_phone: settings.store_phone,
    receipt_footer: settings.receipt_footer,
    daily_target: String(settings.daily_target || ''),
    supplier_phone: settings.supplier_phone,
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setSaved(false)
  }
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="form-grid">
        <label className="field">
          Nama toko
          <input className="input" value={form.store_name} onChange={set('store_name')} placeholder="Mis. Ayam Geprek Mantap" />
        </label>
        <label className="field">
          Nomor WA toko
          <input className="input" value={form.store_phone} onChange={set('store_phone')} placeholder="08xx…" />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Alamat
          <input className="input" value={form.store_address} onChange={set('store_address')} placeholder="Jl. Merdeka No. 12, Bandung" />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Pesan footer struk
          <input className="input" value={form.receipt_footer} onChange={set('receipt_footer')} placeholder="Terima kasih, selamat menikmati!" />
        </label>
        <label className="field">
          Target omzet harian (Rp)
          <input className="input" type="number" min={0} value={form.daily_target} onChange={set('daily_target')} placeholder="0 = tanpa target" />
        </label>
        <label className="field">
          Nomor WA supplier
          <input className="input" value={form.supplier_phone} onChange={set('supplier_phone')} placeholder="Untuk pengingat belanja stok menipis" />
        </label>
      </div>
      <p className="muted">
        Nama, alamat, dan footer dipakai di struk, laporan cetak, dan pesan WhatsApp. Nama toko juga tampil di
        sidebar. Target harian tampil sebagai progress bar di Dashboard dan Kasir.
      </p>
      {error && <p className="error-text">{error}</p>}
      {saved && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>Pengaturan tersimpan ✓</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          run({
            store_name: form.store_name,
            store_address: form.store_address,
            store_phone: form.store_phone,
            receipt_footer: form.receipt_footer,
            supplier_phone: form.supplier_phone,
            daily_target: Number(form.daily_target) || 0,
          })
        }
      >
        {busy ? 'Menyimpan…' : 'Simpan profil'}
      </button>
    </div>
  )
}

function LoyaltyForm({ settings }: { settings: StoreSettings }) {
  const { busy, error, saved, setSaved, run } = useSaver()
  const [form, setForm] = useState({
    stamp_per: String(settings.stamp_per || ''),
    stamp_goal: String(settings.stamp_goal || ''),
    stamp_reward: settings.stamp_reward,
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setSaved(false)
  }
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="form-grid">
        <label className="field">
          Rupiah per stamp loyalitas
          <input className="input" type="number" min={0} value={form.stamp_per} onChange={set('stamp_per')} placeholder="20000 · 0 = nonaktif" />
        </label>
        <label className="field">
          Stamp untuk tukar hadiah
          <input className="input" type="number" min={1} value={form.stamp_goal} onChange={set('stamp_goal')} placeholder="10" />
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          Hadiah loyalitas
          <input className="input" value={form.stamp_reward} onChange={set('stamp_reward')} placeholder="Gratis Es Teh Manis" />
        </label>
      </div>
      <p className="muted">
        Stamp otomatis didapat pelanggan saat checkout (semua metode bayar). Setelah terkumpul sesuai target,
        kasir bisa menukarnya dengan hadiah dari halaman Pelanggan atau Kasir.
      </p>
      {error && <p className="error-text">{error}</p>}
      {saved && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>Pengaturan tersimpan ✓</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          run({
            stamp_per: Number(form.stamp_per) || 0,
            stamp_goal: Number(form.stamp_goal) || 10,
            stamp_reward: form.stamp_reward,
          })
        }
      >
        {busy ? 'Menyimpan…' : 'Simpan loyalitas'}
      </button>
    </div>
  )
}

function PromoForm({ settings }: { settings: StoreSettings }) {
  const { busy, error, saved, setSaved, run } = useSaver()
  const [form, setForm] = useState({
    promo_enabled: settings.promo_enabled,
    promo_start: settings.promo_start,
    promo_end: settings.promo_end,
    promo_persen: String(settings.promo_persen),
  })
  const persen = Number(form.promo_persen) || 0
  const nowActive = promoActive(form.promo_enabled, form.promo_start, form.promo_end, wibMinutes())
  const set = (key: 'promo_start' | 'promo_end' | 'promo_persen') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setSaved(false)
  }
  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="field" style={{ marginBottom: 12 }}>
        Happy hour (diskon otomatis)
        <div className="segmented">
          <button
            className={`segmented-btn${form.promo_enabled ? ' active' : ''}`}
            onClick={() => { setForm((f) => ({ ...f, promo_enabled: true })); setSaved(false) }}
          >
            Aktif
          </button>
          <button
            className={`segmented-btn${!form.promo_enabled ? ' active' : ''}`}
            onClick={() => { setForm((f) => ({ ...f, promo_enabled: false })); setSaved(false) }}
          >
            Nonaktif
          </button>
        </div>
      </div>
      <div className="form-grid">
        <label className="field">
          Jam mulai (WIB)
          <input className="input" type="time" value={form.promo_start} onChange={set('promo_start')} />
        </label>
        <label className="field">
          Jam selesai (WIB)
          <input className="input" type="time" value={form.promo_end} onChange={set('promo_end')} />
        </label>
        <label className="field">
          Besar diskon (%)
          <input className="input" type="number" min={1} max={90} value={form.promo_persen} onChange={set('promo_persen')} placeholder="10" />
        </label>
      </div>
      <div className={`promo-preview${nowActive ? ' active' : ''}`}>
        <Icon name="clock" size={16} />
        {form.promo_enabled
          ? nowActive
            ? <span>Sedang aktif sekarang — semua transaksi tanpa diskon manual otomatis dapat −{persen}%.</span>
            : <span>Belum aktif sekarang. Diskon −{persen}% otomatis berlaku pukul {form.promo_start}–{form.promo_end} WIB.</span>
          : <span>Promo nonaktif — tidak ada diskon otomatis.</span>}
      </div>
      <p className="muted">
        Cocok untuk jam sepi (mis. sore sebelum makan malam). Diskon dihitung server berdasarkan jam WIB,
        tampil di keranjang dan struk sebagai "Diskon Happy Hour", dan tidak berlaku jika kasir memberi diskon manual.
      </p>
      {error && <p className="error-text">{error}</p>}
      {saved && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>Pengaturan tersimpan ✓</p>}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() =>
          run({
            promo_enabled: form.promo_enabled,
            promo_start: form.promo_start,
            promo_end: form.promo_end,
            promo_persen: Number(form.promo_persen) || 0,
          })
        }
      >
        {busy ? 'Menyimpan…' : 'Simpan promo'}
      </button>
    </div>
  )
}