import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Create a post (supports text-only, image, or video)
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { imageUrl, videoUrl, caption, location, filter } = body

    // Must have at least text OR an image OR a video
    const hasText = caption && caption.trim()
    const hasImage = imageUrl && imageUrl.trim()
    const hasVideo = videoUrl && videoUrl.trim()
    if (!hasText && !hasImage && !hasVideo) {
      return NextResponse.json({ error: 'Post must have text, an image, or a video' }, { status: 400 })
    }

    const post = await db.post.create({
      data: {
        authorId: me.id,
        imageUrl: imageUrl || '',
        videoUrl: videoUrl || '',
        caption: caption || '',
        location: location || '',
        filter: filter || 'none',
      },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
        _count: { select: { likes: true, comments: true } },
      },
    })

    return NextResponse.json({ post })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Create post failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Get recent posts (for discover) — include videoUrl
export async function GET() {
  const posts = await db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, imageUrl: true, videoUrl: true, caption: true, location: true, filter: true,
      viewCount: true, createdAt: true,
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      _count: { select: { likes: true, comments: true } },
    },
  })
  return NextResponse.json({ posts })
}

// Track a view on a post
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { postId } = body
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
  const post = await db.post.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } }).catch(() => null)
  return NextResponse.json({ ok: true, viewCount: post?.viewCount || 0 })
}
