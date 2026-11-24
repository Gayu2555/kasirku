import sql from '@/lib/db'
import { getSessionUser } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const out: Record<string, string> = {}
  try {
    const r = await sql`select 1 as ok`
    out.db = 'ok ' + r[0].ok
  } catch (e) {
    out.db = 'ERR ' + (e instanceof Error ? e.message : String(e))
  }
  try {
    const u = await getSessionUser()
    out.session = u ? 'ok (login)' : 'ok (belum login)'
  } catch (e) {
    out.session = 'ERR ' + (e instanceof Error ? e.message : String(e))
  }
  return Response.json(out)
}