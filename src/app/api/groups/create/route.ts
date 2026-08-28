import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import crypto from 'crypto'

export const runtime = 'nodejs'

function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(0, chars.length)]
  return code
}

// Create group
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, description } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  let inviteCode = genInviteCode()
  while (await db.chatGroup.findUnique({ where: { inviteCode } })) inviteCode = genInviteCode()

  const group = await db.chatGroup.create({
    data: { name: name.trim(), description: description || '', inviteCode, createdBy: me.id },
  })
  await db.groupMember.create({ data: { groupId: group.id, userId: me.id, isAdmin: true } })
  return NextResponse.json({ ok: true, group })
}

// Get my groups
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const memberships = await db.groupMember.findMany({
    where: { userId: me.id },
    include: { group: { include: { _count: { select: { members: true } } } } },
  })
  return NextResponse.json({ groups: memberships.map((m) => ({ ...m.group, isAdmin: m.isAdmin })) })
}
