import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/session'

export const runtime = 'nodejs'

// One-time admin setup — creates the official VibeFam admin account
// GET to check if admin exists, POST to create
export async function GET() {
  const admin = await db.user.findFirst({ where: { isAdmin: true } })
  return NextResponse.json({ adminExists: !!admin, username: admin?.username || '' })
}

export async function POST() {
  const existing = await db.user.findFirst({ where: { isAdmin: true } })
  if (existing) return NextResponse.json({ ok: true, message: 'Admin already exists', username: existing.username })

  const passwordHash = await hashPassword('vibefam2026')
  const admin = await db.user.create({
    data: {
      username: 'vibefam',
      displayName: 'VibeFam',
      passwordHash,
      verified: true,
      verifiedType: 'blue',
      isAdmin: true,
      isPrivate: true,
      isOfficialAI: false,
      bio: 'Official VibeFam account. For support and verification.',
      whatsappNumber: '254795314221',
    },
  })

  // Also create the VibeFam AI account (no profile, just for AI chats)
  const aiExists = await db.user.findFirst({ where: { isOfficialAI: true } })
  if (!aiExists) {
    await db.user.create({
      data: {
        username: 'vibefam_ai',
        displayName: 'VibeFam AI',
        passwordHash: await hashPassword(Math.random().toString(36)),
        verified: true,
        verifiedType: 'blue',
        isOfficialAI: true,
        isPrivate: true,
        bio: 'VibeFam AI assistant',
      },
    })
  }

  return NextResponse.json({
    ok: true,
    message: 'Admin + AI accounts created',
    adminUsername: admin.username,
    adminPassword: 'vibefam2026',
  })
}
