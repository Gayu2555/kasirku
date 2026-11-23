// Preset tampilan toko: font, warna aksen, dan kepadatan UI.
// Dipakai bersama oleh AppearanceProvider (client), AppearanceSettings, dan validasi saveSettings.

export interface FontPreset {
  id: string
  label: string
  desc: string
  sans: string
  serif: string
  google: string | null
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    desc: 'Inter + Playfair Display',
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
    google: 'family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700',
  },
  {
    id: 'jakarta',
    label: 'Jakarta',
    desc: 'Plus Jakarta Sans, modern & ramah',
    sans: "'Plus Jakarta Sans', system-ui, sans-serif",
    serif: "'Plus Jakarta Sans', system-ui, sans-serif",
    google: 'family=Plus+Jakarta+Sans:wght@400;500;600;700;800',
  },
  {
    id: 'grotesk',
    label: 'Grotesk',
    desc: 'Space Grotesk, tegas & teknis',
    sans: "'Space Grotesk', system-ui, sans-serif",
    serif: "'Space Grotesk', system-ui, sans-serif",
    google: 'family=Space+Grotesk:wght@400;500;600;700',
  },
  {
    id: 'elegant',
    label: 'Elegant',
    desc: 'Lora + Fraunces, hangat & editorial',
    sans: "'Lora', Georgia, serif",
    serif: "'Fraunces', Georgia, serif",
    google: 'family=Lora:wght@400;500;600;700&family=Fraunces:wght@600;700',
  },
  {
    id: 'mono',
    label: 'Mono',
    desc: 'Space Mono, gaya struk kasir',
    sans: "'Space Mono', ui-monospace, 'Courier New', monospace",
    serif: "'Space Mono', ui-monospace, 'Courier New', monospace",
    google: 'family=Space+Mono:wght@400;700',
  },
  {
    id: 'system',
    label: 'System',
    desc: 'Font bawaan perangkat, paling cepat',
    sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    google: null,
  },
]

export interface AccentPreset {
  id: string
  label: string
  solid: string
  deep: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'sage', label: 'Sage', solid: '#1e5b4a', deep: '#143d31' },
  { id: 'terracotta', label: 'Terracotta', solid: '#b3402e', deep: '#6f2a1c' },
  { id: 'ocean', label: 'Ocean', solid: '#2f6fb0', deep: '#173a5e' },
  { id: 'amber', label: 'Amber', solid: '#a87615', deep: '#5c430e' },
  { id: 'berry', label: 'Berry', solid: '#a44a7f', deep: '#57284a' },
  { id: 'slate', label: 'Slate', solid: '#3f4a5a', deep: '#232b36' },
]

export type Density = 'comfortable' | 'compact'

export const APPEARANCE_DEFAULT = { font: 'classic', accent: 'sage', density: 'comfortable' as Density }

export const isFontId = (v: unknown): v is string => FONT_PRESETS.some((f) => f.id === v)
export const isAccentId = (v: unknown): v is string => ACCENT_PRESETS.some((a) => a.id === v)
export const isDensity = (v: unknown): v is Density => v === 'comfortable' || v === 'compact'