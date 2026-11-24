import { neon, Client } from '@neondatabase/serverless'

type Runner = (text: string, values: unknown[]) => Promise<any[]>

function getUrl(): string {
  const u = process.env.DATABASE_URL
  if (!u) throw new Error('DATABASE_URL belum diatur')
  return u
}

function makeTag(run: Runner) {
  return <T extends any[] = any[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> => {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1]
    const params = values.map((v) => (v === undefined ? null : v))
    return run(text, params) as Promise<T>
  }
}

// Query biasa: HTTP, stateless, aman dipakai di Workers.
const base = makeTag((text, values) => neon(getUrl()).query(text, values as any[]) as Promise<any[]>)

// Transaksi: satu koneksi WebSocket per transaksi.
async function begin<T>(fn: (tx: typeof base) => Promise<T>): Promise<T> {
  const client = new Client(getUrl())
  await client.connect()
  try {
    await client.query('begin')
    const tx = makeTag(async (text, values) => (await client.query(text, values as any[])).rows)
    const out = await fn(tx)
    await client.query('commit')
    return out
  } catch (e) {
    try { await client.query('rollback') } catch {}
    throw e
  } finally {
    await client.end()
  }
}

const sql = Object.assign(base, {
  begin,
  json: (v: unknown) => JSON.stringify(v),
})

export default sql