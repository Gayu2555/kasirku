import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const bucket = process.env.NEON_BUCKET?.trim() || 'product-images'

function resolveEndpoint(): string {
  const configured = process.env.AWS_ENDPOINT_URL_S3?.trim()
  if (configured) return configured.replace(/\/+$/, '')

  const branchId = process.env.NEON_BRANCH_ID?.trim()
  const suffix = process.env.NEON_FUNCTION_HOST_SUFFIX?.trim()
  if (branchId && suffix) {
    const storageSuffix = suffix.replace(/^\.compute\./, '.storage.').replace(/\/+$/, '')
    return `https://${branchId}${storageSuffix}`
  }

  throw new Error(
    'Endpoint Object Storage belum diset. Isi AWS_ENDPOINT_URL_S3 di environment (atau NEON_BRANCH_ID + NEON_FUNCTION_HOST_SUFFIX).',
  )
}

function makeClient(url: string): S3Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Kredensial Object Storage belum diset (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).')
  }
  return new S3Client({
    forcePathStyle: true,
    region: process.env.AWS_REGION?.trim() || 'ap-southeast-1',
    endpoint: url,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })
}

let endpoint: string | undefined
let client: S3Client | undefined

function getClient(): S3Client {
  if (!client) {
    endpoint = resolveEndpoint()
    client = makeClient(endpoint)
  }
  return client
}

function redirectedEndpoint(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const e = error as {
    name?: string
    message?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  }
  const text = `${e.name ?? ''} ${e.Code ?? ''} ${e.message ?? ''}`
  const isRedirect = e.$metadata?.httpStatusCode === 301
    || /permanentredirect|must be addressed using the specified endpoint/i.test(text)
  if (!isRedirect) return null

  const xml = e.message?.match(/<Endpoint>\s*([^<\s]+)\s*<\/Endpoint>/i)?.[1]
  const bare = e.message?.match(/\b(?:https?:\/\/)?[\w.-]+\.storage\.[\w.-]+\.aws\.neon\.tech\b/i)?.[0]
  const raw = xml ?? bare
  if (!raw) return null
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/+$/, '')
}

async function send<T>(run: (client: S3Client) => Promise<T>): Promise<T> {
  const current = getClient()
  try {
    return await run(current)
  } catch (error) {
    const next = redirectedEndpoint(error)
    if (!next || next === endpoint) throw error
    endpoint = next
    client = makeClient(next)
    return run(client)
  }
}

function keyFromUrl(url: string): string | null {
  try {
    let path = decodeURIComponent(new URL(url).pathname)
    const prefix = `/${bucket}/`
    if (path.startsWith(prefix)) path = path.slice(prefix.length)
    path = path.replace(/^\/+/, '')
    return path || null
  } catch {
    return null
  }
}

function publicUrl(key: string): string {
  const base = endpoint ?? resolveEndpoint()
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${base}/${bucket}/${path}`
}

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const key = `products/${randomUUID()}.${ext}`
  const body = Buffer.from(await file.arrayBuffer())

  await send((s3) => s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type,
    }),
  ))

  return publicUrl(key)
}

export async function deleteImage(url: string): Promise<void> {
  const key = keyFromUrl(url)
  if (!key) return
  try {
    await send((s3) => s3.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    ))
  } catch (e) {
    console.error('Failed to delete image:', e)
  }
}

export function getPublicUrl(key: string): string {
  return publicUrl(key)
}
