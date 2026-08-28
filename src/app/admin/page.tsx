'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ============ Admin Dashboard (standalone, password-gated) ============
// Lives at /admin — independent of the main app's user-based admin system.
// Accessible via https://admin.boboh-vibes.2bd.net/ or https://boboh-vibes.2bd.net/admin

interface UserRow {
  id: string
  username: string
  displayName: string
  email: string | null
  phone: string | null
  avatarUrl: string
  verified: boolean
  verifiedType: string
  isAdmin: boolean
  isPrivate: boolean
  createdAt: string
  bio: string
  banned: boolean
  bannedReason: string
  bannedPermanently: boolean
  bannedUntil: string | null
  bannedAt: string | null
  _count: { posts: number; gotFollows: number; sentFollows: number }
}

interface AppealRow {
  id: string
  userId: string
  reason: string
  status: string
  adminNotes: string
  createdAt: string
  resolvedAt: string | null
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl: string
    banned: boolean
    bannedReason: string
    bannedPermanently: boolean
    bannedUntil: string | null
    bannedAt: string | null
  }
}

const BADGE_COLORS = [
  { type: 'blue', label: 'Blue', color: '#3b82f6' },
  { type: 'green', label: 'Green', color: '#10b981' },
  { type: 'red', label: 'Red', color: '#ef4444' },
  { type: 'black', label: 'Black', color: '#1f1f24' },
]

