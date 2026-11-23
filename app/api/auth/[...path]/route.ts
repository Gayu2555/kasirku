import { getAuth } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path: string[] }> }

// handler() dibuat saat ada request (runtime), bukan saat build
const run = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') =>
  async (req: Request, ctx: Ctx) => {
    const handlers = getAuth().handler() as unknown as Record<
      string,
      (req: Request, ctx: Ctx) => Promise<Response>
    >
    return handlers[method](req, ctx)
  }

export const GET = run('GET')
export const POST = run('POST')
export const PUT = run('PUT')
export const DELETE = run('DELETE')
export const PATCH = run('PATCH')