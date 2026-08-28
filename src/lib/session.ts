import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from './db'
import bcrypt from 'bcryptjs'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'xtech-fam-secret-2026-change-me')
const COOKIE_NAME = 'fam_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  verified: boolean
  verifiedType: string
  isAdmin: boolean
  isPrivate: boolean
  isOfficialAI: boolean
  whatsappNumber: string
  bio: string
  _count?: { posts: number; gotFollows: number; sentFollows: number }
}

async function createSessionToken(userId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(SECRET)
  await db.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  return token
}

export async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId)
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {})
  }
  store.delete(COOKIE_NAME)
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE_NAME)?.value
    if (!token) return null

    // Verify JWT first
    const { payload } = await jwtVerify(token, SECRET)
    const userId = payload.sub
    if (!userId) return null

    // Confirm session exists in DB (allows server-side logout)
    const session = await db.session.findFirst({ where: { token, userId } })
    if (!session) return null

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, verifiedType: true, isAdmin: true, isPrivate: true, isOfficialAI: true, whatsappNumber: true, bio: true },
    })
    return user
  } catch {
    return null
  }
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function hashPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 10)
}

export async function verifyPassword(p: string, hash: string): Promise<boolean> {
  return bcrypt.compare(p, hash)
}