async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || 'Request failed')
  return data
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<'users' | 'appeals'>('users')
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [appeals, setAppeals] = useState<AppealRow[] | null>(null)
  const [usersError, setUsersError] = useState('')
  const [appealsError, setAppealsError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'banned' | 'verified' | 'admins'>('all')
  const [toast, setToast] = useState<string | null>(null)
  const [actionUser, setActionUser] = useState<UserRow | null>(null)
  const [banModal, setBanModal] = useState<{ user: UserRow; permanent: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // Check auth on mount
  useEffect(() => {
    api('/api/admin-dashboard/auth').then((d: { authenticated?: boolean }) => {
      setAuthed(!!d.authenticated)
    }).catch(() => setAuthed(false))
  }, [])

  const login = async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      await api('/api/admin-dashboard/auth', { method: 'POST', body: JSON.stringify({ password }) })
      setAuthed(true)
      setPassword('')
    } catch (e: unknown) {
      setLoginError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoginLoading(false)
    }
  }

  const logout = async () => {
    await api('/api/admin-dashboard/auth', { method: 'DELETE' }).catch(() => {})
    setAuthed(false)
    setUsers(null)
    setAppeals(null)
  }

  const loadUsers = useCallback(async () => {
    setUsersError('')
    try {
      const d = await api('/api/admin/users')
      setUsers(d.users)
    } catch (e: unknown) {
      setUsersError(e instanceof Error ? e.message : 'Failed to load users')
    }
  }, [])

  const loadAppeals = useCallback(async () => {
    setAppealsError('')
    try {
      const d = await api('/api/admin/appeals?status=pending')
      setAppeals(d.appeals)
    } catch (e: unknown) {
      setAppealsError(e instanceof Error ? e.message : 'Failed to load appeals')
    }
  }, [])

  useEffect(() => {
    if (authed && tab === 'users' && !users) loadUsers()
    if (authed && tab === 'appeals' && !appeals) loadAppeals()
  }, [authed, tab, users, appeals, loadUsers, loadAppeals])

  const banUser = async (userId: string, reason: string, permanent: boolean) => {
    try {
      await api('/api/admin/ban', { method: 'POST', body: JSON.stringify({ userId, reason, permanent }) })
      showToast(`User ${permanent ? 'permanently banned' : 'banned for 7 days'}`)
      setBanModal(null)
      loadUsers()
      if (tab === 'appeals') loadAppeals()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to ban')
    }
  }

  const unbanUser = async (userId: string) => {
    try {
      await api('/api/admin/unban', { method: 'POST', body: JSON.stringify({ userId }) })
      showToast('User unbanned')
      loadUsers()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to unban')
    }
  }

  const setBadge = async (userId: string, verifiedType: string) => {
    try {
      await api('/api/admin/verify', { method: 'POST', body: JSON.stringify({ userId, verifiedType }) })
      showToast(verifiedType ? `Badge set: ${verifiedType}` : 'Badge removed')
      loadUsers()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to set badge')
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return
    try {
      await api('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ userId }) })
      showToast('User deleted')
      loadUsers()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const resolveAppeal = async (appealId: string, status: 'approved' | 'rejected', adminNotes: string = '') => {
    try {
      await api('/api/admin/appeals', { method: 'PATCH', body: JSON.stringify({ appealId, status, adminNotes }) })
      showToast(status === 'approved' ? 'Appeal approved — user unbanned' : 'Appeal rejected — user permanently banned')
      loadAppeals()
      loadUsers()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to resolve appeal')
    }
  }

  // ============ Loading state ============
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507] text-fam-text">
        <div className="w-8 h-8 border-2 border-fam-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ============ Login screen ============
  if (!authed) {
    return (
      <div className="auth-mesh-bg min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-7">
            <div className="flex justify-center mb-4 auth-logo-glow">
              <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
                <line x1="24" y1="2" x2="24" y2="8" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="24" cy="3" r="2" fill="#22c55e" />
                <rect x="10" y="8" width="28" height="22" rx="8" fill="#22c55e" />
                <circle cx="18" cy="18" r="3" fill="white" />
                <circle cx="30" cy="18" r="3" fill="white" />
                <circle cx="18" cy="18" r="1.5" fill="#0a0a0d" />
                <circle cx="30" cy="18" r="1.5" fill="#0a0a0d" />
                <path d="M18 25 Q24 29 30 25" fill="none" stroke="#0a0a0d" strokeWidth="2" strokeLinecap="round" />
                <rect x="14" y="32" width="20" height="12" rx="4" fill="#16a34a" />
                <rect x="6" y="34" width="6" height="3" rx="1.5" fill="#22c55e" />
                <rect x="36" y="34" width="6" height="3" rx="1.5" fill="#22c55e" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">VibeFam Admin</h1>
            <p className="text-fam-muted text-sm mt-1.5">Enter password to manage users</p>
          </div>
          <div className="auth-card rounded-3xl p-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) login() }}
                placeholder="••••••••"
                autoFocus
                className="auth-input w-full rounded-xl px-4 py-3 text-sm text-fam-text"
              />
            </div>
            {loginError && <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg p-2.5 border border-rose-500/20">{loginError}</div>}
            <button
              onClick={login}
              disabled={loginLoading || !password}
              className="auth-btn-primary w-full py-3.5 rounded-xl text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loginLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Enter Dashboard'}
            </button>
          </div>
          <p className="text-center text-fam-muted text-xs mt-6">
            <a href="/" className="hover:text-fam-purple">← Back to VibeFam</a>
          </p>
        </div>
      </div>
    )
  }

  // ============ Dashboard ============
  const filteredUsers = (users || []).filter((u) => {
    if (filter === 'banned' && !u.banned) return false
    if (filter === 'verified' && !u.verified) return false
    if (filter === 'admins' && !u.isAdmin) return false
    if (search) {
      const q = search.toLowerCase()
      return u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="min-h-screen bg-[#050507] text-fam-text">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[#0d0d10]/95 backdrop-blur-xl border-b border-fam-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" className="flex-shrink-0">
            <line x1="24" y1="2" x2="24" y2="8" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="3" r="2" fill="#22c55e" />
            <rect x="10" y="8" width="28" height="22" rx="8" fill="#22c55e" />
            <circle cx="18" cy="18" r="3" fill="white" />
            <circle cx="30" cy="18" r="3" fill="white" />
            <circle cx="18" cy="18" r="1.5" fill="#0a0a0d" />
            <circle cx="30" cy="18" r="1.5" fill="#0a0a0d" />
            <path d="M18 25 Q24 29 30 25" fill="none" stroke="#0a0a0d" strokeWidth="2" strokeLinecap="round" />
            <rect x="14" y="32" width="20" height="12" rx="4" fill="#16a34a" />
            <rect x="6" y="34" width="6" height="3" rx="1.5" fill="#22c55e" />
            <rect x="36" y="34" width="6" height="3" rx="1.5" fill="#22c55e" />
          </svg>
          <div className="flex-1">
            <div className="font-bold text-base">VibeFam Admin</div>
            <div className="text-[11px] text-fam-muted">Dashboard</div>
          </div>
          <a href="/" target="_blank" className="text-fam-muted hover:text-fam-text text-sm px-3 py-1.5 rounded-lg hover:bg-fam-surface">View site →</a>
          <button onClick={logout} className="text-rose-400 hover:bg-rose-500/10 text-sm px-3 py-1.5 rounded-lg">Logout</button>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'users' ? 'border-fam-purple text-fam-text' : 'border-transparent text-fam-muted hover:text-fam-text'}`}
          >
            Users {users && users.length > 0 && <span className="ml-1 text-[10px] bg-fam-surface px-1.5 py-0.5 rounded-full">{users.length}</span>}
          </button>
          <button
            onClick={() => setTab('appeals')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'appeals' ? 'border-fam-purple text-fam-text' : 'border-transparent text-fam-muted hover:text-fam-text'}`}
          >
            Appeals {appeals && appeals.length > 0 && <span className="ml-1 text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-full">{appeals.length}</span>}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === 'users' && (
          <div>
            {/* Filters + search */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username, name, email..."
                className="flex-1 min-w-[200px] bg-fam-surface border border-fam-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fam-purple"
              />
              <div className="flex gap-1 bg-fam-surface rounded-lg p-1">
                {(['all', 'banned', 'verified', 'admins'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${filter === f ? 'bg-fam-purple text-white' : 'text-fam-muted hover:text-fam-text'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button onClick={loadUsers} className="px-3 py-2 rounded-lg bg-fam-surface text-fam-muted hover:text-fam-text text-sm" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>

            {usersError && <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg p-3 mb-4">{usersError}</div>}
            {!users && !usersError && <div className="text-center py-8 text-fam-muted text-sm">Loading users...</div>}
            {users && filteredUsers.length === 0 && <div className="text-center py-8 text-fam-muted text-sm">No users match your filters.</div>}

            {users && filteredUsers.length > 0 && (
              <div className="space-y-2">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="bg-fam-surface rounded-xl p-3 border border-fam-border">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${u.username.charCodeAt(0) % 2 === 0 ? 'bg-fam-purple' : 'bg-fam-pink'}`}>
                          {(u.displayName || u.username).charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{u.displayName || u.username}</span>
                          {u.verified && (
                            <span
                              className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] text-white font-bold"
                              style={{ background: BADGE_COLORS.find((b) => b.type === u.verifiedType)?.color || '#3b82f6' }}
                              title={`${u.verifiedType} badge`}
                            >
                              ✓
                            </span>
                          )}
                          {u.isAdmin && <span className="text-[10px] bg-fam-purple/20 text-fam-purple px-1.5 py-0.5 rounded-full font-bold uppercase">Admin</span>}
                          {u.banned && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${u.bannedPermanently ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {u.bannedPermanently ? 'Banned ⛔' : 'Banned'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-fam-muted">@{u.username} · {u._count.posts} posts · {u._count.gotFollows} followers</div>
                        {u.email && <div className="text-xs text-fam-muted">{u.email}</div>}
                        {u.banned && u.bannedReason && (
                          <div className="text-xs text-rose-400 mt-1">Reason: {u.bannedReason}</div>
                        )}
                        <div className="text-[10px] text-fam-muted mt-0.5">Joined {new Date(u.createdAt).toLocaleDateString()}</div>
                      </div>

                      {/* Actions */}
                      {!u.isAdmin && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {/* Badge buttons */}
                          <div className="flex gap-0.5 bg-fam-bg rounded-lg p-1">
                            {BADGE_COLORS.map((b) => (
                              <button
                                key={b.type}
                                onClick={() => setBadge(u.id, b.type)}
                                className={`w-6 h-6 rounded-full border-2 ${u.verifiedType === b.type ? 'border-white' : 'border-transparent'}`}
                                style={{ background: b.color }}
                                title={`Set ${b.label} badge`}
                              />
                            ))}
                            <button
                              onClick={() => setBadge(u.id, '')}
                              className="w-6 h-6 rounded-full border border-fam-border flex items-center justify-center text-fam-muted hover:text-rose-400"
                              title="Remove badge"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          </div>

                          {/* Ban / Unban */}
                          {u.banned ? (
                            <button
                              onClick={() => unbanUser(u.id)}
                              className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold hover:bg-green-500/20"
                            >
                              Unban
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setBanModal({ user: u, permanent: false })}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20"
                              >
                                Ban 7d
                              </button>
                              <button
                                onClick={() => setBanModal({ user: u, permanent: true })}
                                className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold hover:bg-rose-500/20"
                              >
                                Ban ⛔
                              </button>
                            </>
                          )}

                          {/* Delete */}
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="px-2 py-1.5 rounded-lg bg-fam-bg text-fam-muted hover:text-rose-400 text-xs"
                            title="Delete user"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'appeals' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Pending Appeals</h2>
              <button onClick={loadAppeals} className="px-3 py-2 rounded-lg bg-fam-surface text-fam-muted hover:text-fam-text text-sm" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
            {appealsError && <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg p-3 mb-4">{appealsError}</div>}
            {!appeals && !appealsError && <div className="text-center py-8 text-fam-muted text-sm">Loading appeals...</div>}
            {appeals && appeals.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-fam-text font-semibold">No pending appeals</div>
                <div className="text-fam-muted text-sm mt-1">When banned users appeal, they'll appear here.</div>
              </div>
            )}
            {appeals && appeals.length > 0 && (
              <div className="space-y-3">
                {appeals.map((a) => (
                  <div key={a.id} className="bg-fam-surface rounded-xl p-4 border border-fam-border">
                    <div className="flex items-start gap-3 mb-3">
                      {a.user.avatarUrl ? (
                        <img src={a.user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-fam-purple flex items-center justify-center text-white font-bold">
                          {(a.user.displayName || a.user.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{a.user.displayName || a.user.username} <span className="text-fam-muted font-normal">@{a.user.username}</span></div>
                        <div className="text-xs text-fam-muted">Appeal submitted {new Date(a.createdAt).toLocaleString()}</div>
                        {a.user.bannedReason && <div className="text-xs text-rose-400 mt-1">Original ban reason: {a.user.bannedReason}</div>}
                      </div>
                    </div>
                    <div className="bg-fam-bg rounded-lg p-3 text-sm text-fam-text mb-3">
                      {a.reason}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveAppeal(a.id, 'approved')}
                        className="flex-1 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm font-semibold hover:bg-green-500/20"
                      >
                        ✓ Approve (unban)
                      </button>
                      <button
                        onClick={() => {
                          const notes = prompt('Optional: admin notes for rejection (will be shown to user):') || ''
                          resolveAppeal(a.id, 'rejected', notes)
                        }}
                        className="flex-1 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-semibold hover:bg-rose-500/20"
                      >
                        ✗ Reject (permanent ban)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Ban modal */}
      {banModal && (
        <BanModal
          user={banModal.user}
          permanent={banModal.permanent}
          onClose={() => setBanModal(null)}
          onConfirm={(reason) => banUser(banModal.user.id, reason, banModal.permanent)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-fam-purple text-white text-sm px-4 py-2.5 rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

// ============ Ban modal ============
function BanModal({ user, permanent, onClose, onConfirm }: {
  user: UserRow
  permanent: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0d10] rounded-2xl p-6 w-full max-w-md border border-fam-border" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">
          {permanent ? 'Permanently Ban User?' : 'Ban User for 7 Days?'}
        </h3>
        <p className="text-sm text-fam-muted mb-4">
          @{user.username} ({user.displayName}) will be {permanent ? 'permanently banned' : 'banned for 7 days'} and logged out of all sessions.
          {!permanent && ' They can submit an appeal.'}
          {permanent && ' They cannot appeal.'}
        </p>
        <label className="block text-[11px] font-semibold text-fam-muted uppercase tracking-wider mb-1.5">
          Reason (optional, shown to user)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Violation of community guidelines..."
          className="w-full bg-fam-surface border border-fam-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-fam-purple mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-fam-surface text-fam-text text-sm font-semibold">Cancel</button>
          <button
            onClick={() => onConfirm(reason)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${permanent ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            {permanent ? 'Ban Permanently' : 'Ban 7 Days'}
          </button>
        </div>
      </div>
    </div>
  )
}
