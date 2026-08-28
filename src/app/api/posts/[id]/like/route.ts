import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Toggle like on a post
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: postId } = await params
  const post = await db.post.findUnique({ where: { id: postId } })
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const existing = await db.like.findUnique({
    where: { postId_userId: { postId, userId: me.id } },
  })

  if (existing) {
    await db.like.delete({ where: { id: existing.id } })
    return NextResponse.json({ liked: false })
  }

  await db.like.create({ data: { postId, userId: me.id } })

  // Create notification (don't notify self)
  if (post.authorId !== me.id) {
    await db.notification.create({
      data: {
        toUserId: post.authorId,
        fromUserId: me.id,
        type: 'like',
        postId,
        text: 'liked your post',
      },
    })
  }
  return NextResponse.json({ liked: true })
}
