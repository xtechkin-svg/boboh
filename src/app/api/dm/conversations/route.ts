import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get all my conversations (with last message preview + unread count)
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversations = await db.conversation.findMany({
    where: { OR: [{ user1Id: me.id }, { user2Id: me.id }] },
    orderBy: { updatedAt: 'desc' },
    include: {
      user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
      user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, text: true, senderId: true, createdAt: true, read: true },
      },
    },
  })

  const result = await Promise.all(
    conversations.map(async (c) => {
      const otherUser = c.user1Id === me.id ? c.user2 : c.user1
      const lastMessage = c.messages[0] || null
      const unreadCount = await db.message.count({
        where: {
          conversationId: c.id,
          senderId: { not: me.id },
          read: false,
        },
      })
      return {
        id: c.id,
        otherUser,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          sentAt: lastMessage.createdAt,
          isMine: lastMessage.senderId === me.id,
        } : null,
        unreadCount,
      }
    })
  )

  return NextResponse.json({ conversations: result })
}

// Start or fetch a conversation with another user
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { username, userId } = body

  let target = userId
  if (!target && username) {
    const u = await db.user.findUnique({ where: { username: username.toLowerCase() } })
    if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    target = u.id
  }
  if (!target) return NextResponse.json({ error: 'username or userId required' }, { status: 400 })
  if (target === me.id) return NextResponse.json({ error: "Can't DM yourself" }, { status: 400 })

  // Sort IDs to ensure unique constraint works regardless of who initiates
  const [user1Id, user2Id] = [me.id, target].sort()

  const conversation = await db.conversation.upsert({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    update: {},
    create: { user1Id, user2Id },
    include: {
      user1: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
      user2: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
    },
  })

  const otherUser = conversation.user1Id === me.id ? conversation.user2 : conversation.user1

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      otherUser,
    },
  })
}
