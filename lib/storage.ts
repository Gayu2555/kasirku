import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const bucket = process.env.NEON_BUCKET || 'product-images'
const s3 = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION || 'ap-southeast-1',
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const key = `products/${randomUUID()}.${ext}`
  
  const arrayBuffer = await file.arrayBuffer()
  const body = Buffer.from(arrayBuffer)
  
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type,
    }),
  )
  
  // Return public URL (Neon Storage uses path-style addressing)
  const endpoint = process.env.AWS_ENDPOINT_URL_S3 || ''
  return `${endpoint}/${bucket}/${key}`
}

export async function deleteImage(url: string): Promise<void> {
  try {
    const urlObj = new URL(url)
    const key = urlObj.pathname.slice(bucket.length + 1) // Remove /bucket-name/
    
    if (!key) return
    
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    )
  } catch (e) {
    console.error('Failed to delete image:', e)
  }
}

export function getPublicUrl(key: string): string {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3 || ''
  const bucketName = bucket
  return `${endpoint}/${bucketName}/${key}`
}