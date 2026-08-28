import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get profile by username — includes coverUrl + lastSeen + bannedProfile
export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const me = await getSession()

  const user = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true, username: true, displayName: true, bio: true, avatarUrl: true,
      coverUrl: true,
      verified: true, verifiedType: true, isAdmin: true, isPrivate: true, isOfficialAI: true,
      whatsappNumber: true, createdAt: true,
      lastSeen: true,
      banned: true, bannedReason: true, bannedPermanently: true, bannedUntil: true, bannedAt: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const bannedProfile = user.banned ? {
    reason: user.bannedReason,
    permanent: user.bannedPermanently,
    until: user.bannedUntil,
    bannedAt: user.bannedAt,
  } : null

  if (user.isPrivate && me?.id !== user.id && !me?.isAdmin) {
    return NextResponse.json({
      user: {
        ...user,
        bio: '',
        isFollowing: false,
        isMe: false,
        isPrivate: true,
        _count: { posts: 0, gotFollows: 0, sentFollows: 0 },
      },
      posts: [],
      privateProfile: true,
      bannedProfile,
    })
  }

  let isFollowing = false
  if (me && me.id !== user.id) {
    const f = await db.follow.findUnique({
      where: { followerId_followingId: { followerId: me.id, followingId: user.id } },
    })
    isFollowing = !!f
  }

  const posts = await db.post.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true, imageUrl: true, videoUrl: true, caption: true, createdAt: true, viewCount: true,
      _count: { select: { likes: true, comments: true } },
    },
  })

  return NextResponse.json({
    user: {
      ...user,
      isFollowing,
      isMe: me?.id === user.id,
    },
    posts,
    bannedProfile,
  })
}
