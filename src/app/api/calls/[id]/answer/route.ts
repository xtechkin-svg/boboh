import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// POST /api/calls/[id]/answer
// Called by the RECIPIENT when they tap "Answer" on an incoming call.
// Marks the call as 'answered'. The caller polls /api/calls/[id] and sees the status change.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await db.call.findUnique({ where: { id } })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Only the recipient can answer
  if (call.toUserId !== me.id) {
    return NextResponse.json({ error: 'Only the recipient can answer this call' }, { status: 403 })
  }

  // Mark as answered
  const updated = await db.call.update({
    where: { id },
    data: { status: 'answered' },
  })

  return NextResponse.json({ ok: true, call: updated })
}

// POST /api/calls/[id]/decline
// Called by the RECIPIENT when they tap "Decline" on an incoming call.
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await db.call.findUnique({ where: { id } })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  // Only the recipient can decline, or the caller can cancel
  if (call.toUserId !== me.id && call.fromUserId !== me.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const updated = await db.call.update({
    where: { id },
    data: { status: 'missed', endedAt: new Date() },
  })

  return NextResponse.json({ ok: true, call: updated })
}
