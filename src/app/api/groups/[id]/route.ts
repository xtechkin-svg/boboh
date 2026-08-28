import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get group by ID with members + hall of fame flag + recent media
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  const group = await db.chatGroup.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } } } },
      creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  const myMembership = group.members.find((m) => m.userId === me?.id)

  // Fetch recent media shared in the group (images in messages, take 12)
  // GroupMessage.text might contain image URLs like /uploads/... or https://...
  const recentMessages = await db.groupMessage.findMany({
    where: { groupId: id, text: { contains: '/uploads/' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, text: true, createdAt: true, senderId: true },
  })
  // Extract image URLs from message text
  const media: { url: string; messageId: string; createdAt: string }[] = []
  for (const msg of recentMessages) {
    const matches = msg.text.match(/\/(?:uploads|https?:\/\/[^\s]+)\/(?:[^\s"]+\.(?:jpg|jpeg|png|webp|gif))/gi) || []
    for (const url of matches.slice(0, 1)) { // one image per message
      const fullUrl = url.startsWith('http') ? url : url
      media.push({ url: fullUrl, messageId: msg.id, createdAt: msg.createdAt })
      if (media.length >= 12) break
    }
    if (media.length >= 12) break
  }

  return NextResponse.json({
    group: {
      ...group,
      onlyAdminsCanChat: group.onlyAdminsCanChat,
      isHallOfFame: (group as { isHallOfFame?: boolean }).isHallOfFame || false,
    },
    isAdmin: myMembership?.isAdmin || false,
    isMember: !!myMembership,
    media,
  })
}

// Update group settings (admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const myMembership = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
  if (!myMembership?.isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { action, onlyAdminsCanChat, targetUserId, makeAdmin, isHallOfFame } = body

  if (action === 'toggleChat') {
    await db.chatGroup.update({ where: { id }, data: { onlyAdminsCanChat: !!onlyAdminsCanChat } })
    return NextResponse.json({ ok: true, onlyAdminsCanChat: !!onlyAdminsCanChat })
  }

  if (action === 'toggleHallOfFame') {
    await db.chatGroup.update({ where: { id }, data: { isHallOfFame: !!isHallOfFame } })
    return NextResponse.json({ ok: true, isHallOfFame: !!isHallOfFame })
  }

  if (action === 'promote' && targetUserId) {
    await db.groupMember.update({
      where: { groupId_userId: { groupId: id, userId: targetUserId } },
      data: { isAdmin: !!makeAdmin },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'remove' && targetUserId) {
    await db.groupMember.delete({
      where: { groupId_userId: { groupId: id, userId: targetUserId } },
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
