import { createNeonAuth } from '@neon/auth/next/server'
import { redirect } from 'next/navigation'
import sql from '@/lib/db'
import type { RoleStatus } from '@/lib/types'

type NeonAuth = ReturnType<typeof createNeonAuth>

let _auth: NeonAuth | null = null

// Dibuat saat pertama dipakai (runtime), bukan saat modul di-import (build).
export function getAuth(): NeonAuth {
  if (!_auth) {
    _auth = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    })
  }
  return _auth
}

// Kompatibel dengan kode lama: auth.getSession(), auth.handler(), dst.
export const auth = new Proxy({} as NeonAuth, {
  get(_target, prop) {
    const real = getAuth()
    const value = Reflect.get(real, prop)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export type Role = 'owner' | 'kasir'

export async function getSessionUser() {
  const { data: session } = await getAuth().getSession()
  return session?.user ?? null
}

// User pertama yang mendaftar jadi owner (aktif); berikutnya kasir pending approval.
export async function ensureRoleRow(user: { id: string; email: string }): Promise<{ role: Role; status: RoleStatus }> {
  const rows = await sql`select role, status from app_roles where user_id = ${user.id}`
  if (rows.length) return { role: rows[0].role as Role, status: rows[0].status as RoleStatus }
  const [c] = await sql`select count(*)::int as n from app_roles`
  const role: Role = c.n === 0 ? 'owner' : 'kasir'
  const status: RoleStatus = c.n === 0 ? 'aktif' : 'pending'
  await sql`
    insert into app_roles (user_id, email, role, status)
    values (${user.id}, ${user.email}, ${role}, ${status})
    on conflict (user_id) do nothing`
  return { role, status }
}

export async function ensureRole(user: { id: string; email: string }): Promise<Role> {
  return (await ensureRoleRow(user)).role
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) redirect('/masuk')
  const { status } = await ensureRoleRow(user)
  if (status !== 'aktif') redirect(`/masuk?blokir=${status}`)
  return user
}

export async function requireOwner() {
  const user = await requireUser()
  const role = await ensureRole(user)
  if (role !== 'owner') redirect('/kasir')
  return user
}

// Guard untuk server action: null berarti tidak berhak.
export async function actionGuard(min: Role) {
  const user = await getSessionUser()
  if (!user) return null
  const { role, status } = await ensureRoleRow(user)
  if (status !== 'aktif') return null
  if (min === 'owner' && role !== 'owner') return null
  return { id: user.id, email: user.email, role }
}