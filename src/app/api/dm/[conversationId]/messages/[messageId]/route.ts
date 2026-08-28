import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// DELETE /api/dm/[conversationId]/messages/[messageId]
// Unsend (delete for everyone) — only the SENDER can do this.
// Removes the message from the DB entirely so it disappears for both parties.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, messageId } = await params

  const msg = await db.message.findUnique({ where: { id: messageId } })
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  if (msg.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Message does not belong to this conversation' }, { status: 400 })
  }
  // Only the sender can unsend (delete for everyone)
  if (msg.senderId !== me.id) {
    return NextResponse.json({ error: 'You can only unsend your own messages' }, { status: 403 })
  }

  // Clear replyTo references pointing to this message (so deleting doesn't break FK)
  await db.message.updateMany({
    where: { replyToId: messageId },
    data: { replyToId: null },
  })

  await db.message.delete({ where: { id: messageId } })

  return NextResponse.json({ ok: true })
}

// PATCH /api/dm/[conversationId]/messages/[messageId]
// Body: { action: 'view' } — mark a view-once photo as viewed (recipient only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, messageId } = await params
  const body = await req.json()
  const { action } = body

  const msg = await db.message.findUnique({ where: { id: messageId } })
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  if (msg.conversationId !== conversationId) {
    return NextResponse.json({ error: 'Message does not belong to this conversation' }, { status: 400 })
  }

  if (action === 'view') {
    // Only the recipient (not sender) can mark as viewed
    if (msg.senderId === me.id) {
      return NextResponse.json({ ok: true, message: 'Sender view — no change' })
    }
    const updated = await db.message.update({
      where: { id: messageId },
      data: { viewed: true },
    })
    return NextResponse.json({ ok: true, message: updated })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
