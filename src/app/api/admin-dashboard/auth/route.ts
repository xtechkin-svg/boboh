import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminDashboardPassword, setAdminDashboardCookie, clearAdminDashboardCookie, getAdminSession } from '@/lib/admin-session'

export const runtime = 'nodejs'

// POST — login with password
// GET — check if already authenticated
// DELETE — logout

export async function GET() {
  const session = await getAdminSession()
  if (session?.isAdmin) {
    return NextResponse.json({ authenticated: true, source: session.source })
  }
  return NextResponse.json({ authenticated: false })
}

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 })

  if (!verifyAdminDashboardPassword(password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 })
  }

  await setAdminDashboardCookie()
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  await clearAdminDashboardCookie()
  return NextResponse.json({ ok: true })
}
