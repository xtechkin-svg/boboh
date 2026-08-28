import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { db } from './db'

const ADMIN_COOKIE_NAME = 'vibefam_admin_token'
// Password for the standalone admin dashboard at /admin
// (separate from the main app's user-based admin system)
const ADMIN_DASHBOARD_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD || 'lizzieyobby@#'
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'xtech-fam-jwt-secret-2026-please-change')
const ADMIN_DASHBOARD_DAYS = 30

// Verify the standalone admin dashboard password
export function verifyAdminDashboardPassword(password: string): boolean {
  return password === ADMIN_DASHBOARD_PASSWORD
}

// Set the admin dashboard cookie (called after successful password check)
export async function setAdminDashboardCookie() {
  const token = await new SignJWT({ role: 'admin-dashboard' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_DASHBOARD_DAYS}d`)
    .sign(JWT_SECRET)
  const store = await cookies()
  store.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_DASHBOARD_DAYS * 24 * 60 * 60,
  })
}

// Clear the admin dashboard cookie
export async function clearAdminDashboardCookie() {
  const store = await cookies()
  store.delete(ADMIN_COOKIE_NAME)
}

// Check if the current request has a valid admin dashboard cookie OR is an admin user
// Returns { isAdmin: true, source: 'dashboard' | 'user' } or null
export async function getAdminSession(): Promise<{ isAdmin: true; source: 'dashboard' | 'user'; userId?: string } | null> {
  try {
    const store = await cookies()

    // First check the dashboard cookie
    const dashToken = store.get(ADMIN_COOKIE_NAME)?.value
    if (dashToken) {
      try {
        const { payload } = await jwtVerify(dashToken, JWT_SECRET)
        if (payload.role === 'admin-dashboard') {
          return { isAdmin: true, source: 'dashboard' }
        }
      } catch {
        // Invalid token, fall through to user check
      }
    }

    // Then check the regular user session
    const userToken = store.get('fam_session')?.value
    if (userToken) {
      try {
        const { payload } = await jwtVerify(userToken, JWT_SECRET)
        const userId = payload.sub
        if (!userId) return null
        // Confirm session exists in DB
        const session = await db.session.findFirst({ where: { token: userToken, userId } })
        if (!session) return null
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { id: true, isAdmin: true },
        })
        if (user?.isAdmin) {
          return { isAdmin: true, source: 'user', userId: user.id }
        }
      } catch {
        return null
      }
    }

    return null
  } catch {
    return null
  }
}
