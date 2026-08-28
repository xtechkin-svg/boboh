import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Add member (admin only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const myMembership = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
  if (!myMembership?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { username } = await req.json()
  const user = await db.user.findUnique({ where: { username: String(username).toLowerCase() } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  await db.groupMember.upsert({
    where: { groupId_userId: { groupId: id, userId: user.id } },
    update: {},
    create: { groupId: id, userId: user.id, isAdmin: false },
  })
  return NextResponse.json({ ok: true })
}
