'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettings } from '@/lib/actions'
import { NAV_ITEMS } from '@/lib/nav'
import type { NavPref, StoreSettings } from '@/lib/types'
import Icon from './Icon'

// Editor menu sidebar: drag (atau tombol panah) untuk mengurutkan,
// toggle untuk menyembunyikan, dengan preview sidebar mini yang live.
export default function MenuSettings({ settings }: { settings: StoreSettings }) {
  const router = useRouter()
  const [prefs, setPrefs] = useState<NavPref[]>(settings.nav)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(prefs) !== JSON.stringify(settings.nav)
  const visibleCount = prefs.filter((p) => p.on).length

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= prefs.length) return
    setPrefs((list) => {
      const next = [...list]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
    setSaved(false)
  }

  const toggle = (href: string) => {
    if (href === '/pengaturan') return // selalu tampil, jangan kunci owner di luar
    setPrefs((list) => {
      const target = list.find((p) => p.href === href)
      if (target?.on && list.filter((p) => p.on).length <= 1) return list // minimal satu menu aktif
      return list.map((p) => (p.href === href ? { ...p, on: !p.on } : p))
    })
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await saveSettings({ nav: prefs })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
    } else setError(res.error)
  }

  const reset = () => {
    setPrefs(settings.nav)
    setSaved(false)
  }

  const previewItems = prefs
    .map((p) => ({ on: p.on, item: NAV_ITEMS.find((i) => i.href === p.href) }))
    .filter((x) => x.item && x.on)

  return (
    <div className="menu-editor">
      <div className="card menu-list-card">
        <div className="appear-head">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Menu sidebar</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              Seret untuk mengurutkan, atau pakai panah. Klik mata untuk menyembunyikan menu.
            </p>
          </div>
          {dirty && <span className="badge unsaved">Belum disimpan</span>}
        </div>
        <ul className="menu-rows">
          {prefs.map((p, i) => {
            const item = NAV_ITEMS.find((n) => n.href === p.href)
            if (!item) return null
            const locked = p.href === '/pengaturan'
            const lastVisible = p.on && visibleCount <= 1
            return (
              <li
                key={p.href}
                className={`menu-row${p.on ? '' : ' off'}${dragIdx === i ? ' dragging' : ''}${overIdx === i && dragIdx !== null && dragIdx !== i ? ' drag-over' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i)
                  e.dataTransfer.effectAllowed = 'move'
                  try {
                    e.dataTransfer.setData('text/plain', String(i))
                  } catch {
                    /* beberapa browser membatasi setData */
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (overIdx !== i) setOverIdx(i)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIdx !== null) move(dragIdx, i)
                  setDragIdx(null)
                  setOverIdx(null)
                }}
                onDragEnd={() => {
                  setDragIdx(null)
                  setOverIdx(null)
                }}
              >
                <span className="menu-grip" title="Seret untuk mengurutkan"><Icon name="grip" size={16} /></span>
                <span className="menu-ico"><Icon name={item.icon} size={16} /></span>
                <span className="menu-name">
                  {item.label}
                  <small>{item.owner ? 'Khusus owner' : 'Owner & kasir'}</small>
                </span>
                <span className="menu-tools">
                  <button type="button" className="icon-btn sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Naikkan ${item.label}`}>
                    <Icon name="up" size={14} />
                  </button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, i + 1)} disabled={i === prefs.length - 1} aria-label={`Turunkan ${item.label}`}>
                    <Icon name="down" size={14} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn sm menu-eye${p.on ? ' on' : ''}`}
                    onClick={() => toggle(p.href)}
                    disabled={locked || lastVisible}
                    aria-pressed={p.on}
                    aria-label={p.on ? `Sembunyikan ${item.label}` : `Tampilkan ${item.label}`}
                    title={locked ? 'Pengaturan selalu tampil' : lastVisible ? 'Minimal satu menu aktif' : p.on ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    <Icon name={locked ? 'lock' : p.on ? 'eye' : 'eye-off'} size={14} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="muted">
          Minimal satu menu aktif dan Pengaturan selalu tampil. Peran kasir otomatis hanya melihat menu Kasir.
        </p>
        {error && <p className="error-text">{error}</p>}
        {saved && !dirty && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '10px 0 0' }}>Menu tersimpan ✓</p>}
        <div className="appear-actions">
          <button className="btn btn-ghost" onClick={reset} disabled={!dirty || busy}>
            <Icon name="reset" size={15} /> Reset
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Menyimpan…' : 'Simpan menu'}
          </button>
        </div>
      </div>

      <div className="card menu-preview-card">
        <div className="appear-label"><Icon name="panel" size={15} /> Preview</div>
        <div className="mini-sidebar">
          <div className="mini-brand">{settings.store_name || 'KasirKu'}</div>
          {previewItems.map(({ item }, idx) => (
            <div key={item!.href} className={`mini-link${idx === 0 ? ' active' : ''}`}>
              <Icon name={item!.icon} size={14} />
              <span>{item!.label}</span>
            </div>
          ))}
          <div className="mini-foot">
            <span className="badge auto">Owner</span>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Urutan & menu aktif di sidebar mengikuti preview ini setelah disimpan.
        </p>
      </div>
    </div>
  )
}