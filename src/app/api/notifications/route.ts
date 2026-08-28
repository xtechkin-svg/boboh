import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ notifications: [] })

  const notifications = await db.notification.findMany({
    where: { toUserId: me.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      fromUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
    },
  })

  // Mark as read
  await db.notification.updateMany({
    where: { toUserId: me.id, read: false },
    data: { read: true },
  })

  return NextResponse.json({ notifications })
}
