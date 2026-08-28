import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Update avatar URL (after uploading via /api/upload)
export async function PATCH(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { avatarUrl } = body
  if (!avatarUrl) return NextResponse.json({ error: 'avatarUrl required' }, { status: 400 })

  const user = await db.user.update({
    where: { id: me.id },
    data: { avatarUrl },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      verified: true, verifiedType: true, bio: true, isPrivate: true,
      coverUrl: true, dateOfBirth: true, gender: true,
      profileSetupCompleted: true, isAdmin: true, isOfficialAI: true,
      whatsappNumber: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })
  return NextResponse.json({ user })
}
