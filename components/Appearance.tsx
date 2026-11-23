'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { FONT_PRESETS, type Density } from '@/lib/appearance'

export interface AppearanceState {
  font: string
  accent: string
  density: Density
}

interface AppearanceCtx extends AppearanceState {
  set: (patch: Partial<AppearanceState>) => void
}

const Ctx = createContext<AppearanceCtx | null>(null)

export function useAppearance(): AppearanceCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppearance harus dipakai di dalam AppearanceProvider')
  return ctx
}

// Provider tampilan seluruh app: set data-attr di <html> (dipakai CSS globals)
// dan memuat font Google sesuai preset. Nilai awal dari settings server;
// perubahan live (preview) langsung terasa sebelum disimpan.
export default function AppearanceProvider({ initial, children }: { initial: AppearanceState; children: React.ReactNode }) {
  const [state, setState] = useState<AppearanceState>(initial)

  // Sinkron ulang saat server mengirim nilai baru (mis. setelah simpan + refresh).
  useEffect(() => {
    setState({ font: initial.font, accent: initial.accent, density: initial.density })
  }, [initial.font, initial.accent, initial.density])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.font = state.font
    el.dataset.accent = state.accent
    el.dataset.density = state.density
  }, [state])

  // FontLoader: satu <link> dikelola manual supaya ganti font tidak menumpuk stylesheet.
  useEffect(() => {
    const preset = FONT_PRESETS.find((f) => f.id === state.font) ?? FONT_PRESETS[0]
    let link = document.getElementById('kk-fonts') as HTMLLinkElement | null
    if (!preset.google) {
      link?.remove()
      return
    }
    const href = `https://fonts.googleapis.com/css2?${preset.google}&display=swap`
    if (!link) {
      link = document.createElement('link')
      link.id = 'kk-fonts'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  }, [state.font])

  const set = (patch: Partial<AppearanceState>) => setState((s) => ({ ...s, ...patch }))

  return <Ctx.Provider value={{ ...state, set }}>{children}</Ctx.Provider>
}