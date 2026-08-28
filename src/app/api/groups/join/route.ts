import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Join group by invite code
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { inviteCode } = await req.json()
  const group = await db.chatGroup.findUnique({ where: { inviteCode: String(inviteCode).trim().toUpperCase() } })
  if (!group) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })

  const existing = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: me.id } } })
  if (existing) return NextResponse.json({ ok: true, group, alreadyMember: true })

  await db.groupMember.create({ data: { groupId: group.id, userId: me.id, isAdmin: false } })
  return NextResponse.json({ ok: true, group })
}
