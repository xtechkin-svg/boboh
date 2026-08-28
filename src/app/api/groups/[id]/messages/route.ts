import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get group messages (with reply context)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isMember = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
  if (!isMember) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const messages = await db.groupMessage.findMany({
    where: { groupId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      replyTo: {
        include: { sender: { select: { id: true, username: true, displayName: true } } },
      },
    },
  })
  return NextResponse.json({ messages })
}

// Send group message (with optional replyToId)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const membership = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Check if only admins can chat
  const group = await db.chatGroup.findUnique({ where: { id } })
  if (group?.onlyAdminsCanChat && !membership.isAdmin) {
    return NextResponse.json({ error: 'Only admins can send messages in this group' }, { status: 403 })
  }

  const { text, replyToId } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  // Validate replyToId belongs to same group if provided
  if (replyToId) {
    const replyMsg = await db.groupMessage.findUnique({ where: { id: replyToId } })
    if (!replyMsg || replyMsg.groupId !== id) {
      return NextResponse.json({ error: 'Invalid reply target' }, { status: 400 })
    }
  }

  const msg = await db.groupMessage.create({
    data: {
      groupId: id,
      senderId: me.id,
      text: text.trim().slice(0, 2000),
      replyToId: replyToId || null,
    },
    include: {
      sender: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
      replyTo: {
        include: { sender: { select: { id: true, username: true, displayName: true } } },
      },
    },
  })
  return NextResponse.json({ message: msg })
}
