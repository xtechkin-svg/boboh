import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Discover: search users + recent posts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''

  if (q) {
    const users = await db.user.findMany({
      where: {
        OR: [
          { username: { contains: q.toLowerCase() } },
          { displayName: { contains: q } },
        ],
      },
      take: 20,
      select: {
        id: true, username: true, displayName: true, avatarUrl: true, verified: true,
        _count: { select: { gotFollows: true } },
      },
    })
    return NextResponse.json({ users, q })
  }

  // Default: suggested users + recent posts
  const me = await getSession()
  const followingIds = me
    ? (await db.follow.findMany({ where: { followerId: me.id }, select: { followingId: true } })).map((f) => f.followingId)
    : []

  const [suggested, posts] = await Promise.all([
    me
      ? db.user.findMany({
          where: { id: { notIn: [...followingIds, me.id] } },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, username: true, displayName: true, avatarUrl: true, verified: true,
            _count: { select: { gotFollows: true } },
          },
        })
      : [],
    db.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 24,
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
  ])

  return NextResponse.json({ suggested, posts, q: '' })
}
