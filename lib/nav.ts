import type { NavPref } from './types'

export interface NavItem {
  href: string
  label: string
  owner: boolean
  icon: string
}

// Satu sumber kebenaran untuk menu: dipakai Shell, editor menu, dan fallback data.
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', owner: true, icon: 'grid' },
  { href: '/kasir', label: 'Kasir', owner: false, icon: 'cart' },
  { href: '/riwayat', label: 'Riwayat', owner: true, icon: 'clock' },
  { href: '/pelanggan', label: 'Pelanggan', owner: true, icon: 'users' },
  { href: '/laporan', label: 'Laporan', owner: true, icon: 'doc' },
  { href: '/stok', label: 'Stok', owner: true, icon: 'box' },
  { href: '/keuangan', label: 'Keuangan', owner: true, icon: 'wallet' },
  { href: '/hpp', label: 'Kalkulator HPP', owner: true, icon: 'calc' },
  { href: '/analitik', label: 'Analitik', owner: true, icon: 'chart' },
  { href: '/tim', label: 'Tim', owner: true, icon: 'team' },
  { href: '/pengaturan', label: 'Pengaturan', owner: true, icon: 'gear' },
]

export const DEFAULT_NAV_PREFS: NavPref[] = NAV_ITEMS.map((i) => ({ href: i.href, on: true }))

// Normalisasi pref tersimpan: buang href tak dikenal, dedupe, tambah item baru,
// dan kunci /pengaturan selalu tampil (jangan sampai owner terkunci di luar).
export function parseNav(raw: string | null | undefined): NavPref[] {
  let stored: unknown = []
  try {
    stored = JSON.parse(raw ?? '[]')
  } catch {
    stored = []
  }
  const known = new Set(NAV_ITEMS.map((i) => i.href))
  const seen = new Set<string>()
  const out: NavPref[] = []
  if (Array.isArray(stored)) {
    for (const s of stored) {
      const href = typeof s?.href === 'string' ? s.href : ''
      if (!known.has(href) || seen.has(href)) continue
      seen.add(href)
      out.push({ href, on: href === '/pengaturan' ? true : Boolean(s?.on) })
    }
  }
  for (const i of NAV_ITEMS) {
    if (!seen.has(i.href)) out.push({ href: i.href, on: true })
  }
  return out
}

export function serializeNav(prefs: NavPref[]): string {
  return JSON.stringify(parseNav(JSON.stringify(prefs)))
}