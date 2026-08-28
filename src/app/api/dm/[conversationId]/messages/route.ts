import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get messages in a conversation (includes audioUrl, imageUrl, viewOnce fields)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.user1Id !== me.id && conv.user2Id !== me.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      replyTo: {
        include: { sender: { select: { id: true, username: true, displayName: true } } },
      },
    },
  })

  // Mark all incoming messages as read
  await db.message.updateMany({
    where: { conversationId, senderId: { not: me.id }, read: false },
    data: { read: true },
  })

  return NextResponse.json({ messages })
}

// Send a message (text, voice note, or photo — optionally view-once)
export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params
  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.user1Id !== me.id && conv.user2Id !== me.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { text, replyToId, audioUrl, imageUrl, viewOnce } = body

  // Must have at least one of: text, audioUrl, imageUrl
  const hasText = text && text.trim()
  const hasAudio = audioUrl && audioUrl.trim()
  const hasImage = imageUrl && imageUrl.trim()
  if (!hasText && !hasAudio && !hasImage) {
    return NextResponse.json({ error: 'Text, audio, or image required' }, { status: 400 })
  }

  // Validate replyToId
  if (replyToId) {
    const replyMsg = await db.message.findUnique({ where: { id: replyToId } })
    if (!replyMsg || replyMsg.conversationId !== conversationId) {
      return NextResponse.json({ error: 'Invalid reply target' }, { status: 400 })
    }
  }

  // viewOnce only applies to image messages
  const isViewOnce = viewOnce === true && hasImage

  const message = await db.message.create({
    data: {
      conversationId,
      senderId: me.id,
      text: text || '',
      audioUrl: audioUrl || '',
      imageUrl: imageUrl || '',
      viewOnce: isViewOnce,
      replyToId: replyToId || null,
    },
    include: {
      replyTo: {
        include: { sender: { select: { id: true, username: true, displayName: true } } },
      },
    },
  })

  return NextResponse.json({ message })
}
