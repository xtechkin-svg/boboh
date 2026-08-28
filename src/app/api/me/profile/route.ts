import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Update profile (bio, displayName, coverUrl)
// displayName changes are limited to 2 per 60 days (Facebook-style).
export async function PATCH(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { displayName, bio, isPrivate, coverUrl } = body

  const update: { displayName?: string; bio?: string; isPrivate?: boolean; coverUrl?: string; displayNameChangedAt?: Date; displayNameChangeCount?: { increment: number } } = {}
  if (typeof bio === 'string') update.bio = bio.slice(0, 200)
  if (typeof isPrivate === 'boolean') update.isPrivate = isPrivate
  if (typeof coverUrl === 'string') update.coverUrl = coverUrl

  // Display name change limiting — 2 changes per 60 days
  if (typeof displayName === 'string' && displayName.trim()) {
    const newName = displayName.trim().slice(0, 50)
    // Get current user to check change history
    const current = await db.user.findUnique({
      where: { id: me.id },
      select: { displayName: true, displayNameChangedAt: true, displayNameChangeCount: true },
    })
    if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Only count as a change if the name is actually different
    if (current.displayName !== newName) {
      const now = new Date()
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

      // If they've never changed, or their last change was >60 days ago, reset count
      let count = current.displayNameChangeCount || 0
      let lastChanged = current.displayNameChangedAt ? new Date(current.displayNameChangedAt) : null

      if (!lastChanged || lastChanged < sixtyDaysAgo) {
        count = 0
      }

      if (count >= 2) {
        const daysLeft = lastChanged ? Math.ceil((sixtyDaysAgo.getTime() - lastChanged.getTime()) / (24 * 60 * 60 * 1000)) : 0
        return NextResponse.json({
          error: `You've reached the limit of 2 name changes per 60 days. Try again in ${Math.max(1, daysLeft)} days.`,
        }, { status: 400 })
      }

      update.displayName = newName
      update.displayNameChangedAt = now
      update.displayNameChangeCount = { increment: 1 }
    }
  }

  const user = await db.user.update({
    where: { id: me.id },
    data: update,
    select: {
      id: true, username: true, displayName: true, bio: true, avatarUrl: true,
      coverUrl: true, verified: true, verifiedType: true, isPrivate: true,
      dateOfBirth: true, gender: true, profileSetupCompleted: true,
      isAdmin: true, isOfficialAI: true, whatsappNumber: true,
      displayNameChangedAt: true, displayNameChangeCount: true,
      _count: { select: { posts: true, gotFollows: true, sentFollows: true } },
    },
  })
  return NextResponse.json({ user })
}
