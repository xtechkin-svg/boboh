import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const following = await db.follow.findMany({
    where: { followerId: me.id },
    select: { followingId: true },
  })
  const storyAuthorIds = [me.id, ...following.map((f) => f.followingId)]

  const [posts, stories] = await Promise.all([
    db.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: me.id }, select: { id: true } },
        bookmarks: { where: { userId: me.id }, select: { id: true } },
      },
    }),
    db.story.findMany({
      where: {
        expiresAt: { gt: new Date() },
        authorId: { in: storyAuthorIds },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      },
    }),
  ])

  // Group stories by author — format: { author, isMine, items: [...] }
  const storyByAuthor = new Map<string, { author: typeof stories[number]['author']; isMine: boolean; items: any[] }>()
  for (const s of stories) {
    if (!storyByAuthor.has(s.authorId)) {
      storyByAuthor.set(s.authorId, {
        author: s.author,
        isMine: s.authorId === me.id,
        items: [],
      })
    }
    storyByAuthor.get(s.authorId)!.items.push({
      id: s.id,
      imageUrl: s.imageUrl || '',
      caption: s.caption || '',
      createdAt: s.createdAt,
      musicTitle: (s as any).musicTitle || '',
      musicArtist: (s as any).musicArtist || '',
      musicPreviewUrl: (s as any).musicPreviewUrl || '',
      musicArtworkUrl: (s as any).musicArtworkUrl || '',
    })
  }

  const storyGroups = Array.from(storyByAuthor.values())
  // Put my stories first
  storyGroups.sort((a, b) => (a.isMine ? -1 : b.isMine ? 1 : 0))

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      liked: p.likes.length > 0,
      bookmarked: p.bookmarks.length > 0,
      likes: undefined,
      bookmarks: undefined,
    })),
    stories: storyGroups,
  })
}
