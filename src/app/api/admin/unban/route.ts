import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Unban a user (admin only — accepts either user-session admin OR dashboard admin)
// Body: { userId }
export async function POST(req: NextRequest) {
  const me = await getAdminSession()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await db.user.update({
    where: { id: userId },
    data: {
      banned: false,
      bannedReason: '',
      bannedPermanently: false,
      bannedUntil: null,
      bannedAt: null,
    },
  })

  // Notify the user
  if (me.userId) {
    await db.notification.create({
      data: {
        toUserId: userId,
        fromUserId: me.userId,
        type: 'gift',
        text: '✅ Your account has been unbanned. You can use VibeFam again.',
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
