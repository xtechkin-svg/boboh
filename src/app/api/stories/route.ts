import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Create a story (with optional music)
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { imageUrl, caption, filter, musicTitle, musicArtist, musicPreviewUrl, musicArtworkUrl } = body
  // Allow text-only stories (no image required for text mode)
  // imageUrl can be empty string for text stories

  const story = await db.story.create({
    data: {
      authorId: me.id,
      imageUrl: imageUrl || '',
      caption: caption || '',
      filter: filter || 'none',
      musicTitle: musicTitle || '',
      musicArtist: musicArtist || '',
      musicPreviewUrl: musicPreviewUrl || '',
      musicArtworkUrl: musicArtworkUrl || '',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })
  return NextResponse.json({ story })
}

// Get all active stories (with music fields)
export async function GET() {
  const me = await getSession()
  const where = { expiresAt: { gt: new Date() } }

  const stories = await db.story.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })

  // Group by author
  const map = new Map<string, { author: typeof stories[number]['author']; items: typeof stories }>()
  for (const s of stories) {
    if (!map.has(s.authorId)) map.set(s.authorId, { author: s.author, items: [] })
    map.get(s.authorId)!.items.push(s)
  }

  const meId = me?.id
  const groups = Array.from(map.values()).map((g) => ({
    author: g.author,
    isMine: g.author.id === meId,
    items: g.items.map((s) => ({
      id: s.id, imageUrl: s.imageUrl, caption: s.caption, createdAt: s.createdAt,
      musicTitle: s.musicTitle, musicArtist: s.musicArtist,
      musicPreviewUrl: s.musicPreviewUrl, musicArtworkUrl: s.musicArtworkUrl,
    })),
  }))

  // Put my stories first if I have any
  groups.sort((a, b) => (a.isMine ? -1 : b.isMine ? 1 : 0))
  return NextResponse.json({ stories: groups })
}
