import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Ban a user (admin only — accepts either user-session admin OR dashboard admin)
// Body: { userId, reason, permanent (boolean) }
export async function POST(req: NextRequest) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { userId, reason, permanent } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // Prevent banning other admins or yourself
  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.isAdmin) return NextResponse.json({ error: 'Cannot ban an admin' }, { status: 400 })

  await db.user.update({
    where: { id: userId },
    data: {
      banned: true,
      bannedReason: (reason || '').slice(0, 500),
      bannedPermanently: !!permanent,
      bannedUntil: permanent ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default for non-permanent
      bannedAt: new Date(),
    },
  })

  // Notify the user (best-effort — admin source might be dashboard with no userId)
  if (me.userId) {
    await db.notification.create({
      data: {
        toUserId: userId,
        fromUserId: me.userId,
        type: 'gift',
        text: `Your account has been ${permanent ? 'permanently banned' : 'banned for 7 days'}.${reason ? ` Reason: ${reason}` : ''}`,
      },
    }).catch(() => {})
  }

  // Invalidate all sessions for the banned user
  await db.session.deleteMany({ where: { userId } }).catch(() => {})

  return NextResponse.json({ ok: true })
}
