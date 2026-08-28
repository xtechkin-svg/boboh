import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ user: null })

  // Update lastSeen to now (user is active)
  await db.user.update({
    where: { id: me.id },
    data: { lastSeen: new Date() },
  }).catch(() => {})

  // Get full stats + ban info
  const user = await db.user.findUnique({
    where: { id: me.id },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      verified: true, verifiedType: true, bio: true, isPrivate: true,
      isAdmin: true, isOfficialAI: true, whatsappNumber: true,
      profileSetupCompleted: true, dateOfBirth: true, gender: true, coverUrl: true,
      banned: true, bannedReason: true, bannedPermanently: true, bannedUntil: true, bannedAt: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })

  // If user is banned, return null user + ban info
  if (user?.banned) {
    if (!user.bannedPermanently && user.bannedUntil && new Date(user.bannedUntil) < new Date()) {
      await db.user.update({
        where: { id: user.id },
        data: {
          banned: false, bannedReason: '', bannedPermanently: false,
          bannedUntil: null, bannedAt: null,
        },
      })
      const fresh = await db.user.findUnique({
        where: { id: me.id },
        select: {
          id: true, username: true, displayName: true, avatarUrl: true,
          verified: true, verifiedType: true, bio: true, isPrivate: true,
          isAdmin: true, isOfficialAI: true, whatsappNumber: true,
          profileSetupCompleted: true, dateOfBirth: true, gender: true, coverUrl: true,
          banned: true, bannedReason: true, bannedPermanently: true, bannedUntil: true, bannedAt: true,
          _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
        },
      })
      return NextResponse.json({ user: fresh })
    }
    return NextResponse.json({
      user: null,
      banInfo: {
        banned: true,
        reason: user.bannedReason,
        permanent: user.bannedPermanently,
        until: user.bannedUntil,
        bannedAt: user.bannedAt,
      },
    })
  }

  return NextResponse.json({ user })
}
