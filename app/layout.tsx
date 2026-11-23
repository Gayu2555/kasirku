import type { Metadata } from 'next'
import './globals.css'
import Shell from '@/components/Shell'
import AppearanceProvider from '@/components/Appearance'
import AssistantBubble from '@/components/AssistantBubble'
import { APPEARANCE_DEFAULT, FONT_PRESETS } from '@/lib/appearance'
import { ensureRoleRow, getSessionUser } from '@/lib/auth/server'
import { getLowStock, getSettings } from '@/lib/data'

export const metadata: Metadata = {
  title: 'KasirKu — POS, Stok & Keuangan',
  description: 'Sistem kasir, manajemen stok, pencatatan pendapatan & pengeluaran, dan kalkulator HPP. Backend Neon Lakebase Postgres.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  const access = user ? await ensureRoleRow(user) : null
  const active = access?.status === 'aktif'
  const isOwner = active && access?.role === 'owner'
  const lowStock = isOwner ? await getLowStock() : []
  const settings = active ? await getSettings() : null
  const appearance = settings
    ? { font: settings.ui_font, accent: settings.ui_accent, density: settings.ui_density }
    : APPEARANCE_DEFAULT
  // Stylesheet font dirender server-side sesuai preset tersimpan (tanpa flash font fallback);
  // FontLoader di client hanya mengganti href saat preview live.
  const fontPreset = FONT_PRESETS.find((f) => f.id === appearance.font) ?? FONT_PRESETS[0]
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {fontPreset.google && (
          <link id="kk-fonts" rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fontPreset.google}&display=swap`} />
        )}
      </head>
      <body>
        <AppearanceProvider initial={appearance}>
          {user && active ? (
            <Shell
              user={{ email: user.email, role: access!.role }}
              lowStock={lowStock}
              supplierPhone={settings?.supplier_phone ?? ''}
              nav={settings?.nav ?? []}
              storeName={settings?.store_name ?? 'KasirKu'}
            >
              {children}
            </Shell>
          ) : children}
          {isOwner && <AssistantBubble />}
        </AppearanceProvider>
      </body>
    </html>
  )
}