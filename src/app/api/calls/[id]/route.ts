import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// GET /api/calls/[id] — get call status + SDP offer/answer (for WebRTC signaling)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await db.call.findUnique({
    where: { id },
    select: {
      id: true, status: true, type: true,
      sdpOffer: true, sdpAnswer: true,
      startedAt: true, endedAt: true,
      fromUserId: true, toUserId: true,
    },
  })

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (call.fromUserId !== me.id && call.toUserId !== me.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({ call })
}

// PATCH /api/calls/[id] — update call (save SDP offer/answer, or end call)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const call = await db.call.findUnique({ where: { id } })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (call.fromUserId !== me.id && call.toUserId !== me.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const update: { sdpOffer?: string; sdpAnswer?: string; status?: string; endedAt?: Date } = {}

  if (body.sdpOffer) update.sdpOffer = body.sdpOffer
  if (body.sdpAnswer) update.sdpAnswer = body.sdpAnswer
  if (body.status === 'ended') { update.status = 'ended'; update.endedAt = new Date() }

  const updated = await db.call.update({ where: { id }, data: update })
  return NextResponse.json({ ok: true, call: updated })
}
