'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettings } from '@/lib/actions'
import { ACCENT_PRESETS, FONT_PRESETS } from '@/lib/appearance'
import type { StoreSettings } from '@/lib/types'
import { useAppearance } from './Appearance'
import Icon from './Icon'

// Editor tampilan: setiap pilihan langsung diterapkan ke seluruh app (preview live),
// lalu disimpan ke settings toko supaya berlaku di semua perangkat.
export default function AppearanceSettings({ settings }: { settings: StoreSettings }) {
  const router = useRouter()
  const app = useAppearance()
  const [draft, setDraft] = useState({ font: settings.ui_font, accent: settings.ui_accent, density: settings.ui_density })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = draft.font !== settings.ui_font || draft.accent !== settings.ui_accent || draft.density !== settings.ui_density

  const pick = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    app.set(next)
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await saveSettings({ ui_font: draft.font, ui_accent: draft.accent, ui_density: draft.density })
    setBusy(false)
    if (res.ok) {
      setSaved(true)
      router.refresh()
    } else setError(res.error)
  }

  const reset = () => {
    const base = { font: settings.ui_font, accent: settings.ui_accent, density: settings.ui_density }
    setDraft(base)
    app.set(base)
    setSaved(false)
  }

  return (
    <div className="card appear-card">
      <div className="appear-head">
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Tampilan app</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Font, warna aksen, dan kepadatan — langsung terlihat sebagai preview sebelum disimpan.
          </p>
        </div>
        {dirty && <span className="badge unsaved">Preview · belum disimpan</span>}
      </div>

      <div className="appear-section">
        <div className="appear-label"><Icon name="type" size={15} /> Font</div>
        <div className="font-grid">
          {FONT_PRESETS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`font-card${draft.font === f.id ? ' active' : ''}`}
              onClick={() => pick({ font: f.id })}
              aria-pressed={draft.font === f.id}
            >
              <span className="font-aa" style={{ fontFamily: f.serif }}>Aa</span>
              <span className="font-name" style={{ fontFamily: f.sans }}>{f.label}</span>
              <span className="font-desc">{f.desc}</span>
              {draft.font === f.id && <span className="font-check"><Icon name="check" size={13} /></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="appear-section">
        <div className="appear-label"><Icon name="palette" size={15} /> Warna aksen</div>
        <div className="swatch-row">
          {ACCENT_PRESETS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`swatch${draft.accent === a.id ? ' active' : ''}`}
              onClick={() => pick({ accent: a.id })}
              aria-pressed={draft.accent === a.id}
              title={a.label}
            >
              <span className="swatch-dot" style={{ background: `linear-gradient(135deg, ${a.solid} 0%, ${a.deep} 100%)` }}>
                {draft.accent === a.id && <Icon name="check" size={14} />}
              </span>
              <span className="swatch-name">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Mewarnai sidebar, tombol utama, dan grafik. Warna status (sukses/bahaya) tetap tidak berubah.
        </p>
      </div>

      <div className="appear-section">
        <div className="appear-label"><Icon name="sliders" size={15} /> Kepadatan</div>
        <div className="segmented" role="group" aria-label="Kepadatan tampilan">
          <button type="button" className={draft.density === 'comfortable' ? 'active' : ''} onClick={() => pick({ density: 'comfortable' })} aria-pressed={draft.density === 'comfortable'}>
            Nyaman
            <small>Ruang lega, enak dibaca</small>
          </button>
          <button type="button" className={draft.density === 'compact' ? 'active' : ''} onClick={() => pick({ density: 'compact' })} aria-pressed={draft.density === 'compact'}>
            Padat
            <small>Lebih banyak data di layar</small>
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {saved && !dirty && <p style={{ color: 'var(--ok)', fontWeight: 600, margin: '10px 0 0' }}>Tampilan tersimpan ✓</p>}
      <div className="appear-actions">
        <button className="btn btn-ghost" onClick={reset} disabled={!dirty || busy}>
          <Icon name="reset" size={15} /> Reset
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Menyimpan…' : 'Simpan tampilan'}
        </button>
      </div>
    </div>
  )
}