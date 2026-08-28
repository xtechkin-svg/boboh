import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get story comments
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: storyId } = await params
  const comments = await db.storyComment.findMany({
    where: { storyId },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })
  return NextResponse.json({ comments })
}

// Add a story comment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: storyId } = await params
  const body = await req.json()
  const { text } = body
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  const story = await db.story.findUnique({ where: { id: storyId } })
  if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const comment = await db.storyComment.create({
    data: { storyId, authorId: me.id, text: text.trim().slice(0, 500) },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true } },
    },
  })

  if (story.authorId !== me.id) {
    await db.notification.create({
      data: { toUserId: story.authorId, fromUserId: me.id, type: 'story_comment', text: `replied to your story: ${text.trim().slice(0, 60)}` },
    })
  }
  return NextResponse.json({ comment })
}
