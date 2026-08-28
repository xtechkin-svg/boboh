import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Stable upload directory — outside /opt/fam so redeploys never wipe user uploads.
const UPLOAD_DIR = process.env.UPLOAD_DIR || (
  process.env.NODE_ENV === 'production'
    ? '/var/lib/vibefam-uploads'
    : path.join(process.cwd(), 'public', 'uploads')
)

// Max sizes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024  // 50 MB

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-mov']
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.m4v']

export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const fileName = (file.name || '').toLowerCase()
    const isImage = IMAGE_TYPES.includes(file.type) || IMAGE_EXTS.some(ext => fileName.endsWith(ext))
    const isVideo = VIDEO_TYPES.includes(file.type) || VIDEO_EXTS.some(ext => fileName.endsWith(ext))

    if (!isImage && !isVideo) {
      return NextResponse.json({
        error: `Only images (JPG, PNG, WEBP, GIF) or videos (MP4, WEBM, MOV) allowed (got: ${file.type || 'unknown'})`
      }, { status: 400 })
    }

    // Size check
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    const maxLabel = isVideo ? '50MB' : '10MB'
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxLabel})` }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // Determine extension
    let ext = 'jpg'
    if (isVideo) {
      ext = 'mp4'
      if (file.type === 'video/webm' || fileName.endsWith('.webm')) ext = 'webm'
      else if (file.type === 'video/quicktime' || file.type === 'video/x-mov' || fileName.endsWith('.mov')) ext = 'mov'
    } else {
      if (file.type === 'image/png' || fileName.endsWith('.png')) ext = 'png'
      else if (file.type === 'image/webp' || fileName.endsWith('.webp')) ext = 'webp'
      else if (file.type === 'image/gif' || fileName.endsWith('.gif')) ext = 'gif'
    }

    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    fs.writeFileSync(path.join(UPLOAD_DIR, name), bytes)

    return NextResponse.json({
      url: `/uploads/${name}`,
      type: isVideo ? 'video' : 'image',
      size: file.size
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Upload failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
