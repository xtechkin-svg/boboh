import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Toggle follow
export async function POST(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { username } = await params
  const target = await db.user.findUnique({ where: { username: username.toLowerCase() } })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.id === me.id) return NextResponse.json({ error: "Can't follow yourself" }, { status: 400 })

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
  })

  if (existing) {
    await db.follow.delete({ where: { id: existing.id } })
    return NextResponse.json({ following: false })
  }

  await db.follow.create({ data: { followerId: me.id, followingId: target.id } })
  await db.notification.create({
    data: {
      toUserId: target.id,
      fromUserId: me.id,
      type: 'follow',
      text: 'started following you',
    },
  })
  return NextResponse.json({ following: true })
}
