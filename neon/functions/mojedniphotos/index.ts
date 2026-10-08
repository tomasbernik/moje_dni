import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const BUCKET = 'moje-dni-photos'
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const origins = (process.env.MOJE_DNI_ALLOWED_ORIGINS ?? 'https://tomasbernik.github.io,http://localhost:8000,http://127.0.0.1:8000')
  .split(',').map(value => value.trim()).filter(Boolean)
const jwksUrl = process.env.NEON_AUTH_JWKS_URL ?? ''
const authBaseUrl = process.env.NEON_AUTH_BASE_URL ?? ''
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null
const issuer = authBaseUrl ? new URL(authBaseUrl).origin : ''
const s3 = new S3Client({ forcePathStyle: true })

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function json(origin: string, status: number, body: object) {
  return Response.json(body, { status, headers: cors(origin) })
}

export default async function handler(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  if (!origins.includes(origin)) return json(origin, 403, { error: 'Nepovolena adresa aplikacie.' })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (request.method !== 'POST') return json(origin, 405, { error: 'Nepovolena poziadavka.' })
  if (!jwks || !issuer) return json(origin, 503, { error: 'Autentifikacia nie je nastavena.' })

  const authorization = request.headers.get('authorization')
  if (!authorization?.toLowerCase().startsWith('bearer ')) return json(origin, 401, { error: 'Prihlasenie je povinne.' })
  let userId = ''
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer })
    userId = payload.sub ?? ''
  } catch {
    return json(origin, 401, { error: 'Prihlasenie vyprsalo.' })
  }

  const url = new URL(request.url)
  const action = url.searchParams.get('action') ?? ''
  const path = url.searchParams.get('path') ?? ''
  if (!userId || !path.startsWith(`${userId}/`) || path.includes('..')) {
    return json(origin, 403, { error: 'K tejto fotke nemas pristup.' })
  }

  try {
    if (action === 'upload') {
      const declaredSize = Number(request.headers.get('content-length') ?? 0)
      if (declaredSize > MAX_UPLOAD_BYTES) return json(origin, 413, { error: 'Fotka je prilis velka.' })
      const bytes = new Uint8Array(await request.arrayBuffer())
      if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return json(origin, 413, { error: 'Fotka je prazdna alebo prilis velka.' })
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET, Key: path, Body: bytes,
        ContentType: request.headers.get('content-type') ?? 'application/octet-stream',
      }))
      return json(origin, 200, { stored: true })
    }
    if (action === 'delete') {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path }))
      return json(origin, 200, { deleted: true })
    }
    if (action === 'url') {
      const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: path }), { expiresIn: 3600 })
      return json(origin, 200, { signedUrl })
    }
    return json(origin, 400, { error: 'Neznama operacia.' })
  } catch {
    return json(origin, 503, { error: 'Ulozisko je docasne nedostupne.' })
  }
}
