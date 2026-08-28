import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get my saved/bookmarked posts
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bookmarks = await db.bookmark.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      post: {
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
          _count: { select: { likes: true, comments: true } },
        },
      },
    },
  })

  return NextResponse.json({
    posts: bookmarks.map((b) => ({
      ...b.post,
      bookmarked: true,
      liked: false,
      _count: b.post._count,
    })),
  })
}
