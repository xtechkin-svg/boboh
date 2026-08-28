import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get comments for a post
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const comments = await db.comment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
    },
  })
  return NextResponse.json({ comments })
}

// Add a comment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: postId } = await params
  const body = await req.json()
  const { text } = body
  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Comment text required' }, { status: 400 })
  }

  const post = await db.post.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const comment = await db.comment.create({
    data: { postId, authorId: me.id, text: text.trim().slice(0, 500) },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } },
    },
  })

  if (post.authorId !== me.id) {
    await db.notification.create({
      data: {
        toUserId: post.authorId,
        fromUserId: me.id,
        type: 'comment',
        postId,
        text: `commented: ${text.trim().slice(0, 60)}`,
      },
    })
  }
  return NextResponse.json({ comment })
}
