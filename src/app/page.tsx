'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ============ TYPES ============
interface SessionUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  verified: boolean
  verifiedType?: string
  bio?: string
  isPrivate?: boolean
  coverUrl?: string
  dateOfBirth?: string | null
  gender?: string
  profileSetupCompleted?: boolean
  isAdmin?: boolean
  isOfficialAI?: boolean
  whatsappNumber?: string
  _count?: { posts: number; gotFollows: number; sentFollows: number }
}
interface BanInfo {
  banned: boolean
  reason: string
  permanent: boolean
  until: string | null
  bannedAt: string | null
}
interface Author {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  verified: boolean
  verifiedType?: string
}
interface Post {
  id: string
  imageUrl: string
  videoUrl?: string
  caption: string
  location: string
  filter: string
  viewCount: number
  createdAt: string
  author: Author
  liked: boolean
  bookmarked: boolean
  _count: { likes: number; comments: number }
}
interface Comment {
  id: string
  text: string
  createdAt: string
  author: Author
}
interface StoryGroup {
  author: Author
  isMine: boolean
  items: { id: string; imageUrl: string; caption: string; createdAt: string; musicTitle?: string; musicArtist?: string; musicPreviewUrl?: string; musicArtworkUrl?: string }[]
}
interface Notification {
  id: string
  type: string
  text: string
  read: boolean
  createdAt: string
  fromUser: Author
  postId?: string | null
}
interface Conversation {
  id: string
  otherUser: Author
  lastMessage: { text: string; sentAt: string; isMine: boolean } | null
  unreadCount: number
}
interface Message {
  id: string
  text: string
  senderId: string
  read: boolean
  createdAt: string
  audioUrl?: string
  imageUrl?: string
  viewOnce?: boolean
  viewed?: boolean
  replyTo?: {
    id: string
    text: string
    sender: { id: string; username: string; displayName: string }
  } | null
}
interface Wallet {
  id: string
  balance: number
  balanceKES: string
  transactions: {
    id: string
    type: string
    amount: number
    amountKES: string
    reference: string
    status: string
    createdAt: string
  }[]
  stats: { giftsReceived: number; giftsSent: number }
}

// CSS filter presets
const FILTERS: { name: string; label: string; css: string }[] = [
  { name: 'none', label: 'Original', css: 'none' },
  { name: 'grayscale', label: 'Mono', css: 'grayscale(1)' },
  { name: 'sepia', label: 'Sepia', css: 'sepia(0.8)' },
  { name: 'vivid', label: 'Vivid', css: 'saturate(1.6) contrast(1.1)' },
  { name: 'cool', label: 'Cool', css: 'hue-rotate(-15deg) saturate(1.2)' },
  { name: 'warm', label: 'Warm', css: 'hue-rotate(15deg) saturate(1.3) brightness(1.05)' },
  { name: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  { name: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.3) brightness(0.9)' },
  { name: 'dream', label: 'Dream', css: 'blur(0.5px) brightness(1.1) saturate(1.2)' },
  { name: 'invert', label: 'Invert', css: 'invert(1)' },
]

function filterCss(name: string): string {
  return FILTERS.find((f) => f.name === name)?.css || 'none'
}

// ============ API HELPERS ============
async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error || 'Request failed')
  return data
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d2 = Math.floor(h / 24)
  if (d2 < 7) return `${d2}d`
  return new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

// Format ISO/epoch-ms timestamp as "h:mm AM/PM" (WhatsApp-style)
function waTime(d: string | number): string {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  if (isNaN(date.getTime())) return ''
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

// Pick a stable avatar color class (1-8) by hashing the name
function waAvatarClass(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `wa-avatar-${(Math.abs(hash) % 8) + 1}`
}

// Initial letter (uppercase) for avatar fallback
function waInitial(name: string): string {
  return (name?.trim()?.charAt(0) || '?').toUpperCase()
}



// ============ Banned Screen (shown to banned users) — WhatsApp-style ============
function BannedScreen({ banInfo, me, onAppealSubmitted, onLogout }: {
  banInfo: BanInfo
  me: SessionUser
  onAppealSubmitted: () => void
  onLogout: () => void
}) {
  const [showAppeal, setShowAppeal] = useState(false)
  const [appealText, setAppealText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submitAppeal = async () => {
    if (!appealText.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await api('/api/admin/appeals', { method: 'POST', body: JSON.stringify({ reason: appealText.trim() }) })
      setSuccess(true)
      setShowAppeal(false)
      setAppealText('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit appeal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white">
      {/* WhatsApp-style account icon with red "no" symbol */}
      <div className="relative mb-8">
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-fam-purple to-fam-violet flex items-center justify-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        {/* Red "no" symbol overlay (circle with diagonal line) */}
        <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full bg-red-500 flex items-center justify-center border-4 border-black">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <circle cx="12" cy="12" r="10" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      </div>

      {/* Main message — WhatsApp style */}
      <h1 className="text-xl font-bold text-center mb-2 max-w-sm">
        This account can no longer use Boboh Vibe
      </h1>
      <p className="text-gray-400 text-sm text-center mb-2 max-w-sm">
        {banInfo.permanent
          ? 'Your account has been permanently banned.'
          : 'Your account has been temporarily banned.'}
      </p>
      {banInfo.reason && (
        <p className="text-gray-500 text-xs text-center mb-6 max-w-sm">
          Reason: {banInfo.reason}
        </p>
      )}
      {!banInfo.reason && <div className="mb-6" />}

      {/* Success message after appeal submission */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6 max-w-sm w-full">
          <div className="flex items-center gap-2 text-green-400 text-sm font-semibold mb-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Appeal Submitted
          </div>
          <p className="text-gray-400 text-xs">
            We'll review your appeal within 24 hours. If approved, you'll be able to log in again.
          </p>
        </div>
      )}

      {/* Action buttons — WhatsApp-style green "Request a review" */}
      {!banInfo.permanent && !success && (
        <>
          {!showAppeal ? (
            <button
              onClick={() => setShowAppeal(true)}
              className="w-full max-w-sm py-3.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm mb-3 flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11H1l3-3-3-3" /><path d="M22 12A10 10 0 1 1 9 3" />
              </svg>
              Request a review
            </button>
          ) : (
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-3">
              <h3 className="text-sm font-semibold mb-1">Submit your appeal</h3>
              <p className="text-gray-500 text-xs mb-3">
                Tell us why you think this ban should be lifted. We'll review within 24 hours.
              </p>
              <textarea
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Explain why you think this ban should be lifted..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-green-500 mb-3 text-white placeholder:text-gray-600"
                autoFocus
              />
              {error && <div className="text-red-400 text-xs mb-2">{error}</div>}
              <div className="flex gap-2">
                <button onClick={() => setShowAppeal(false)} className="flex-1 py-2.5 rounded-lg bg-zinc-800 text-gray-300 text-xs font-semibold">Cancel</button>
                <button
                  onClick={submitAppeal}
                  disabled={submitting || !appealText.trim()}
                  className="flex-1 py-2.5 rounded-lg bg-green-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Appeal'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {banInfo.permanent && (
        <div className="w-full max-w-sm bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-center">
          <p className="text-red-400 text-sm font-semibold mb-1">Permanent Ban</p>
          <p className="text-gray-500 text-xs">
            This ban cannot be appealed. If you believe this is an error, contact support@boboh-vibes.2bd.net
          </p>
        </div>
      )}

      <button
        onClick={onLogout}
        className="w-full max-w-sm py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-gray-400 hover:text-white text-sm font-semibold"
      >
        Log out
      </button>

      <p className="text-gray-600 text-xs mt-8 text-center max-w-sm">
        @{me.username} · Boboh Vibe
      </p>
    </div>
  )
}

// ============ Banned Profile Banner (shown on banned user profiles) ============
function BannedProfileBanner({ banInfo }: { banInfo: { reason: string; permanent: boolean; until: string | null; bannedAt: string | null } }) {
  return (
    <div className={`mx-4 mt-3 rounded-xl p-3 border ${banInfo.permanent ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
      <div className="flex items-center gap-2.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={banInfo.permanent ? '#f43f5e' : '#fbbf24'} strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <div className="flex-1">
          <div className={`text-sm font-semibold ${banInfo.permanent ? 'text-rose-400' : 'text-amber-400'}`}>
            Account {banInfo.permanent ? 'Permanently ' : ''}Banned
          </div>
          {banInfo.reason && <div className="text-xs text-fam-muted mt-0.5">{banInfo.reason}</div>}
          {!banInfo.permanent && banInfo.until && (
            <div className="text-xs text-fam-muted mt-0.5">Until {new Date(banInfo.until).toLocaleDateString()}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ URL/link helpers ============
// Detect vibefam.dpdns.org/@username or /@username or #profile=username mentions in text
interface VibeFamLinkMatch {
  url: string
  username: string
  fullMatch: string
  startIndex: number
  endIndex: number
}

function parseVibeFamLinks(text: string): VibeFamLinkMatch[] {
  const matches: VibeFamLinkMatch[] = []
  // Match: vibefam.dpdns.org/@user OR xtechfamchat.duckdns.org/@user OR just @username (when surrounded by spaces or start/end)
  const urlRegex = /(?:https?:\/\/)?(?:vibefam\.dpdns\.org|xtechfamchat\.duckdns\.org)?\/@([a-zA-Z0-9_]{1,30})/g
  let m: RegExpExecArray | null
  while ((m = urlRegex.exec(text)) !== null) {
    matches.push({
      url: m[0],
      username: m[1],
      fullMatch: m[0],
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    })
  }
  return matches
}

// Render chat text with @mentions and links as clickable spans
function ChatText({ text, onViewUser }: { text: string; onViewUser: (u: string) => void }) {
  const links = parseVibeFamLinks(text)
  if (links.length === 0) {
    // Still convert @username (standalone) to clickable
    const parts = text.split(/(\s+@[a-zA-Z0-9_]{1,30}\b)/g)
    return (
      <span>
        {parts.map((part, i) => {
          const mentionMatch = part.match(/^(\s+)@([a-zA-Z0-9_]{1,30})$/)
          if (mentionMatch) {
            return (
              <span key={i}>
                {mentionMatch[1]}
                <a
                  href={`/@${mentionMatch[2]}`}
                  onClick={(e) => { e.preventDefault(); onViewUser(mentionMatch[2]) }}
                  className="text-fam-purple font-semibold hover:underline"
                >
                  @{mentionMatch[2]}
                </a>
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </span>
    )
  }
  // Has vibefam links — render with link cards below
  return <span>{text}</span>
}

// VibeFam link preview card (renders below the message text)
function VibeFamLinkCard({ username, onViewUser }: { username: string; onViewUser: (u: string) => void }) {
  return (
    <div
      className="vibefam-link-card flex items-center gap-2.5"
      onClick={(e) => { e.stopPropagation(); onViewUser(username) }}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${waAvatarClass(username)}`}>
        {waInitial(username)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-fam-purple truncate">@{username}</div>
        <div className="text-[10px] text-fam-muted truncate">View Boboh Vibe profile →</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-muted flex-shrink-0">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </div>
  )
}

// Render message text + any link cards detected below
function ChatMessageContent({ text, onViewUser }: { text: string; onViewUser: (u: string) => void }) {
  const links = parseVibeFamLinks(text)
  const cleanedText = links.length > 0
    ? text.replace(/(?:https?:\/\/)?(?:vibefam\.dpdns\.org|xtechfamchat\.duckdns\.org)?\/@[a-zA-Z0-9_]{1,30}/g, '').trim()
    : text
  return (
    <>
      {cleanedText && <div className="leading-snug whitespace-pre-wrap break-words"><ChatText text={cleanedText} onViewUser={onViewUser} /></div>}
      {links.map((link, i) => (
        <VibeFamLinkCard key={i} username={link.username} onViewUser={onViewUser} />
      ))}
    </>
  )
}

// Reply preview shown inside a chat bubble (for messages that reply to another)
function ReplyPreviewInBubble({ replyTo, isMe, onViewUser }: {
  replyTo: { id: string; text: string; sender: { id: string; username: string; displayName: string } }
  isMe: boolean
  onViewUser: (u: string) => void
}) {
  return (
    <div
      className={`reply-preview ${isMe ? 'bg-white/15' : ''}`}
      onClick={(e) => { e.stopPropagation(); onViewUser(replyTo.sender.username) }}
    >
      <div className={`reply-preview-author ${isMe ? 'text-white' : ''}`}>
        ↳ {replyTo.sender.displayName || replyTo.sender.username}
      </div>
      <div className={`reply-preview-text ${isMe ? 'text-white/80' : ''}`}>
        {replyTo.text.slice(0, 100)}{replyTo.text.length > 100 ? '…' : ''}
      </div>
    </div>
  )
}

// Reply composer shown above input bar (when user is composing a reply)
function ReplyComposer({ replyTo, onCancel, isGroup }: {
  replyTo: { id: string; text: string; sender: { displayName: string; username: string } }
  onCancel: () => void
  isGroup: boolean
}) {
  return (
    <div className="reply-composer">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-purple flex-shrink-0">
        <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-fam-purple font-semibold text-[11px]">
          Replying to {isGroup ? replyTo.sender.displayName || replyTo.sender.username : replyTo.sender.displayName}
        </div>
        <div className="text-fam-muted text-[11px] truncate">{replyTo.text}</div>
      </div>
      <button onClick={onCancel} className="text-fam-muted hover:text-fam-text flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

// Long-press hook for chat messages (returns handlers + active state)
function useLongPress(onLongPress: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pressing, setPressing] = useState(false)

  const start = () => {
    setPressing(true)
    timerRef.current = setTimeout(() => {
      onLongPress()
      setPressing(false)
    }, ms)
  }
  const clear = () => {
    setPressing(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  return {
    pressing,
    handlers: {
      onTouchStart: start,
      onTouchEnd: clear,
      onTouchMove: clear,
      onMouseDown: start,
      onMouseUp: clear,
      onMouseLeave: clear,
    },
  }
}

// ============ Voice Chat Modal (stub) ============
function VoiceChatModal({ groupName, onClose, showToast }: {
  groupName: string
  onClose: () => void
  showToast: (m: string) => void
}) {
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [participants] = useState<string[]>(['You'])

  useEffect(() => {
    const t = setTimeout(() => {
      setConnecting(false)
      showToast('Voice chat is a preview — full WebRTC coming soon')
    }, 2200)
    return () => clearTimeout(t)
  }, [showToast])

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="voice-chat-modal rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-fam-muted text-[11px] uppercase tracking-wider mb-1">Voice chat</div>
          <div className="text-white font-bold text-lg">{groupName}</div>
        </div>

        {/* Voice orb */}
        <div className="flex justify-center my-8">
          <div className="voice-orb w-32 h-32 rounded-full flex items-center justify-center">
            {connecting ? (
              <Spinner size="lg" />
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="text-center mb-6">
          <div className="text-white text-sm font-semibold">
            {connecting ? 'Connecting…' : `${participants.length} in call`}
          </div>
          <div className="text-fam-muted text-xs mt-1">
            {connecting ? 'Setting up voice channel' : 'You · ' + participants.join(', ')}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setMuted(!muted)}
            className={`voice-btn ${muted ? 'active' : ''}`}
            title={muted ? 'Unmute' : 'Mute'}
            disabled={connecting}
          >
            {muted ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setSpeaker(!speaker)}
            className={`voice-btn ${speaker ? 'active' : ''}`}
            title="Speaker"
            disabled={connecting}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="voice-btn danger"
            title="Leave call"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 12h5l-5 4v-3H9.5c-.83 0-1.5-.67-1.5-1.5S8.67 10 9.5 10H17V7l5 4-5 1z" transform="rotate(180 12 12)" />
            </svg>
          </button>
        </div>
        <div className="text-center mt-4 text-[11px] text-fam-muted">
          {muted ? 'Mic muted' : 'Mic on'} · {speaker ? 'Speaker on' : 'Speaker off'}
        </div>
      </div>
    </div>
  )
}

// ============ Hall of Fame Modal ============
function HallOfFameModal({ groupName, onClose, isAdmin, onToggle, isHallOfFame }: {
  groupName: string
  onClose: () => void
  isAdmin: boolean
  onToggle: () => void
  isHallOfFame: boolean
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="hof-modal-bg rounded-2xl p-6 w-full max-w-sm border border-yellow-500/20" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-xl font-bold text-white">Hall of Fame</h2>
          <div className="text-yellow-400/80 text-sm mt-1">{groupName}</div>
        </div>

        <div className="bg-black/30 rounded-xl p-4 mb-4">
          <p className="text-fam-text text-sm leading-relaxed">
            Hall of Fame groups are the most active and engaged communities on VibeFam.
            Members get a special badge on their profile and the group gets priority placement in discovery.
          </p>
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs text-fam-muted">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">•</span>
              <span>500+ members</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">•</span>
              <span>1,000+ messages per month</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">•</span>
              <span>Active moderation (no reports in 30 days)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">•</span>
              <span>Verified admin in good standing</span>
            </div>
          </div>
        </div>

        <div className={`text-center text-xs mb-4 ${isHallOfFame ? 'text-yellow-400' : 'text-fam-muted'}`}>
          {isHallOfFame
            ? '✓ This group is in the Hall of Fame'
            : 'This group has not been inducted yet'}
        </div>

        {isAdmin && (
          <button
            onClick={onToggle}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold ${
              isHallOfFame
                ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
            }`}
          >
            {isHallOfFame ? 'Remove from Hall of Fame' : 'Induct into Hall of Fame'}
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-[#F5F5F7] text-fam-text text-sm font-semibold mt-2"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ============ Chat Lock Screen (PIN entry) ============
function ChatLockScreen({ chatId, chatName, onUnlock, onExit }: {
  chatId: string
  chatName: string
  onUnlock: () => void
  onExit: () => void
}) {
  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)

  const checkPin = (pin: string) => {
    if (pin.length === 4) {
      const stored = localStorage.getItem(`vibefam-chat-pin-${chatId}`)
      if (stored === pin) {
        onUnlock()
      } else {
        setError(true)
        setTimeout(() => { setEntered(''); setError(false) }, 600)
      }
    }
  }

  const pressKey = (k: string) => {
    if (entered.length >= 4) return
    const next = entered + k
    setEntered(next)
    setError(false)
    if (next.length === 4) {
      setTimeout(() => checkPin(next), 150)
    }
  }

  const backspace = () => {
    setEntered(entered.slice(0, -1))
    setError(false)
  }

  return (
    <div className="fixed inset-0 z-[60] chat-lock-bg flex flex-col items-center justify-center p-6">
      <button onClick={onExit} className="absolute top-4 left-4 text-fam-muted hover:text-fam-text p-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="w-16 h-16 rounded-full bg-fam-purple/20 flex items-center justify-center mb-4">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <div className="text-white font-bold text-lg mb-1">{chatName}</div>
      <div className="text-fam-muted text-sm mb-8">Enter PIN to unlock chat</div>

      <div className={`flex gap-3 mb-10 ${error ? 'animate-pulse' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`pin-dot ${i < entered.length ? 'filled' : ''} ${error ? 'border-rose-500' : ''}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button key={k} onClick={() => pressKey(k)} className="pin-key">{k}</button>
        ))}
        <div />
        <button onClick={() => pressKey('0')} className="pin-key">0</button>
        <button onClick={backspace} className="pin-key">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// PIN setup modal (first time locking a chat)
function PinSetupModal({ chatId, onClose, onSet }: {
  chatId: string
  onClose: () => void
  onSet: () => void
}) {
  const [step, setStep] = useState<'set' | 'confirm'>('set')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (step === 'set') {
      if (pin1.length !== 4) return setError('PIN must be 4 digits')
      setError('')
      setStep('confirm')
    } else {
      if (pin1 !== pin2) {
        setError('PINs do not match')
        setPin2('')
        return
      }
      localStorage.setItem(`vibefam-chat-pin-${chatId}`, pin1)
      localStorage.setItem(`vibefam-chat-locked-${chatId}`, '1')
      onSet()
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#F5F5F7] rounded-2xl p-6 w-full max-w-xs border border-fam-purple/30" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🔐</div>
          <h3 className="text-white font-bold text-lg">
            {step === 'set' ? 'Set a 4-digit PIN' : 'Confirm your PIN'}
          </h3>
          <p className="text-fam-muted text-xs mt-1">
            You'll need this PIN to unlock this chat next time.
          </p>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={step === 'set' ? pin1 : pin2}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4)
            if (step === 'set') setPin1(v)
            else setPin2(v)
            setError('')
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          autoFocus
          className="auth-input w-full text-center text-2xl tracking-[0.5em] py-3 rounded-xl text-white mb-3"
          placeholder="••••"
        />
        {error && <div className="text-rose-400 text-xs text-center mb-3">{error}</div>}
        <button
          onClick={submit}
          disabled={(step === 'set' ? pin1 : pin2).length !== 4}
          className="w-full py-2.5 rounded-xl auth-btn-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {step === 'set' ? 'Continue' : 'Lock chat'}
        </button>
        <button onClick={onClose} className="w-full py-2 rounded-xl text-fam-muted text-xs mt-2">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ============ Hamburger slide-out menu ============
function HamburgerMenu({ me, open, onClose, onNavigate, onLogout, onSwitchAccount, theme, onThemeChange, onOpenSecurity }: {
  me: SessionUser
  open: boolean
  onClose: () => void
  onNavigate: (view: 'profile' | 'wallet' | 'saved' | 'admin') => void
  onLogout: () => void
  onSwitchAccount: () => void
  theme: 'white' | 'classic'
  onThemeChange: (t: 'white' | 'classic') => void
  onOpenSecurity: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[55]">
      <div className="hamburger-overlay absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="hamburger-panel absolute right-0 top-0 bottom-0 w-72 max-w-[80vw] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-fam-border">
          <div className="flex items-center gap-3">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${waAvatarClass(me.username)}`}>
                {waInitial(me.displayName || me.username)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm text-black truncate">{me.displayName || me.username}</span>
                {me.verified && <VerifiedBadge type={me.verifiedType} />}
              </div>
              <div className="text-xs text-fam-muted truncate">@{me.username}</div>
            </div>
            <button onClick={onClose} className="p-2 text-fam-muted hover:text-fam-text">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Menu items */}
        <div className="flex-1 overflow-y-auto py-2">
          <button className="hamburger-item" onClick={() => { onNavigate('profile'); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span>My Profile</span>
          </button>
          <button className="hamburger-item" onClick={() => { onNavigate('wallet'); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" />
            </svg>
            <span>Wallet</span>
          </button>
          <button className="hamburger-item" onClick={() => { onNavigate('saved'); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span>Saved</span>
          </button>
          <button className="hamburger-item" onClick={() => { onOpenSecurity(); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Account &amp; Security</span>
          </button>
          <button className="hamburger-item" onClick={() => { onNavigate('live' as 'profile'); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="8" cy="12" r="2" />
              <path d="M14 10v4M18 10v4" />
            </svg>
            <span>Go Live</span>
          </button>
          {me.isAdmin && (
            <button className="hamburger-item" onClick={() => { onNavigate('admin'); onClose() }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
              </svg>
              <span>Admin Panel</span>
            </button>
          )}
          <button className="hamburger-item" onClick={() => { onSwitchAccount(); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
            </svg>
            <span>Switch account</span>
          </button>
        </div>

        {/* Theme switcher */}
        <div className="px-4 py-3 border-t border-fam-border">
          <div className="text-[11px] text-fam-muted uppercase font-semibold tracking-wider mb-2">Theme</div>
          <div className="flex gap-1 bg-fam-surface rounded-lg p-1">
            <button
              onClick={() => onThemeChange('white')}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 ${theme === 'white' ? 'bg-fam-purple text-white' : 'text-fam-muted'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
              White
            </button>
            <button
              onClick={() => onThemeChange('classic')}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 ${theme === 'classic' ? 'text-white' : 'text-fam-muted'}`}
              style={theme === 'classic' ? { background: 'linear-gradient(135deg, #c9a227, #9d4edd)' } : {}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z" /></svg>
              Classic
            </button>
          </div>
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-fam-border">
          <button className="hamburger-item danger" onClick={() => { onLogout(); onClose() }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  )
}


// ============ Chat Bubble (extracted to avoid hooks-in-map) ============
function DmChatBubble({ m, idx, messages, me, otherUser, onViewUser, onReply }: {
  m: Message
  idx: number
  messages: Message[]
  me: SessionUser
  otherUser: Author
  onViewUser: (u: string) => void
  onReply: (msg: { id: string; text: string; sender: { displayName: string; username: string } }) => void
}) {
  const isMe = m.senderId === me.id
  const prev = idx > 0 ? messages[idx - 1] : null
  const showSender = !prev || prev.senderId !== m.senderId
  const longPress = useLongPress(() => {
    onReply({
      id: m.id,
      text: m.text,
      sender: { displayName: otherUser.displayName || otherUser.username, username: otherUser.username },
    })
  }, 500)

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`message-bubble max-w-[78%] px-2.5 py-1.5 text-[14px] ${isMe ? 'wa-bubble-out' : 'wa-bubble-in'} ${longPress.pressing ? 'long-press' : ''}`}
        {...longPress.handlers}
      >
        {m.replyTo && (
          <ReplyPreviewInBubble replyTo={m.replyTo} isMe={isMe} onViewUser={onViewUser} />
        )}
        {showSender && (
          <div className={`text-[12px] font-bold mb-0.5 flex items-center gap-1 ${isMe ? 'text-white/95' : 'text-fam-purple'}`}>
            <span>{isMe ? 'You' : otherUser.displayName || otherUser.username}</span>
            {!isMe && otherUser.verified && <VerifiedBadge type={otherUser.verifiedType} size={12} />}
          </div>
        )}
        {m.audioUrl ? (
          <VoiceNotePlayer audioUrl={m.audioUrl} isMe={isMe} />
        ) : (
          <ChatMessageContent text={m.text} onViewUser={onViewUser} />
        )}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-white/70' : 'text-fam-muted'}`}>
          <span className="text-[10px]">{waTime(m.createdAt)}</span>
          {isMe && (
            <svg width="14" height="14" viewBox="0 0 16 11" fill="none">
              <path d="M11.071.653a.5.5 0 0 1 .076.704l-6 7.5a.5.5 0 0 1-.704.076l-3-2.5a.5.5 0 1 1 .643-.768l2.617 2.18L10.367.73a.5.5 0 0 1 .704-.076z" fill="currentColor"/>
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupChatBubble({ m, idx, messages, me, onViewUser, onReply }: {
  m: { id: string; text: string; senderId: string; sender: Author; replyTo?: { id: string; text: string; sender: { id: string; username: string; displayName: string } } | null }
  idx: number
  messages: { id: string; text: string; senderId: string; sender: Author; replyTo?: { id: string; text: string; sender: { id: string; username: string; displayName: string } } | null }[]
  me: SessionUser
  onViewUser: (u: string) => void
  onReply: (msg: { id: string; text: string; sender: { displayName: string; username: string } }) => void
}) {
  const isMe = m.senderId === me.id
  const prev = idx > 0 ? messages[idx - 1] : null
  const showAvatar = !prev || prev.senderId !== m.senderId
  const senderName = m.sender?.displayName || m.sender?.username || 'Unknown'
  const senderUsername = m.sender?.username || 'unknown'
  const longPress = useLongPress(() => {
    onReply({ id: m.id, text: m.text, sender: { displayName: senderName, username: senderUsername } })
  }, 500)

  return (
    <div className={`flex gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
      {!isMe && (
        <div className="w-8 flex-shrink-0 self-end">
          {showAvatar && (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[13px] ${waAvatarClass(senderUsername)}`}>
              {waInitial(senderName)}
            </div>
          )}
        </div>
      )}
      {isMe && <div className="wa-accent-bar self-stretch min-h-[24px]" />}
      <div
        className={`message-bubble max-w-[72%] px-2.5 py-1.5 text-[14px] ${isMe ? 'wa-bubble-out' : 'wa-bubble-in'} ${longPress.pressing ? 'long-press' : ''}`}
        {...longPress.handlers}
      >
        {m.replyTo && (
          <ReplyPreviewInBubble replyTo={m.replyTo} isMe={isMe} onViewUser={onViewUser} />
        )}
        {showAvatar && !isMe && (
          <div className="text-[12px] font-bold text-fam-purple mb-0.5 flex items-center gap-1"><span>~ {senderName}</span>{m.sender?.verified && <VerifiedBadge type={m.sender.verifiedType} size={12} />}</div>
        )}
        {showAvatar && isMe && (
          <div className="text-[12px] font-bold text-white/95 mb-0.5">~ You</div>
        )}
        <ChatMessageContent text={m.text} onViewUser={onViewUser} />
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-white/70' : 'text-fam-muted'}`}>
          <span className="text-[10px]">{waTime(m.createdAt)}</span>
          {isMe && (
            <svg width="14" height="14" viewBox="0 0 16 11" fill="none">
              <path d="M11.071.653a.5.5 0 0 1 .076.704l-6 7.5a.5.5 0 0 1-.704.076l-3-2.5a.5.5 0 1 1 .643-.768l2.617 2.18L10.367.73a.5.5 0 0 1 .704-.076z" fill="currentColor"/>
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}


// ============ Voice Note Player (audio playback in chat bubbles) ============
function VoiceNotePlayer({ audioUrl, isMe }: { audioUrl: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => setDuration(audio.duration)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMe ? 'bg-white/20' : 'bg-fam-purple/20'}`}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        )}
      </button>
      <div className="flex-1">
        {/* Waveform-like progress bar */}
        <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        <div className={`text-[10px] mt-0.5 ${isMe ? 'text-white/70' : 'text-fam-muted'}`}>
          {formatTime(playing ? currentTime : duration)} 🎤
        </div>
      </div>
    </div>
  )
}


// ============ Last Seen Status (real activity tracking, not fake "online") ============
function LastSeenStatus({ username }: { username: string }) {
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchLastSeen = useCallback(async () => {
    try {
      const d = await api(`/api/users/${username}`)
      const ls = d.user?.lastSeen
      setLastSeen(ls)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    fetchLastSeen()
    // Poll every 30 seconds for updated last seen
    const t = setInterval(fetchLastSeen, 30000)
    return () => clearInterval(t)
  }, [fetchLastSeen])

  const formatLastSeen = (ls: string) => {
    const date = new Date(ls)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    // If active within last 2 minutes, show "online"
    if (diffMin < 2) return 'online'

    if (diffMin < 60) return `last seen ${diffMin}m ago`
    if (diffHr < 24) return `last seen ${diffHr}h ago`
    if (diffDay === 1) return `last seen yesterday`
    if (diffDay < 7) return `last seen ${diffDay}d ago`
    return `last seen ${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
  }

  if (loading) return <div className="text-[12px] text-fam-muted">...</div>

  const isOnline = lastSeen && (new Date().getTime() - new Date(lastSeen).getTime() < 120000)

  return (
    <div className={`text-[12px] flex items-center gap-1 ${isOnline ? 'text-green-400' : 'text-fam-muted'}`}>
      {isOnline && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
      {lastSeen ? formatLastSeen(lastSeen) : 'last seen recently'}
    </div>
  )
}


// ============ Story Music Sticker (Facebook-style) ============
function StoryMusicSticker({ title, artist, previewUrl, artworkUrl }: {
  title: string
  artist: string
  previewUrl: string
  artworkUrl: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    // Auto-play when story opens
    audio.play().then(() => setPlaying(true)).catch(() => {})
    return () => { audio.pause() }
  }, [])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
      <audio ref={audioRef} src={previewUrl} loop />
      <button
        onClick={toggle}
        className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full pl-1.5 pr-4 py-1.5 hover:bg-black/80 transition-colors"
      >
        {/* Album art with rotating animation when playing */}
        <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ${playing ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}>
          {artworkUrl ? (
            <img src={artworkUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-fam-purple flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </div>
          )}
        </div>
        {/* Song info */}
        <div className="text-left min-w-0">
          <div className="text-white text-xs font-semibold truncate max-w-[120px]">{title}</div>
          <div className="text-white/60 text-[10px] truncate max-w-[120px]">{artist}</div>
        </div>
        {/* Play/pause icon */}
        <div className="flex-shrink-0">
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          )}
        </div>
      </button>
    </div>
  )
}


// ============ SHARED UI COMPONENTS ============

function VibeFamLogo({ size = 'md', showText = true }: { size?: 'sm' | 'md' | 'lg' | 'xl'; showText?: boolean }) {
  const sizes = { sm: 100, md: 130, lg: 160, xl: 300 }
  const width = sizes[size]
  const height = Math.round(width * (887 / 1774)) // maintain aspect ratio (1774x887)
  // Use CSS to switch logo based on theme:
  // - White mode: show white-bg logo
  // - Classic/dark mode: show black-bg logo
  return (
    <div
      className="vibefam-logo-wrapper flex-shrink-0"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* White-bg logo — visible in white mode (default) */}
      <img
        src="/vibefam-logo-white.svg"
        alt="Boboh Vibe"
        width={width}
        height={height}
        className="vibefam-logo-white-img"
        style={{ objectFit: 'contain', display: 'block' }}
      />
      {/* Black-bg logo — visible in classic/dark mode + splash screen */}
      <img
        src="/vibefam-logo-black.svg"
        alt="Boboh Vibe"
        width={width}
        height={height}
        className="vibefam-logo-black-img"
        style={{ objectFit: 'contain', display: 'none', position: 'absolute' }}
      />
    </div>
  )
}

function VerifiedBadge({ type = 'blue', size = 18 }: { type?: string; size?: number }) {
  // EXACT Meta/Instagram official verified badge — scalloped 12-point seal
  const colors: Record<string, string> = {
    blue: '#1D9BF0', red: '#F4212E', green: '#00BA7C', black: '#0f0f0f',
  }
  const color = colors[type] || colors.blue
  const needsBorder = type === 'black'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className="inline-block flex-shrink-0" style={{ verticalAlign: 'middle' }}>
      <path d="M19.998 3.094L14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.36l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094zm-2.274 21.695l-5.36-5.36c-.343-.343-.343-.897 0-1.24s.896-.343 1.24 0l4.12 4.12 10.48-10.48c.343-.343.897-.343 1.24 0s.343.896 0 1.24l-11.08 11.08c-.171.171-.396.257-.62.257-.225 0-.449-.086-.62-.257z" fill={color} stroke={needsBorder ? '#ffffff' : 'none'} strokeWidth={needsBorder ? 0.8 : 0} />
    </svg>
  )
}

function Avatar({ src, name, size = 40, ring, onClick }: { src?: string; name: string; size?: number; ring?: 'active' | 'seen' | 'none'; onClick?: () => void }) {
  const inner = (
    <div className={`${ring === 'active' ? 'story-ring' : ring === 'seen' ? 'story-ring-seen' : ''} ${onClick ? 'cursor-pointer hover:opacity-90' : ''}`} style={{ width: size + 5, height: size + 5 }}>
      <div className="bg-fam-bg rounded-full p-0.5" style={{ width: size + 5, height: size + 5 }}>
        {src ? (<img src={src} alt={name} className="rounded-full object-cover w-full h-full" />) : (<div className="rounded-full fam-gradient w-full h-full flex items-center justify-center text-white font-bold" style={{ fontSize: size * 0.4 }}>{name.charAt(0).toUpperCase()}</div>)}
      </div>
    </div>
  )
  return onClick ? <button onClick={onClick}>{inner}</button> : inner
}

function Input({ label, value, onChange, placeholder, type = 'text', autoCapitalize, className = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoCapitalize?: 'none' | 'sentences'; className?: string }) {
  return (<div className={className}><label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoCapitalize={autoCapitalize} className="w-full bg-fam-surface border border-fam-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-fam-purple" /></div>)
}

function Spinner({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-8 h-8' : 'w-4 h-4'
  return <div className={`${dim} border-2 border-fam-purple border-t-transparent rounded-full animate-spin`} />
}

function Loading() { return (<div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>) }

function CenterMsg({ msg, sub, action, onAction }: { msg: string; sub?: string; action?: string; onAction?: () => void }) {
  return (<div className="flex flex-col items-center justify-center py-16 px-4 text-center"><p className="font-semibold text-fam-text">{msg}</p>{sub && <p className="text-sm text-fam-muted mt-1">{sub}</p>}{action && onAction && <button onClick={onAction} className="mt-4 px-4 py-2 rounded-lg fam-gradient text-white text-sm font-semibold">{action}</button>}</div>)
}


// ============ Navigation Components ============
function DesktopTopBar({ me, view, setView, onOpenProfile, onOpenDM, onOpenSwitchAccount, unreadDMs = 0, unreadNotifications = 0 }: {
  me: SessionUser
  view: string
  setView: (v: any) => void
  onOpenProfile: () => void
  onOpenDM: () => void
  onOpenSwitchAccount: () => void
  unreadDMs?: number
  unreadNotifications?: number
}) {
  if (view === 'post' || view === 'story' || view === 'dmChat' || view === 'groupChat' || view === 'liveView') return null
  return (
    <div className="hidden md:flex sticky top-0 z-30 bg-fam-bg/80 backdrop-blur-xl border-b border-fam-border items-center gap-2 px-4 py-3">
      <button onClick={() => setView('feed')}><VibeFamLogo size="sm" /></button>
      <div className="flex items-center gap-1 ml-auto">
        <NavBtn icon="home" active={view === 'feed'} onClick={() => setView('feed')} />
        <NavBtn icon="search" active={view === 'discover'} onClick={() => setView('discover')} />
        <NavBtn icon="plus" active={view === 'create'} onClick={() => setView('create')} />
        <NavBtn icon="group" active={view === 'groups' || view === 'groupChat'} onClick={() => setView('groups')} />
        <div className="relative">
          <NavBtn icon="dm" active={view === 'dm' || view === 'dmChat'} onClick={onOpenDM} />
          {unreadDMs > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 z-10">
              {unreadDMs > 9 ? '9+' : unreadDMs}
            </span>
          )}
        </div>
        <div className="relative">
          <NavBtn icon="heart" active={view === 'notifications'} onClick={() => setView('notifications')} />
          {unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 z-10">
              {unreadNotifications > 15 ? '15+' : unreadNotifications}
            </span>
          )}
        </div>
        {me.isAdmin && <NavBtn icon="shield" active={view === 'admin'} onClick={() => setView('admin')} />}
        <button onClick={onOpenProfile} className={`p-2 rounded-lg ${view === 'profile' ? 'bg-fam-surface' : 'hover:bg-fam-surface'}`}>
          {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs ${waAvatarClass(me.username)}`}>{waInitial(me.displayName || me.username)}</div>}
        </button>
      </div>
    </div>
  )
}

function MobileTopBar({ view, setView }: { view: string; setView: (v: any) => void }) {
  if (view === 'post' || view === 'story') return null
  return (
    <div className="md:hidden flex sticky top-0 z-30 bg-fam-bg/80 backdrop-blur-xl border-b border-fam-border items-center px-4 py-3">
      <button onClick={() => setView('feed')}><VibeFamLogo size="sm" /></button>
      <div className="flex items-center gap-1 ml-auto">
        <NavBtn icon="search" active={view === 'discover'} onClick={() => setView('discover')} />
        <NavBtn icon="heart" active={view === 'notifications'} onClick={() => setView('notifications')} />
      </div>
    </div>
  )
}

function MobileBottomNav({ me, view, setView, onOpenProfile, onOpenDM, onOpenSwitchAccount, unreadDMs = 0, unreadNotifications = 0 }: {
  me: SessionUser
  view: string
  setView: (v: any) => void
  onOpenProfile: () => void
  onOpenDM: () => void
  onOpenSwitchAccount: () => void
  unreadDMs?: number
  unreadNotifications?: number
}) {
  if (view === 'post' || view === 'story' || view === 'dmChat' || view === 'groupChat' || view === 'liveView') return null
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-fam-bg/95 backdrop-blur-xl border-t border-fam-border flex items-center justify-around px-1 py-1.5">
      <NavBtn icon="home" active={view === 'feed'} onClick={() => setView('feed')} size="lg" />
      <NavBtn icon="search" active={view === 'discover'} onClick={() => setView('discover')} size="lg" />
      <NavBtn icon="plus" active={view === 'create'} onClick={() => setView('create')} size="lg" />
      <div className="relative">
        <NavBtn icon="heart" active={view === 'notifications'} onClick={() => setView('notifications')} size="lg" />
        {unreadNotifications > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
            {unreadNotifications > 15 ? '15+' : unreadNotifications}
          </span>
        )}
      </div>
      <div className="relative">
        <NavBtn icon="dm" active={view === 'dm'} onClick={onOpenDM} size="lg" />
        {unreadDMs > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
            {unreadDMs > 15 ? '15+' : unreadDMs}
          </span>
        )}
      </div>
      <button onClick={onOpenProfile} className={`p-1.5 rounded-lg ${view === 'profile' ? 'bg-fam-surface' : ''}`}>
        {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs ${waAvatarClass(me.username)}`}>{waInitial(me.displayName || me.username)}</div>}
      </button>
    </div>
  )
}

function NavBtn({ icon, active, onClick, size = 'md' }: {
  icon: 'home' | 'search' | 'plus' | 'heart' | 'dm' | 'live' | 'group' | 'shield'
  active: boolean
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const dim = size === 'lg' ? 26 : 22
  const colors = active ? 'text-fam-purple' : 'text-fam-muted hover:text-fam-text'
  const icons: Record<string, React.JSX.Element> = {
    home: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    search: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    plus: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    heart: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
    dm: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
    live: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="8" cy="12" r="2" /><path d="M14 10v4M18 10v4" /></svg>,
    group: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>,
    shield: <svg width={dim} height={dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" /></svg>,
  }
  return <button onClick={onClick} className={`p-2 rounded-lg ${active ? 'bg-fam-surface' : 'hover:bg-fam-surface'} ${colors} transition-colors`}>{icons[icon]}</button>
}


// ============ DM Inbox View ============
function DMInboxView({ me, onOpenConversation, onViewUser, onNewChat, onBack }: {
  me: SessionUser
  onOpenConversation: (c: any) => void
  onViewUser: (u: string) => void
  onNewChat: (username: string) => void
  onBack: () => void
}) {
  const [conversations, setConversations] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newUsername, setNewUsername] = useState('')

  const load = useCallback(() => {
    api('/api/dm/conversations').then((d) => setConversations(d.conversations)).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-[#FFFFFF] min-h-screen">
      <div className="wa-panel flex items-center gap-2 px-3 py-3 border-b border-[#E5E5EA] sticky top-0 z-10">
        <button onClick={onBack} className="md:hidden p-1 text-fam-text"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold flex-1 text-black">Messages</h2>
        <button onClick={() => setShowNew(true)} className="p-2 rounded-full hover:bg-white/5 text-fam-text" title="New chat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg></button>
      </div>
      {showNew && (
        <div className="bg-[#F5F5F7] m-3 rounded-xl p-4 animate-fade-in border border-[#E5E5EA]">
          <h3 className="text-sm font-semibold mb-2 text-black">Start new chat</h3>
          <div className="flex gap-2">
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Enter username..." autoCapitalize="none" className="flex-1 bg-[#F5F5F7] border border-[#D1D1D6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fam-purple" onKeyDown={(e) => { if (e.key === 'Enter' && newUsername.trim()) { onNewChat(newUsername.trim().toLowerCase()); setShowNew(false); setNewUsername('') } }} />
            <button onClick={() => { if (newUsername.trim()) { onNewChat(newUsername.trim().toLowerCase()); setShowNew(false); setNewUsername('') } }} className="px-4 py-2 rounded-lg wa-bubble-out text-white text-sm font-semibold">Start</button>
            <button onClick={() => { setShowNew(false); setNewUsername('') }} className="px-3 py-2 rounded-lg bg-[#F5F5F7] text-sm text-fam-text">Cancel</button>
          </div>
        </div>
      )}
      <div className="px-2 py-2">
        {error && <CenterMsg msg={error} action="Retry" onAction={load} />}
        {!conversations && !error && <Loading />}
        {conversations && conversations.length === 0 && <CenterMsg msg="No messages yet" sub="Tap the pencil icon to start a new chat" />}
        {conversations && conversations.length > 0 && (
          <div className="space-y-0">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => onOpenConversation(c)} className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] rounded-lg text-left">
                {c.otherUser.avatarUrl ? <img src={c.otherUser.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" /> : <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${waAvatarClass(c.otherUser.username)}`}>{waInitial(c.otherUser.displayName || c.otherUser.username)}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] text-black truncate">{c.otherUser.displayName || c.otherUser.username}</span>
                    {c.otherUser.verified && <VerifiedBadge type={c.otherUser.verifiedType} />}
                    {c.lastMessage && <span className="text-[11px] text-fam-muted flex-shrink-0">{waTime(c.lastMessage.sentAt)}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className={`text-[13px] truncate flex-1 ${c.unreadCount > 0 ? 'text-fam-text font-medium' : 'text-fam-muted'}`}>{c.lastMessage ? (c.lastMessage.isMine ? 'You: ' : '') + c.lastMessage.text : 'Say hi 👋'}</div>
                    {c.unreadCount > 0 && <span className="wa-unread flex-shrink-0">{c.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ DM Chat View ============
function DMChatView({ me, conversationId, otherUser, onBack, onViewUser, onGift, onCall }: {
  me: SessionUser
  conversationId: string
  otherUser: Author
  onBack: () => void
  onViewUser: (u: string) => void
  onGift: (user: Author) => void
  onCall: (user: Author, type: 'voice' | 'video') => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; sender: { displayName: string; username: string } } | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null) // message id whose long-press menu is open
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [viewOnceRevealed, setViewOnceRevealed] = useState<Set<string>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const load = useCallback(async () => {
    try { const d = await api(`/api/dm/${conversationId}/messages`); setMessages(d.messages) } catch {} finally { setLoading(false) }
  }, [conversationId])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Clean up media recorder on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  const send = async () => {
    if (!text.trim() || sending) return
    const msgText = text.trim(); setText(''); setSending(true); setEmojiOpen(false)
    const tempMsg: Message = { id: 'temp-' + Date.now(), text: msgText, senderId: me.id, read: false, createdAt: new Date().toISOString(), replyTo: replyTo || undefined }
    setMessages((m) => [...m, tempMsg])
    const replyId = replyTo?.id
    setReplyTo(null)
    try {
      await api(`/api/dm/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ text: msgText, replyToId: replyId }) })
    } catch { setMessages((m) => m.filter((msg) => msg.id !== tempMsg.id)); setText(msgText) } finally { setSending(false) }
  }

  const sendImage = async (file: File, viewOnce: boolean = false) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      // Send the image message
      const tempMsg: Message = { id: 'temp-' + Date.now(), text: '', senderId: me.id, read: false, createdAt: new Date().toISOString(), imageUrl: d.url, viewOnce, viewed: false }
      setMessages((m) => [...m, tempMsg])
      await api(`/api/dm/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ imageUrl: d.url, viewOnce }) })
    } catch (e: unknown) {
      // ignore — temp message stays, will be removed on next poll
    } finally { setUploading(false) }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        // Upload the voice note
        setUploading(true)
        try {
          const fd = new FormData(); fd.append('file', file)
          const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })
          const d = await r.json()
          if (!r.ok) throw new Error(d.error || 'Upload failed')
          const tempMsg: Message = { id: 'temp-' + Date.now(), text: '', senderId: me.id, read: false, createdAt: new Date().toISOString(), audioUrl: d.url }
          setMessages((m) => [...m, tempMsg])
          await api(`/api/dm/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ audioUrl: d.url }) })
        } catch {} finally { setUploading(false) }
        // Stop all tracks
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setRecordSecs(0)
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000)
    } catch (e: unknown) {
      // Mic permission denied or not available
    }
  }

  const stopRecording = (cancel: boolean = false) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (cancel) {
        // Cancel: stop without sending (clear chunks first)
        audioChunksRef.current = []
        mediaRecorderRef.current.onstop = () => {
          streamRef.current?.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }
      }
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
    setRecordSecs(0)
  }

  const handleLongPress = (msgId: string) => {
    setMenuFor(msgId)
  }

  const handleUnsend = async (msgId: string) => {
    setMenuFor(null)
    // Optimistically remove from local state
    setMessages((m) => m.filter((msg) => msg.id !== msgId))
    try {
      await api(`/api/dm/${conversationId}/messages/${msgId}`, { method: 'DELETE' })
    } catch {
      // Re-add on failure (will reappear on next poll)
      load()
    }
  }

  const handleDeleteForMe = (msgId: string) => {
    setMenuFor(null)
    // Just remove locally — stays in DB for the other person
    setMessages((m) => m.filter((msg) => msg.id !== msgId))
  }

  const handleViewOnce = async (msgId: string) => {
    setViewOnceRevealed((s) => new Set(s).add(msgId))
    // Mark as viewed in DB (recipient only)
    try {
      await api(`/api/dm/${conversationId}/messages/${msgId}`, { method: 'PATCH', body: JSON.stringify({ action: 'view' }) })
    } catch {}
  }

  const commonEmojis = ['😀', '😂', '😍', '🥰', '😎', '🤔', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '❤️', '💔', '🎉', '🎁', '✨', '⭐', '💯', '🤝', '👋', '🤗', '😅', '🥺', '😴', '🤤', ' Music ', '🎵', '🎶', '📸', '📷', '🔴', '💬', '✅', '❌', '⚡', '🌈']

  return (
    <div className="fixed inset-0 md:relative md:inset-auto z-40 md:z-auto flex flex-col bg-[#FFFFFF] md:rounded-2xl md:border md:border-fam-border md:max-h-[85vh]">
      <div className="wa-panel flex items-center gap-2 px-2 py-2 border-b">
        <button onClick={onBack} className="p-1.5 text-fam-text"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <button onClick={() => onViewUser(otherUser.username)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80">
          {otherUser.avatarUrl ? <img src={otherUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${waAvatarClass(otherUser.username)}`}>{waInitial(otherUser.displayName || otherUser.username)}</div>}
          <div className="min-w-0"><div className="flex items-center gap-1"><span className="font-semibold text-[15px] text-black truncate">{otherUser.displayName || otherUser.username}</span>{otherUser.verified && <VerifiedBadge type={otherUser.verifiedType} />}</div><LastSeenStatus username={otherUser.username} /></div>
        </button>
        <button onClick={() => onCall(otherUser, 'voice')} className="p-2 rounded-full hover:bg-white/5 text-fam-text" title="Voice call"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg></button>
        <button onClick={() => onCall(otherUser, 'video')} className="p-2 rounded-full hover:bg-white/5 text-fam-text" title="Video call"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></button>
        <button onClick={() => onGift(otherUser)} className="p-2 rounded-full hover:bg-white/5" title="Send gift"><span className="text-lg">🎁</span></button>
      </div>

      <div className="wa-chat-bg flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {loading ? <div className="flex justify-center py-8"><Spinner size="lg" /></div> : messages.length === 0 ? <div className="flex justify-center py-8"><div className="bg-[#F5F5F7] text-fam-muted text-xs px-4 py-2 rounded-lg text-center max-w-[280px]">🔒 Messages are end-to-end encrypted. Say hi to {otherUser.username}!</div></div> : messages.map((m, idx) => {
          const isMe = m.senderId === me.id
          const prev = idx > 0 ? messages[idx - 1] : null
          const showSender = !prev || prev.senderId !== m.senderId
          const isViewOnce = m.viewOnce && m.imageUrl
          const isViewed = isViewOnce && (m.viewed || (!isMe && viewOnceRevealed.has(m.id)))
          const showViewOnceImage = isViewOnce && !isViewed && (isMe || viewOnceRevealed.has(m.id))
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`message-bubble max-w-[78%] px-2.5 py-1.5 text-[14px] ${isMe ? 'wa-bubble-out' : 'wa-bubble-in'}`}
                onContextMenu={(e) => { e.preventDefault(); handleLongPress(m.id) }}
                onTouchStart={(e) => {
                  const touch = e.touches[0]
                  const timer = setTimeout(() => handleLongPress(m.id), 500)
                  const cancel = () => clearTimeout(timer)
                  e.currentTarget.ontouchend = cancel
                  e.currentTarget.ontouchmove = cancel
                  e.currentTarget.ontouchcancel = cancel
                }}
              >
                {m.replyTo && (
                  <ReplyPreviewInBubble replyTo={m.replyTo} isMe={isMe} onViewUser={onViewUser} />
                )}
                {showSender && (
                  <div className={`text-[12px] font-bold mb-0.5 flex items-center gap-1 ${isMe ? 'text-white/95' : 'text-fam-purple'}`}>
                    <span>{isMe ? 'You' : otherUser.displayName || otherUser.username}</span>
                    {!isMe && otherUser.verified && <VerifiedBadge type={otherUser.verifiedType} size={12} />}
                  </div>
                )}
                {/* Image message */}
                {m.imageUrl && !isViewOnce && (
                  <button onClick={() => window.open(m.imageUrl, '_blank')} className="block mb-1">
                    <img src={m.imageUrl} alt="photo" className="rounded-lg max-w-[240px] max-h-[320px] object-cover" />
                  </button>
                )}
                {/* View-once photo */}
                {isViewOnce && (
                  isViewed ? (
                    <div className="flex items-center gap-2 py-1 opacity-70">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                      <span className="text-xs">Photo viewed</span>
                    </div>
                  ) : showViewOnceImage ? (
                    <button onClick={() => !isMe && handleViewOnce(m.id)} className="block mb-1 relative">
                      <img src={m.imageUrl} alt="view once" className="rounded-lg max-w-[240px] max-h-[320px] object-cover" />
                      <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /></svg>
                        1×
                      </span>
                    </button>
                  ) : (
                    <button onClick={() => !isMe && handleViewOnce(m.id)} className="flex items-center gap-3 py-3 px-2">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /></svg>
                      </div>
                      <span className="text-xs">View-once photo — tap to view</span>
                    </button>
                  )
                )}
                {/* Voice note */}
                {m.audioUrl ? (
                  <VoiceNotePlayer audioUrl={m.audioUrl} isMe={isMe} />
                ) : m.text ? (
                  <ChatMessageContent text={m.text} onViewUser={onViewUser} />
                ) : null}
                <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-white/70' : 'text-fam-muted'}`}>
                  <span className="text-[10px]">{waTime(m.createdAt)}</span>
                  {isMe && (
                    // WhatsApp-style ticks:
                    // 2 gray ticks = delivered
                    // 2 blue ticks = read (WhatsApp blue #4FC3F7)
                    m.read ? (
                      // Read — 2 blue ticks (WhatsApp style)
                      <svg width="18" height="12" viewBox="0 0 22 13" fill="none">
                        <path d="M1.5 6.5L5 10L11 3" stroke="#4FC3F7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7.5 6.5L11 10L17 3" stroke="#4FC3F7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M13.5 6.5L17 10L21 3" stroke="#4FC3F7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="translate(-6, 0)" />
                      </svg>
                    ) : (
                      // Delivered — 2 gray ticks
                      <svg width="18" height="12" viewBox="0 0 22 13" fill="none">
                        <path d="M1.5 6.5L5 10L11 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                        <path d="M7.5 6.5L11 10L17 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" transform="translate(-2, 0)" />
                      </svg>
                    )
                  )}
                </div>
              </div>

              {/* Long-press menu */}
              {menuFor === m.id && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setMenuFor(null)} />
                  <div className="absolute z-50 mt-8 bg-[#FFFFFF] border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[160px]" style={{ right: isMe ? '4px' : 'auto', left: isMe ? 'auto' : '4px' }}>
                    <button onClick={() => { setReplyTo({ id: m.id, text: m.text || (m.imageUrl ? '📷 Photo' : m.audioUrl ? '🎤 Voice note' : ''), sender: { displayName: isMe ? 'You' : (otherUser.displayName || otherUser.username), username: otherUser.username } }); setMenuFor(null) }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#F5F5F7] text-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                      Reply
                    </button>
                    {m.text && (
                      <button onClick={() => { navigator.clipboard?.writeText(m.text); setMenuFor(null) }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#F5F5F7] text-left">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        Copy
                      </button>
                    )}
                    <button onClick={() => handleDeleteForMe(m.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#F5F5F7] text-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                      Delete for me
                    </button>
                    {isMe && (
                      <button onClick={() => handleUnsend(m.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 text-left">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Unsend
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Reply composer — ABOVE the input bar (WhatsApp style) */}
      {replyTo && (
        <div className="wa-panel px-3 py-2 border-t flex items-center gap-2 bg-[#FFFFFF]">
          <div className="w-1 self-stretch rounded-full bg-fam-purple flex-shrink-0" />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" className="flex-shrink-0"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-fam-purple">Replying to {replyTo.sender.displayName || replyTo.sender.username}</div>
            <div className="text-xs text-fam-muted truncate">{replyTo.text || (replyTo.text === '' ? '📷 Photo' : '🎤 Voice note')}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="p-1 text-fam-muted hover:text-fam-text flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
      )}

      {/* Emoji picker */}
      {emojiOpen && (
        <div className="wa-panel border-t p-2 max-h-[200px] overflow-y-auto">
          <div className="grid grid-cols-8 gap-1">
            {commonEmojis.map((e, i) => (
              <button key={i} onClick={() => { setText((t) => t + e) }} className="text-2xl p-1.5 hover:bg-white/10 rounded-lg">{e}</button>
            ))}
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="wa-panel border-t px-3 py-2 flex items-center gap-2 text-xs text-fam-muted">
          <div className="w-4 h-4 border-2 border-fam-purple border-t-transparent rounded-full animate-spin" />
          Uploading...
        </div>
      )}

      {/* Recording bar */}
      {recording ? (
        <div className="wa-panel px-3 py-3 border-t flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm text-black font-semibold">Recording... {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}</span>
          <div className="flex-1" />
          <button onClick={() => stopRecording(true)} className="px-4 py-1.5 rounded-full bg-white/10 text-white text-sm font-semibold">Cancel</button>
          <button onClick={() => stopRecording(false)} className="w-10 h-10 rounded-full bg-fam-purple flex items-center justify-center" title="Send voice note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </button>
        </div>
      ) : (
        <div className="wa-panel px-2 py-2 border-t flex items-end gap-1.5">
          <button onClick={() => setEmojiOpen(!emojiOpen)} className="p-2 text-fam-muted hover:text-fam-text" title="Emoji">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
          </button>
          <div className="flex-1 wa-input px-4 py-2 flex items-center min-h-[40px]">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Message" className="flex-1 bg-transparent border-none outline-none text-[14px] text-fam-text placeholder:text-fam-muted" />
            <button onClick={() => fileInputRef.current?.click()} className="ml-2 text-fam-muted hover:text-fam-text" title="Attach file">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <button onClick={() => cameraInputRef.current?.click()} className="ml-1 text-fam-muted hover:text-fam-text" title="Camera">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
          </div>
          {text.trim() ? (
            <button onClick={send} disabled={sending} className="w-11 h-11 rounded-full wa-bubble-out flex items-center justify-center disabled:opacity-50 flex-shrink-0" title="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          ) : (
            <button onClick={startRecording} className="w-11 h-11 rounded-full wa-bubble-out flex items-center justify-center flex-shrink-0" title="Voice note">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f, false); e.target.value = '' }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f, false); e.target.value = '' }} />
    </div>
  )
}

// ============ Wallet View (premium redesign) ============
function WalletView({ me, onBack, showToast }: { me: SessionUser; onBack: () => void; showToast: (m: string) => void }) {
  const [wallet, setWallet] = useState<{
    balanceKES: string
    liveBalanceKES: string
    transactions?: { id: string; type: string; amount: number; amountKES: string; reference: string; status: string; createdAt: string }[]
    stats?: { giftsReceived: number; giftsSent: number; followerCount: number; canWithdrawLive: boolean }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTopup, setShowTopup] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [paymentPolling, setPaymentPolling] = useState<{ reference: string; amount: number; phone: string } | null>(null)

  const load = useCallback(() => {
    api('/api/wallet').then((d) => setWallet(d.wallet)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleTopup = async (amountKES: number, phone: string) => {
    setProcessing(true)
    try {
      const d = await api('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amountKES, phone }) })
      showToast(d.message || 'STK Push sent! Check your phone.')
      setShowTopup(false)
      // Start live payment polling — NO TIMEOUT
      // The modal will poll every 2s until status is 'completed' or 'failed'
      setPaymentPolling({ reference: d.reference, amount: amountKES, phone })
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Top-up failed')
    } finally { setProcessing(false) }
  }

  const handleWithdraw = async (amountKES: number, phone: string, walletType: 'main' | 'live') => {
    setProcessing(true)
    try {
      const d = await api('/api/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amountKES, phone, walletType }) })
      showToast(d.message || 'Withdrawal sent!')
      setShowWithdraw(false)
      setTimeout(load, 3000)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Withdrawal failed')
    } finally { setProcessing(false) }
  }

  if (loading) return <Loading />
  if (!wallet) return <CenterMsg msg="Failed to load wallet" action="Retry" onAction={load} />

  return (
    <div className="min-h-screen bg-[#FFFFFF] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#FFFFFF]/80 backdrop-blur-xl border-b border-fam-border px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-fam-surface rounded-lg"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold">Wallet</h2>
        <button onClick={load} className="ml-auto p-2 hover:bg-fam-surface rounded-lg" title="Refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        </button>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {/* Main balance card — premium gradient */}
        <div className="relative rounded-3xl p-6 mb-4 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a1020 0%, #2d1b4e 50%, #1a1020 100%)', border: '1px solid rgba(124,58,237,0.3)' }}>
          {/* Decorative orbs */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)' }} />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                </div>
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Main Balance</span>
              </div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">KES</span>
            </div>
            <div className="text-4xl font-bold text-white mb-1" style={{ fontFamily: 'Sora, sans-serif', letterSpacing: '-0.02em' }}>
              {wallet.balanceKES}
            </div>
            <div className="text-xs text-white/40">Available for top-ups, gifts & withdrawals</div>
          </div>
        </div>

        {/* Live earnings card — separate */}
        <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="3" /><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" fill="none" stroke="white" strokeWidth="2" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Live Earnings</div>
            <div className="text-xl font-bold text-white">KES {wallet.liveBalanceKES}</div>
          </div>
          {wallet.stats && !wallet.stats.canWithdrawLive && (
            <div className="text-[10px] text-white/40 text-right max-w-[100px]">
              Need 500 followers to withdraw
            </div>
          )}
        </div>

        {/* Action buttons — large, prominent */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => setShowTopup(true)}
            className="py-4 rounded-2xl text-white font-bold flex flex-col items-center gap-1 transition-transform active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 8px 24px rgba(124,58,237,0.3)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="text-sm">Top Up</span>
          </button>
          <button
            onClick={() => setShowWithdraw(true)}
            className="py-4 rounded-2xl bg-fam-surface border border-fam-border text-white font-bold flex flex-col items-center gap-1 transition-transform active:scale-95 hover:bg-[#E5E5EA]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            <span className="text-sm">Withdraw</span>
          </button>
        </div>

        {/* Stats row */}
        {wallet.stats && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-fam-surface rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-black">{wallet.stats.giftsReceived}</div>
              <div className="text-[10px] text-fam-muted uppercase tracking-wider">Gifts In</div>
            </div>
            <div className="bg-fam-surface rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-black">{wallet.stats.giftsSent}</div>
              <div className="text-[10px] text-fam-muted uppercase tracking-wider">Gifts Out</div>
            </div>
            <div className="bg-fam-surface rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-black">{wallet.stats.followerCount}</div>
              <div className="text-[10px] text-fam-muted uppercase tracking-wider">Followers</div>
            </div>
          </div>
        )}

        {/* Transactions */}
        <h3 className="text-xs font-bold text-fam-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          Transaction History
        </h3>
        {wallet.transactions && wallet.transactions.length > 0 ? (
          <div className="space-y-2">
            {wallet.transactions.map((t) => {
              const isCredit = t.amount >= 0
              const typeLabel = t.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const statusColor = t.status === 'completed' ? 'text-green-400' : t.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
              return (
                <div key={t.id} className="bg-fam-surface rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                    {isCredit ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-black">{typeLabel}</div>
                    <div className="text-[11px] text-fam-muted truncate">{t.reference || '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                      {isCredit ? '+' : '-'}KES {t.amountKES}
                    </div>
                    <div className={`text-[10px] font-semibold uppercase ${statusColor}`}>{t.status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-fam-surface rounded-xl p-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-fam-muted"><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
            <p className="text-sm font-semibold text-fam-text">No transactions yet</p>
            <p className="text-xs text-fam-muted mt-1">Top up your wallet to get started</p>
          </div>
        )}
      </div>

      {/* Top Up Modal */}
      {showTopup && (
        <WalletTopupModal
          onClose={() => setShowTopup(false)}
          onSubmit={handleTopup}
          processing={processing}
        />
      )}

      {/* Withdraw Modal */}
      {showWithdraw && (
        <WalletWithdrawModal
          onClose={() => setShowWithdraw(false)}
          onSubmit={handleWithdraw}
          processing={processing}
          mainBalance={wallet.balanceKES}
          liveBalance={wallet.liveBalanceKES}
          canWithdrawLive={wallet.stats?.canWithdrawLive || false}
          followerCount={wallet.stats?.followerCount || 0}
        />
      )}

      {/* Live Payment Status Modal — polls every 2s, NO TIMEOUT */}
      {paymentPolling && (
        <PaymentStatusModal
          reference={paymentPolling.reference}
          amount={paymentPolling.amount}
          onClose={() => { setPaymentPolling(null); load() }}
        />
      )}
    </div>
  )
}

// ============ Live Payment Status Modal (polls every 2s, NO TIMEOUT) ============
function PaymentStatusModal({ reference, amount, onClose }: { reference: string; amount: number; onClose: () => void }) {
  const [status, setStatus] = useState<'pending' | 'completed' | 'failed'>('pending')
  const [reason, setReason] = useState<string>('')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let active = true
    let interval: ReturnType<typeof setInterval>
    let elapsedInterval: ReturnType<typeof setInterval>

    const poll = async () => {
      try {
        const res = await fetch(`/api/wallet/status/${encodeURIComponent(reference)}`)
        const data = await res.json()
        if (!active) return
        if (data.status === 'completed') {
          setStatus('completed')
          clearInterval(interval!)
          clearInterval(elapsedInterval!)
        } else if (data.status === 'failed') {
          setStatus('failed')
          setReason(data.reason || 'Payment was cancelled or failed')
          clearInterval(interval!)
          clearInterval(elapsedInterval!)
        }
        // If still 'pending', keep polling — NO TIMEOUT
      } catch (e) {
        // Network error — keep polling
      }
    }

    // Poll every 2 seconds
    interval = setInterval(poll, 2000)
    // Poll immediately
    poll()

    // Track elapsed time (just for display, not for timeout)
    elapsedInterval = setInterval(() => setElapsed(e => e + 1), 1000)

    return () => {
      active = false
      clearInterval(interval)
      clearInterval(elapsedInterval)
    }
  }, [reference])

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white border border-fam-border rounded-3xl w-full max-w-md p-6 animate-slide-up">
        {status === 'pending' && (
          <>
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{ background: 'rgba(124,58,237,0.1)' }}>
                <div className="w-12 h-12 border-4 border-fam-purple border-t-transparent rounded-full animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-black mb-1">Waiting for payment</h3>
              <p className="text-sm text-fam-muted">Enter your M-Pesa PIN on your phone</p>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ background: '#F5F5F7', border: '1px solid #E5E5EA' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Amount</span>
                <span className="text-lg font-bold text-black">KES {amount}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Reference</span>
                <span className="text-xs font-mono text-black">{reference.slice(0, 16)}...</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Elapsed</span>
                <span className="text-xs font-bold text-fam-purple">{formatTime(elapsed)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-fam-muted mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              <span>Live confirmation — this will update automatically when payment completes</span>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-fam-muted hover:text-black transition-colors"
              style={{ background: '#F5F5F7', border: '1px solid #E5E5EA' }}
            >
              Cancel
            </button>
          </>
        )}

        {status === 'completed' && (
          <>
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-1">Payment Successful!</h3>
              <p className="text-sm text-fam-muted">KES {amount} has been added to your wallet</p>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Amount</span>
                <span className="text-lg font-bold text-green-600">+KES {amount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Reference</span>
                <span className="text-xs font-mono text-black">{reference.slice(0, 16)}...</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-xl text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
            >
              Done
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </div>
              <h3 className="text-xl font-bold text-black mb-1">Payment Failed</h3>
              <p className="text-sm text-fam-muted">{reason || 'The payment was cancelled or insufficient funds'}</p>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Amount</span>
                <span className="text-lg font-bold text-red-600">KES {amount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fam-muted uppercase tracking-wider">Reference</span>
                <span className="text-xs font-mono text-black">{reference.slice(0, 16)}...</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-xl text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ============ Wallet Top Up Modal ============
function WalletTopupModal({ onClose, onSubmit, processing }: { onClose: () => void; onSubmit: (amountKES: number, phone: string) => void; processing: boolean }) {
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const quickAmounts = [30, 50, 100, 200, 500, 1000]

  const handleSubmit = () => {
    const amt = Number(amount)
    if (!amt || amt < 30) return
    if (!phone.trim()) return
    onSubmit(amt, phone.trim())
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#FFFFFF] border border-fam-border rounded-3xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-black">Top Up Wallet</h3>
          <button onClick={onClose} className="text-fam-muted hover:text-fam-text p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>

        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-2" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          </div>
          <p className="text-xs text-fam-muted">M-Pesa STK Push will be sent to your phone</p>
        </div>

        {/* Quick amounts */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(String(amt))}
              className={`py-2.5 rounded-xl text-sm font-bold transition-all ${amount === String(amt) ? 'bg-fam-purple text-white' : 'bg-fam-surface text-fam-text hover:bg-[#E5E5EA]'}`}
            >
              KES {amt}
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="mb-3">
          <label className="block text-xs font-bold text-fam-muted uppercase tracking-wider mb-1.5">Amount (KES)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="30"
            max="70000"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-4 py-3 text-lg font-bold text-black outline-none focus:border-fam-purple"
          />
        </div>

        {/* Phone */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-fam-muted uppercase tracking-wider mb-1.5">M-Pesa Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX or 2547XXXXXXXX"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-fam-purple"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={processing || !amount || !phone.trim()}
          className="w-full py-3.5 rounded-xl text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}
        >
          {processing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Sending STK Push...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              Top Up KES {amount || '0'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============ Wallet Withdraw Modal ============
function WalletWithdrawModal({ onClose, onSubmit, processing, mainBalance, liveBalance, canWithdrawLive, followerCount }: {
  onClose: () => void
  onSubmit: (amountKES: number, phone: string, walletType: 'main' | 'live') => void
  processing: boolean
  mainBalance: string
  liveBalance: string
  canWithdrawLive: boolean
  followerCount: number
}) {
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [walletType, setWalletType] = useState<'main' | 'live'>('main')

  const handleSubmit = () => {
    const amt = Number(amount)
    if (!amt || amt < 10) return
    if (!phone.trim()) return
    onSubmit(amt, phone.trim(), walletType)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#FFFFFF] border border-fam-border rounded-3xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-black">Withdraw to M-Pesa</h3>
          <button onClick={onClose} className="text-fam-muted hover:text-fam-text p-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>

        {/* Wallet type selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setWalletType('main')}
            className={`p-3 rounded-xl text-left transition-all ${walletType === 'main' ? 'bg-fam-purple/15 border-2 border-fam-purple' : 'bg-fam-surface border-2 border-transparent'}`}
          >
            <div className="text-xs font-bold text-fam-muted uppercase">Main</div>
            <div className="text-lg font-bold text-white">KES {mainBalance}</div>
          </button>
          <button
            onClick={() => setWalletType('live')}
            disabled={!canWithdrawLive}
            className={`p-3 rounded-xl text-left transition-all relative ${walletType === 'live' ? 'bg-red-500/15 border-2 border-red-500' : 'bg-fam-surface border-2 border-transparent'} ${!canWithdrawLive ? 'opacity-50' : ''}`}
          >
            <div className="text-xs font-bold text-red-400 uppercase">Live</div>
            <div className="text-lg font-bold text-white">KES {liveBalance}</div>
            {!canWithdrawLive && (
              <div className="text-[9px] text-fam-muted mt-0.5">Need 500 followers ({followerCount}/500)</div>
            )}
          </button>
        </div>

        {/* Amount */}
        <div className="mb-3">
          <label className="block text-xs font-bold text-fam-muted uppercase tracking-wider mb-1.5">Amount (KES) — min 10</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="10"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-4 py-3 text-lg font-bold text-black outline-none focus:border-fam-purple"
          />
        </div>

        {/* Phone */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-fam-muted uppercase tracking-wider mb-1.5">Send To (M-Pesa Phone)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX or 2547XXXXXXXX"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-fam-purple"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={processing || !amount || !phone.trim() || (walletType === 'live' && !canWithdrawLive)}
          className="w-full py-3.5 rounded-xl bg-fam-surface border border-fam-border text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-[#E5E5EA]"
        >
          {processing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              Withdraw KES {amount || '0'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============ Saved View ============
// ============ NOTIFICATIONS VIEW ============
function NotificationsView({ onViewUser }: { onViewUser: (u: string) => void }) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api('/api/notifications').then((d) => {
      setNotifications(d.notifications || [])
    }).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    }).finally(() => setLoading(false))
  }, [])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  const getNotificationText = (n: any) => {
    switch (n.type) {
      case 'like': return 'liked your post'
      case 'comment': return 'commented on your post'
      case 'follow': return 'started following you'
      case 'gift': return 'sent you a gift'
      case 'mention': return 'mentioned you'
      default: return 'interacted with you'
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" /></svg>
      case 'comment': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      case 'follow': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
      case 'gift': return <span className="text-base">🎁</span>
      case 'mention': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>
      default: return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    }
  }

  if (loading) return <Loading />
  if (error) return <CenterMsg msg={error} action="Retry" onAction={() => location.reload()} />

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h2 className="text-xl font-bold text-black mb-4">Notifications</h2>
      {notifications.length === 0 ? (
        <CenterMsg msg="No notifications yet" sub="When someone likes or comments on your posts, you'll see it here" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => n.fromUser?.username && onViewUser(n.fromUser.username)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-fam-surface transition-colors text-left"
              style={{ background: '#FFFFFF', border: '1px solid #E5E5EA' }}
            >
              {/* Avatar */}
              {n.fromUser?.avatarUrl ? (
                <img src={n.fromUser.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${waAvatarClass(n.fromUser?.username || 'user')}`}>
                  {waInitial(n.fromUser?.displayName || n.fromUser?.username || 'U')}
                </div>
              )}
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-black truncate">{n.fromUser?.displayName || n.fromUser?.username}</span>
                  {n.fromUser?.verified && <VerifiedBadge type={n.fromUser?.verifiedType} size={13} />}
                </div>
                <p className="text-sm text-fam-muted">{getNotificationText(n)}</p>
                <p className="text-[11px] text-fam-muted/70 mt-0.5">{formatTime(n.createdAt)}</p>
              </div>
              {/* Icon */}
              <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full" style={{ background: '#F5F5F7' }}>
                {getNotificationIcon(n.type)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SavedView({ me, onViewPost, onBack }: { me: SessionUser; onViewPost: (p: any) => void; onBack: () => void }) {
  const [posts, setPosts] = useState<any[] | null>(null)
  useEffect(() => { api('/api/bookmarks').then((d) => setPosts(d.posts)).catch(() => {}) }, [])
  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold">Saved</h2>
      </div>
      {posts && posts.length === 0 && <CenterMsg msg="No saved posts" />}
      {posts && posts.length > 0 && <div className="grid grid-cols-3 gap-1">{posts.map((p) => <button key={p.id} onClick={() => onViewPost(p)} className="aspect-square overflow-hidden rounded-sm"><img src={p.imageUrl} alt="" className="w-full h-full object-cover" /></button>)}</div>}
      {!posts && <Loading />}
    </div>
  )
}

// ============ MAIN APP ============
export default function FamApp() {
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined)
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null)
  const [view, setView] = useState<'feed' | 'discover' | 'create' | 'notifications' | 'profile' | 'post' | 'story' | 'dm' | 'dmChat' | 'wallet' | 'saved' | 'createStory' | 'groups' | 'groupChat' | 'groupInfo' | 'createGroup' | 'joinGroup' | 'live' | 'liveView' | 'admin' | 'profileSetup'>('feed')
  const [viewedPost, setViewedPost] = useState<Post | null>(null)
  const [viewedStory, setViewedStory] = useState<StoryGroup | null>(null)
  const [viewedUser, setViewedUser] = useState<string>('')
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  const [activeConversationUser, setActiveConversationUser] = useState<Author | null>(null)
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string; inviteCode: string } | null>(null)
  const [activeLiveId, setActiveLiveId] = useState<string>('')
  const [callTarget, setCallTarget] = useState<Author | null>(null)
  const [callType, setCallType] = useState<'voice' | 'video'>('voice')
  const [answeredCallId, setAnsweredCallId] = useState<string | null>(null)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [giftTarget, setGiftTarget] = useState<Author | null>(null)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [theme, setTheme] = useState<'white' | 'classic'>('white')
  const [isApp, setIsApp] = useState(false)
  const [unreadDMs, setUnreadDMs] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // Load session on mount
  useEffect(() => {
    api('/api/auth/me').then((d: { user: SessionUser | null; banInfo?: BanInfo }) => { setMe(d.user); setBanInfo(d.banInfo || null) }).catch(() => setMe(null))
  }, [])

  // Poll for unread DMs + notifications every 15 seconds
  useEffect(() => {
    if (!me) return
    const loadUnread = () => {
      api('/api/dm/conversations').then((d: { conversations?: { unreadCount?: number }[] }) => {
        const total = (d.conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0)
        setUnreadDMs(total)
      }).catch(() => {})
      api('/api/notifications').then((d: { notifications?: { read?: boolean }[] }) => {
        const unread = (d.notifications || []).filter(n => !n.read).length
        setUnreadNotifications(unread)
      }).catch(() => {})
    }
    loadUnread()
    const t = setInterval(loadUnread, 15000)
    return () => clearInterval(t)
  }, [me?.id])

  // Detect if running in APK (WebView)
  useEffect(() => {
    const ua = navigator.userAgent
    const inApp = ua.includes('VibeFamApp') || (window as unknown as { AndroidApp?: unknown }).AndroidApp !== undefined
    setIsApp(inApp)
  }, [])

  // Load saved theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vibefam-theme') as 'white' | 'classic' | null
    if (saved) setTheme(saved)
  }, [])

  // Apply theme class to body
  useEffect(() => {
    document.body.classList.remove('classic-theme', 'white-theme')
    document.body.classList.add(theme === 'classic' ? 'classic-theme' : 'white-theme')
  }, [theme])

  // URL routing: checks pathname + hash for all routes
  useEffect(() => {
    const handleRoute = () => {
      const path = window.location.pathname
      const hash = window.location.hash

      // /@username/profile-setup
      const setupMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)\/profile-setup$/)
      if (setupMatch) { setViewedUser(setupMatch[1]); setView('profileSetup'); return }

      // /@username
      const atMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)$/)
      if (atMatch) { setViewedUser(atMatch[1]); setView('profile'); return }

      // Path-based routes (middleware rewrites serve / but URL stays as /messages etc.)
      const pathRoutes: Record<string, string> = {
        '/home': 'feed', '/home/feeds': 'feed', '/feeds': 'feed',
        '/messages': 'dm', '/dm': 'dm',
        '/profile': 'myprofile',
        '/discover': 'discover', '/explore': 'discover',
        '/notifications': 'notifications',
        '/create': 'create', '/create-post': 'create',
        '/groups': 'groups', '/live': 'live', '/wallet': 'wallet',
        '/auth/login': 'auth-login', '/auth/register': 'auth-register',
        '/auth/signup': 'auth-register', '/auth/verify-email': 'auth-verify',
        '/auth/forgotten-password': 'auth-forgot', '/auth/forgot-password': 'auth-forgot',
      }
      if (pathRoutes[path]) {
        const r = pathRoutes[path]
        if (r === 'auth-login' || r === 'auth-register' || r === 'auth' || r === 'auth-verify') return
        // Forgot password route — show the ForgotPasswordView (which auto-detects ?token= from email link)
        if (r === 'auth-forgot') { setShowForgotPassword(true); return }
        if (r === 'feed') { setView('feed'); return }
        if (r === 'dm') { setView('dm'); return }
        if (r === 'myprofile') { setViewedUser(me?.username || ''); setView('profile'); return }
        if (r === 'discover') { setView('discover'); return }
        if (r === 'notifications') { setView('notifications'); return }
        if (r === 'create') { setView('create'); return }
        if (r === 'groups') { setView('groups'); return }
        if (r === 'live') { setView('live'); return }
        if (r === 'wallet') { setView('wallet'); return }
      }

      // Hash-based routes
      if (hash.startsWith('#profile=')) { setViewedUser(decodeURIComponent(hash.slice(9))); setView('profile'); window.location.hash = '' }
      else if (hash === '#myprofile') { setViewedUser(me?.username || ''); setView('profile'); window.location.hash = '' }
      else if (hash === '#messages') { setView('dm'); window.location.hash = '' }
      else if (hash === '#discover') { setView('discover'); window.location.hash = '' }
      else if (hash === '#notifications') { setView('notifications'); window.location.hash = '' }
      else if (hash === '#create') { setView('create'); window.location.hash = '' }
      else if (hash === '#groups') { setView('groups'); window.location.hash = '' }
      else if (hash === '#live') { setView('live'); window.location.hash = '' }
      else if (hash === '#wallet') { setView('wallet'); window.location.hash = '' }
      else if (hash.startsWith('#group=')) {
        const code = hash.slice(7).toUpperCase()
        api('/api/groups/join', { method: 'POST', body: JSON.stringify({ inviteCode: code }) })
          .then((d) => { setActiveGroup({ id: d.group.id, name: d.group.name, inviteCode: d.group.inviteCode }); setView('groupChat') }).catch(() => {})
        window.location.hash = ''
      }
    }
    handleRoute()
    window.addEventListener('hashchange', handleRoute)
    window.addEventListener('popstate', handleRoute)
    return () => { window.removeEventListener('hashchange', handleRoute); window.removeEventListener('popstate', handleRoute) }
  }, [me?.username])

  // Dynamic page title based on current view — "vibefam - <context> @<username>"
  useEffect(() => {
    const tag = (s: string) => { document.title = s }
    // Profile setup gate takes priority
    if (me && !me.profileSetupCompleted && !banInfo) {
      return tag(`Boboh Vibe - profile setup @${me.username}`)
    }
    if (view === 'profileSetup') return tag(`Boboh Vibe - profile setup @${me?.username || viewedUser}`)
    if (view === 'profile') return tag(`vibefam - friend @${viewedUser || me?.username}`)
    if (view === 'feed') return tag('vibefam - home')
    if (view === 'discover') return tag('vibefam - discover')
    if (view === 'create' || view === 'createStory') return tag('vibefam - create')
    if (view === 'notifications') return tag('vibefam - notifications')
    if (view === 'dm') return tag('vibefam - messages')
    if (view === 'dmChat' && activeConversationUser) return tag(`vibefam - @${activeConversationUser.username}`)
    if (view === 'groups') return tag('vibefam - groups')
    if (view === 'groupChat' && activeGroup) return tag(`vibefam - ${activeGroup.name}`)
    if (view === 'groupInfo' && activeGroup) return tag(`vibefam - ${activeGroup.name} info`)
    if (view === 'wallet') return tag('vibefam - wallet')
    if (view === 'live') return tag('vibefam - live')
    if (view === 'liveView') return tag('vibefam - live')
    if (view === 'saved') return tag('vibefam - saved')
    if (view === 'admin') return tag('vibefam - admin')
    if (view === 'post') return tag('vibefam - post')
    if (view === 'story') return tag('vibefam - story')
    return tag('Boboh Vibe')
  }, [view, viewedUser, me?.username, me?.profileSetupCompleted, banInfo, activeConversationUser, activeGroup])

  // Update URL when forced into profile setup gate
  useEffect(() => {
    if (me && !me.profileSetupCompleted && !banInfo) {
      const u = `/@${me.username}/profile-setup`
      if (window.location.pathname !== u) {
        window.history.replaceState(null, '', u)
      }
    }
  }, [me?.id, me?.profileSetupCompleted, banInfo])

  if (me === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fam-bg">
        <div className="flex flex-col items-center gap-4">
          <VibeFamLogo size="lg" />
          <div className="w-8 h-8 border-2 border-fam-purple border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // If user is banned, show the BannedScreen — check BEFORE me === null
  // because /api/auth/me returns { user: null, banInfo } for banned users
  if (banInfo) {
    return (
      <BannedScreen
        banInfo={banInfo}
        me={(me as SessionUser) || { id: '', username: 'user', displayName: 'User', avatarUrl: '', verified: false }}
        onAppealSubmitted={() => { api('/api/auth/me').then((d: { user: SessionUser | null; banInfo?: BanInfo }) => { setMe(d.user); setBanInfo(d.banInfo || null) }).catch(() => {}) }}
        onLogout={async () => {
          try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
          setMe(null)
          setBanInfo(null)
        }}
      />
    )
  }

  if (me === null) {
    // Forgot password view (full-screen, replaces auth)
    if (showForgotPassword) {
      return <ForgotPasswordView initialEmail={forgotPasswordEmail} onBack={() => { setShowForgotPassword(false); setForgotPasswordEmail('') }} showToast={showToast} />
    }
    return <AuthScreen onAuthed={(u) => {
      setMe(u)
      // Immediately refresh from /api/auth/me to pick up banInfo if the user is banned
      api('/api/auth/me').then((d: { user: SessionUser | null; banInfo?: BanInfo }) => {
        if (d.banInfo) {
          // User is banned — keep me as the user from login (so BannedScreen can show username)
          // and set banInfo so the BannedScreen renders
          setBanInfo(d.banInfo)
        } else {
          setMe(d.user)
          setBanInfo(null)
        }
      }).catch(() => {})
    }} showToast={showToast} onForgotPassword={(email) => { setForgotPasswordEmail(email || ''); setShowForgotPassword(true) }} isApp={isApp} />
  }

  // Profile setup gate — Facebook-style onboarding. Renders full-screen, no nav bars.
  if (me && !me.profileSetupCompleted && !banInfo) {
    return (
      <ProfileSetupView
        me={me}
        onComplete={(updatedUser) => {
          setMe({ ...me, ...updatedUser })
          setView('feed')
          // Update URL to /@username (clean profile URL)
          window.history.replaceState(null, '', `/@${me.username}`)
        }}
        showToast={showToast}
      />
    )
  }

  return (
    <div className={`min-h-screen bg-fam-bg text-fam-text theme-${theme}`}>
      {/* Domain migration banner — shows on old domain */}
      {typeof window !== 'undefined' && window.location.hostname.includes('vibefam.dpdns.org') && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-center py-2 px-4 flex items-center justify-center gap-3 text-sm">
          <span className="font-semibold">🎉 We've moved! Access vibefam on boboh-vibes.2bd.net</span>
          <a href="https://boboh-vibes.2bd.net" className="bg-white text-green-700 px-4 py-1 rounded-full text-xs font-bold hover:bg-green-50 transition-colors">
            Go to new site →
          </a>
        </div>
      )}
      {/* "Get APK" banner — only on web (not in APK) */}
      {!isApp && view !== 'post' && view !== 'story' && view !== 'dmChat' && view !== 'groupChat' && view !== 'liveView' && (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-center py-2 px-4 flex items-center justify-center gap-3 text-sm">
          <span className="font-semibold">📱 Get the Boboh Vibe app for calls, live streaming & more!</span>
          <a href="/vibefam.apk" download className="bg-white text-purple-700 px-4 py-1 rounded-full text-xs font-bold hover:bg-purple-50 transition-colors flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download
          </a>
        </div>
      )}
      {/* Desktop top bar (md+) */}
      <DesktopTopBar
        me={me}
        view={view}
        setView={setView}
        onOpenProfile={() => { setViewedUser(me.username); setView('profile') }}
        onOpenDM={() => setView('dm')}
        onOpenSwitchAccount={() => setSwitchAccountOpen(true)}
        unreadDMs={unreadDMs}
        unreadNotifications={unreadNotifications}
      />

      {/* Mobile top bar */}
      <MobileTopBar view={view} setView={setView} />

      {/* Content area — centered like Instagram desktop */}
      <main className="md:max-w-2xl md:mx-auto md:py-8 pb-20 md:pb-8 px-0 md:px-4">
        {view === 'feed' && (
          <FeedView me={me} onViewPost={setViewedPost} setView={setView} onViewUser={(u) => { setViewedUser(u); setView('profile') }} onViewStory={(g) => { setViewedStory(g); setView('story') }} />
        )}
        {view === 'discover' && (
          <DiscoverView me={me} onViewPost={setViewedPost} onViewUser={(u) => { setViewedUser(u); setView('profile') }} />
        )}
        {view === 'create' && (
          <CreateView me={me} onPosted={() => setView('feed')} showToast={showToast} />
        )}
        {view === 'notifications' && (
          <NotificationsView onViewUser={(u) => { setViewedUser(u); setView('profile') }} />
        )}
        {view === 'profile' && (
          <ProfileView
            username={viewedUser}
            me={me}
            onViewPost={setViewedPost}
            onBack={() => setView('feed')}
            onEditProfile={() => setEditProfileOpen(true)}
            onOpenDM={async (username) => {
              try {
                const d = await api('/api/dm/conversations', { method: 'POST', body: JSON.stringify({ username }) })
                setActiveConversationId(d.conversation.id)
                setActiveConversationUser(d.conversation.otherUser)
                setView('dmChat')
              } catch (e: unknown) {
                showToast(e instanceof Error ? e.message : 'Failed to start chat')
              }
            }}
            onGift={(user) => setGiftTarget(user)}
            onOpenWallet={() => setView('wallet')}
            onOpenSaved={() => setView('saved')}
          />
        )}
        {view === 'post' && viewedPost && (
          <PostDetailView post={viewedPost} me={me} onBack={() => setView('feed')} onViewUser={(u) => { setViewedUser(u); setView('profile') }} showToast={showToast} />
        )}
        {view === 'story' && viewedStory && (
          <StoryView group={viewedStory} onClose={() => setView('feed')} onViewUser={(u) => { setViewedUser(u); setView('profile') }} me={me} />
        )}
        {view === 'dm' && (
          <DMInboxView
            me={me}
            onOpenConversation={(conv) => { setActiveConversationId(conv.id); setActiveConversationUser(conv.otherUser); setView('dmChat') }}
            onViewUser={(u) => { setViewedUser(u); setView('profile') }}
            onNewChat={async (username) => {
              try {
                const d = await api('/api/dm/conversations', { method: 'POST', body: JSON.stringify({ username }) })
                setActiveConversationId(d.conversation.id)
                setActiveConversationUser(d.conversation.otherUser)
                setView('dmChat')
              } catch (e: unknown) {
                showToast(e instanceof Error ? e.message : 'Failed to start chat')
              }
            }}
            onBack={() => setView('feed')}
          />
        )}
        {view === 'dmChat' && activeConversationUser && (
          <DMChatView
            me={me}
            conversationId={activeConversationId}
            otherUser={activeConversationUser}
            onBack={() => setView('dm')}
            onViewUser={(u) => { setViewedUser(u); setView('profile') }}
            onGift={(user) => setGiftTarget(user)}
            onCall={(user, type) => {
              if (!isApp) {
                showToast('📱 Calls require the VibeFam APK. Download it from the banner above!')
                return
              }
              setCallTarget(user); setCallType(type)
            }}
          />
        )}
        {view === 'wallet' && (
          <WalletView me={me} onBack={() => setView('feed')} showToast={showToast} />
        )}
        {view === 'saved' && (
          <SavedView me={me} onViewPost={setViewedPost} onBack={() => setView('feed')} />
        )}
        {view === 'createStory' && (
          <CreateStoryView me={me} onPosted={() => setView('feed')} showToast={showToast} onBack={() => setView('feed')} />
        )}
        {view === 'groups' && (
          <GroupsView onOpenGroup={(g) => { setActiveGroup(g); setView('groupChat') }} onBack={() => setView('feed')} onCreate={() => setView('createGroup')} onJoin={() => setView('joinGroup')} />
        )}
        {view === 'groupChat' && activeGroup && (
          <GroupChatView me={me} group={activeGroup} onBack={() => setView('groups')} onInfo={() => setView('groupInfo')} showToast={showToast} />
        )}
        {view === 'groupInfo' && activeGroup && (
          <GroupInfoView group={activeGroup} me={me} onBack={() => setView('groupChat')} showToast={showToast} />
        )}
        {view === 'createGroup' && (
          <CreateGroupView me={me} onCreated={(g) => { setActiveGroup(g); setView('groupChat') }} onBack={() => setView('groups')} showToast={showToast} />
        )}
        {view === 'joinGroup' && (
          <JoinGroupView me={me} onJoined={(g) => { setActiveGroup(g); setView('groupChat') }} onBack={() => setView('groups')} showToast={showToast} />
        )}
        {view === 'live' && (
          <LiveListView onStartLive={async () => {
            try {
              const d = await api('/api/live', { method: 'POST', body: JSON.stringify({}) })
              setActiveLiveId(d.stream.id)
              setView('liveView')
            } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed to go live') }
          }} onViewLive={(id) => { setActiveLiveId(id); setView('liveView') }} onBack={() => setView('feed')} />
        )}
        {view === 'liveView' && (
          <LiveStreamView me={me} streamId={activeLiveId} onBack={() => setView('live')} showToast={showToast} />
        )}
        {view === 'admin' && me.isAdmin && (
          <AdminView me={me} onBack={() => setView('feed')} showToast={showToast} />
        )}
      </main>

      {/* Edit profile modal */}
      {editProfileOpen && (
        <EditProfileModal me={me} onClose={() => setEditProfileOpen(false)} onSaved={(u) => { setMe(u); setEditProfileOpen(false); showToast('Profile updated') }} showToast={showToast} />
      )}

      {/* Account & Security modal */}
      <AccountSecurityModal me={me} open={securityOpen} onClose={() => setSecurityOpen(false)} showToast={showToast} />

      {/* Gift modal */}
      {giftTarget && (
        <GiftModal me={me} target={giftTarget} onClose={() => setGiftTarget(null)} onSuccess={() => { setGiftTarget(null); showToast('Gift sent! 🎁') }} showToast={showToast} />
      )}

      {/* Call modal */}
      {callTarget && (
        <CallModal me={me} target={callTarget} type={callType} onClose={() => { setCallTarget(null); setAnsweredCallId(null) }} showToast={showToast} existingCallId={answeredCallId || undefined} />
      )}

      {/* Incoming call overlay — polls for ringing calls (APK only) */}
      <IncomingCallModal
        me={me}
        isApp={isApp}
        onAnswer={(call) => {
          // When user answers, open the CallModal with the caller as target
          // AND pass the existing call ID so it doesn't create a new call
          setCallTarget(call.fromUser)
          setCallType(call.type)
          setAnsweredCallId(call.id)
        }}
      />

      {/* Mobile bottom nav */}
      <MobileBottomNav me={me} view={view} setView={setView} unreadDMs={unreadDMs} unreadNotifications={unreadNotifications} onOpenProfile={() => { setViewedUser(me.username); setView('profile') }} onOpenDM={() => setView('dm')} onOpenSwitchAccount={() => setSwitchAccountOpen(true)} />

        {/* Floating hamburger button (top-right) — RED SHINY so it stands out */}
        {view !== 'post' && view !== 'story' && view !== 'dmChat' && view !== 'groupChat' && view !== 'liveView' && view !== 'groupInfo' && (
          <button
            onClick={() => setHamburgerOpen(true)}
            className="md:hidden fixed top-3 right-3 z-30 w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
              boxShadow: '0 0 16px rgba(239,68,68,0.6), 0 4px 12px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
              border: '1.5px solid rgba(255,255,255,0.15)',
              animation: 'vibefam-hamburger-glow 2s ease-in-out infinite',
            }}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        {/* Desktop hamburger (top bar right side) — RED SHINY */}
        {view !== 'post' && view !== 'story' && view !== 'dmChat' && view !== 'groupChat' && view !== 'liveView' && view !== 'groupInfo' && (
          <button
            onClick={() => setHamburgerOpen(true)}
            className="hidden md:flex fixed top-3 right-3 z-30 w-11 h-11 rounded-full items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)',
              boxShadow: '0 0 16px rgba(239,68,68,0.6), 0 4px 12px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
              border: '1.5px solid rgba(255,255,255,0.15)',
              animation: 'vibefam-hamburger-glow 2s ease-in-out infinite',
            }}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <HamburgerMenu
          me={me}
          open={hamburgerOpen}
          onClose={() => setHamburgerOpen(false)}
          theme={theme}
          onThemeChange={(t) => { setTheme(t); localStorage.setItem('vibefam-theme', t) }}
          onNavigate={(v) => {
            if (v === 'profile') { setViewedUser(me.username); setView('profile') }
            else if (v === 'wallet') setView('wallet')
            else if (v === 'saved') setView('saved')
            else if (v === 'admin') setView('admin')
          }}
          onLogout={async () => {
            try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
            setMe(null)
            showToast('Logged out')
          }}
          onSwitchAccount={() => setSwitchAccountOpen(true)}
          onOpenSecurity={() => setSecurityOpen(true)}
        />

      {/* VibeFam AI floating button (like Facebook Meta AI) */}
      <button
        onClick={() => setAiChatOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 z-40 w-14 h-14 rounded-full fam-gradient flex items-center justify-center shadow-lg shadow-fam-purple/40 hover:scale-105 transition-transform"
        title="VibeFam AI"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
          <circle cx="19" cy="5" r="1.5" fill="white" />
        </svg>
      </button>

      {/* VibeFam AI chat modal */}
      {aiChatOpen && (
        <AiChatModal me={me} onClose={() => setAiChatOpen(false)} />
      )}

      {/* Switch account modal */}
      {switchAccountOpen && (
        <SwitchAccountModal
          currentMe={me}
          onClose={() => setSwitchAccountOpen(false)}
          onSwitched={(u) => { setMe(u); setSwitchAccountOpen(false); showToast(`Switched to ${u.username}`) }}
          onLogout={async () => {
            try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
            setMe(null); setSwitchAccountOpen(false)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 glass px-4 py-2.5 rounded-xl text-sm animate-slide-up">
          {toast}
        </div>
      )}
    </div>
  )
}

// ============ PROFILE SETUP (Facebook-style onboarding) ============
function ProfileSetupView({ me, onComplete, showToast }: {
  me: SessionUser
  onComplete: (updatedUser: Partial<SessionUser>) => void
  showToast: (m: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [dob, setDob] = useState({ day: '', month: '', year: '' })
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl || '')
  const [coverUrl, setCoverUrl] = useState(me.coverUrl || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1))
  const years = Array.from({ length: 100 }, (_, i) => String(new Date().getFullYear() - i - 3))

  const calcAge = () => {
    if (!dob.day || !dob.month || !dob.year) return null
    const d = new Date(Number(dob.year), Number(dob.month) - 1, Number(dob.day))
    if (isNaN(d.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - d.getFullYear()
    const m = today.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
    return age
  }

  const handleNextFromStep1 = async () => {
    setError(null)
    const age = calcAge()
    if (age === null) { setError('Please select your full date of birth'); return }
    if (age < 15) { setError('You must be at least 15 years old to use Boboh Vibe'); return }
    if (!gender) { setError('Please select male or female'); return }
    setSaving(true)
    try {
      const iso = new Date(Number(dob.year), Number(dob.month) - 1, Number(dob.day)).toISOString()
      const res = await fetch('/api/profile/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfBirth: iso, gender, step: 'dob' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setStep(2)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  const handleUpload = async (file: File, kind: 'avatar' | 'cover') => {
    if (kind === 'avatar') setUploadingAvatar(true); else setUploadingCover(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      if (kind === 'avatar') setAvatarUrl(data.url); else setCoverUrl(data.url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      if (kind === 'avatar') setUploadingAvatar(false); else setUploadingCover(false)
    }
  }

  const handleComplete = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/profile/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl, coverUrl, step: 'photos' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setStep(3)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  const handleFinish = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/profile/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'complete' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to complete setup')
      onComplete(data.user || {})
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  // ============ PREMIUM BACKGROUND (shared by all 3 steps) ============
  // Same mesh-gradient + orbs used by auth screen for visual consistency.
  // IMPORTANT: all layers are position:fixed so they DON'T take up document space
  // (previous version used .auth-v2-bg which is min-height:100vh as a block element,
  //  pushing the actual form content below the viewport → "black screen" bug).
  const PremiumBg = () => (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: 'linear-gradient(180deg, #08040c 0%, #0c0614 40%, #050507 100%)', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '60%', height: '60%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div style={{ position: 'absolute', top: '20%', right: '-10%', width: '55%', height: '55%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)', filter: 'blur(70px)' }} />
      <div style={{ position: 'absolute', bottom: '-15%', left: '20%', width: '50%', height: '50%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, transparent 70%)', filter: 'blur(80px)' }} />
    </div>
  )

  // ============ STEP 3: SUCCESS PAGE — content at TOP ============
  // User requested the success page be at the top, not centered/bottom.
  // We use items-start + small pt to anchor content near the top.
  if (step === 3) {
    return (
      <div className="relative min-h-screen overflow-y-auto flex flex-col items-center" style={{ paddingTop: '5vh', paddingBottom: '4vh', zIndex: 1 }}>
        <PremiumBg />
        <div className="relative w-full max-w-md px-6 text-center" style={{ zIndex: 2 }}>
          {/* Logo at the very top */}
          <div className="flex justify-center mb-8">
            <div className="auth-v2-logo-glow"><VibeFamLogo size="lg" /></div>
          </div>

          {/* Animated success check — 3-stage ring pop */}
          <div className="relative mx-auto mb-6" style={{ width: 130, height: 130 }}>
            {/* Outer pulsing ring */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(0,186,124,0.35) 0%, rgba(0,186,124,0) 70%)',
                animation: 'vibefam-success-pulse 2s ease-in-out infinite',
              }}
            />
            {/* Middle ring */}
            <div
              className="absolute inset-2 rounded-full border-2"
              style={{ borderColor: 'rgba(0,186,124,0.4)', animation: 'vibefam-success-spin 8s linear infinite' }}
            />
            {/* Inner solid disc with check */}
            <div
              className="absolute inset-5 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #00BA7C 0%, #00875A 100%)',
                boxShadow: '0 12px 36px rgba(0,186,124,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              <svg
                width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: 'vibefam-check-draw 0.7s 0.3s ease-out backwards' }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            {/* Confetti dots */}
            <span className="absolute top-0 left-1/2 w-2 h-2 rounded-full" style={{ background: '#d4af37', animation: 'vibefam-confetti-1 1.5s 0.5s ease-out infinite' }} />
            <span className="absolute top-1/3 right-0 w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed', animation: 'vibefam-confetti-2 1.8s 0.7s ease-out infinite' }} />
            <span className="absolute bottom-0 right-1/3 w-2 h-2 rounded-full" style={{ background: '#ec4899', animation: 'vibefam-confetti-3 1.6s 0.4s ease-out infinite' }} />
            <span className="absolute bottom-1/3 left-0 w-1.5 h-1.5 rounded-full" style={{ background: '#00BA7C', animation: 'vibefam-confetti-4 1.7s 0.6s ease-out infinite' }} />
          </div>

          {/* Welcome heading */}
          <h1
            className="font-bold mb-2"
            style={{
              fontSize: '32px',
              lineHeight: '1.15',
              letterSpacing: '-0.02em',
              animation: 'vibefam-fade-up 0.6s 0.5s ease-out backwards',
            }}
          >
            <span style={{ color: '#ffffff' }}>Welcome to </span>
            <span style={{
              background: 'linear-gradient(135deg, #d4af37 0%, #f4d77a 50%, #d4af37 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>vibefam</span>
            <span style={{ color: '#ffffff' }}> base</span>
          </h1>
          <p
            className="text-lg mb-2"
            style={{
              color: '#b0b0b8',
              animation: 'vibefam-fade-up 0.6s 0.7s ease-out backwards',
            }}
          >
            Your profile is ready. Enjoy and have fun! 🎉
          </p>

          {/* Mini feature chips — premium touch */}
          <div
            className="flex flex-wrap justify-center gap-2 mb-8"
            style={{ animation: 'vibefam-fade-up 0.6s 0.9s ease-out backwards' }}
          >
            {[
              { icon: '📸', label: 'Share posts' },
              { icon: '💬', label: 'Chat with fam' },
              { icon: '🎵', label: 'Post stories' },
              { icon: '🔴', label: 'Go live' },
            ].map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f5f5f7',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <span style={{ fontSize: 14 }}>{chip.icon}</span>
                {chip.label}
              </span>
            ))}
          </div>

          {/* Continue button — premium gradient with hover lift */}
          <button
            onClick={handleFinish}
            disabled={saving}
            className="auth-v2-btn-primary w-full"
            style={{ animation: 'vibefam-fade-up 0.6s 1.1s ease-out backwards' }}
          >
            {saving ? <div className="auth-v2-spinner" /> : (
              <>
                Continue to vibefam
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 6 }}>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
          {error && <p className="auth-v2-error mt-3">{error}</p>}
        </div>
      </div>
    )
  }

  // ============ STEP 2: AVATAR + COVER PHOTO ============
  if (step === 2) {
    return (
      <div className="relative min-h-screen overflow-y-auto flex flex-col items-center px-4" style={{ paddingTop: '4vh', paddingBottom: '4vh', zIndex: 1 }}>
        <PremiumBg />
        <div className="relative w-full max-w-md" style={{ zIndex: 2 }}>
          {/* Top nav: back + progress dots */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setStep(1)} className="text-white/60 hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="flex gap-1.5">
              <div className="w-6 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #ec4899)' }} />
              <div className="w-6 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #ec4899)' }} />
              <div className="w-6 h-1 rounded-full bg-white/15" />
            </div>
            <div className="w-9" />
          </div>

          {/* Heading */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(236,72,153,0.25))', border: '1px solid rgba(124,58,237,0.35)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Add your photo</h1>
            <p className="text-white/50 text-sm px-2">Pick a profile picture and cover photo — or skip for now.</p>
          </div>

          {/* Cover photo — premium glass card */}
          <div className="mb-5">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-[0.12em] mb-2">Cover photo</label>
            <label className="block relative overflow-hidden rounded-2xl cursor-pointer group" style={{ height: 150, border: '2px dashed rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.05)' }}>
              {coverUrl ? (
                <>
                  <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    <span className="text-white text-xs font-semibold">Change cover</span>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 group-hover:bg-fam-purple/10 transition-colors">
                  {uploadingCover ? <Spinner /> : (
                    <>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><polyline points="21 15 16 10 5 21" /></svg>
                      </div>
                      <span className="text-white/70 text-xs font-semibold">Tap to upload cover</span>
                      <span className="text-white/30 text-[10px]">JPG, PNG, WEBP — max 10MB</span>
                    </>
                  )}
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'cover') }} />
            </label>
          </div>

          {/* Avatar — premium with glow ring */}
          <div className="flex flex-col items-center mb-7">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-[0.12em] mb-3 self-start">Profile picture</label>
            <label className="relative cursor-pointer group" style={{ width: 130, height: 130 }}>
              {/* Glow ring */}
              <div
                className="absolute -inset-1 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: 'conic-gradient(from 0deg, #7c3aed, #ec4899, #d4af37, #7c3aed)', filter: 'blur(8px)', animation: 'vibefam-ring-spin 4s linear infinite' }}
              />
              <div className="relative w-full h-full rounded-full overflow-hidden border-4" style={{ borderColor: '#F5F5F7', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {uploadingAvatar ? <Spinner size="lg" /> : (
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    )}
                  </div>
                )}
              </div>
              {/* Plus badge */}
              <div className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', border: '3px solid #0a0a0d', boxShadow: '0 4px 12px rgba(124,58,237,0.5)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'avatar') }} />
            </label>
            <p className="text-xs text-white/40 mt-3">Tap to upload</p>
          </div>

          {error && <p className="auth-v2-error mb-4 text-center">{error}</p>}

          {/* Buttons */}
          <button onClick={handleComplete} disabled={saving} className="auth-v2-btn-primary w-full mb-3">
            {saving ? <div className="auth-v2-spinner" /> : 'Continue'}
          </button>
          <button onClick={() => { setAvatarUrl(''); setCoverUrl(''); setStep(3) }} disabled={saving} className="auth-v2-text-btn w-full py-2 text-sm">
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  // ============ STEP 1: DOB + GENDER ============
  return (
    <div className="relative min-h-screen overflow-y-auto flex flex-col items-center px-4" style={{ paddingTop: '4vh', paddingBottom: '4vh', zIndex: 1 }}>
      <PremiumBg />
      <div className="relative w-full max-w-md" style={{ zIndex: 2 }}>
        {/* Top nav: progress dots only (no back on step 1) */}
        <div className="flex items-center justify-between mb-6">
          <div className="w-9" />
          <div className="flex gap-1.5">
            <div className="w-6 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #7c3aed, #ec4899)' }} />
            <div className="w-6 h-1 rounded-full bg-white/15" />
            <div className="w-6 h-1 rounded-full bg-white/15" />
          </div>
          <div className="w-9" />
        </div>

        {/* Heading with logo */}
        <div className="text-center mb-7">
          <div className="flex justify-center mb-3">
            <div className="auth-v2-logo-glow"><VibeFamLogo size="md" showText={false} /></div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1.5" style={{ letterSpacing: '-0.02em' }}>Let's set up your profile</h1>
          <p className="text-white/50 text-sm px-2">Tell us a bit about yourself. You must be at least 15 years old.</p>
        </div>

        {/* Date of birth — premium card */}
        <div className="mb-5 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
          <label className="flex items-center gap-2 text-[11px] font-bold text-white/60 uppercase tracking-[0.12em] mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Date of birth
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={dob.month}
              onChange={(e) => setDob({ ...dob, month: e.target.value })}
              className="w-full rounded-xl px-3 py-3 text-sm font-medium text-white outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="" style={{ background: '#FFFFFF' }}>Month</option>
              {months.map((m, i) => <option key={m} value={String(i + 1)} style={{ background: '#FFFFFF' }}>{m}</option>)}
            </select>
            <select
              value={dob.day}
              onChange={(e) => setDob({ ...dob, day: e.target.value })}
              className="w-full rounded-xl px-3 py-3 text-sm font-medium text-white outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="" style={{ background: '#FFFFFF' }}>Day</option>
              {days.map((d) => <option key={d} value={d} style={{ background: '#FFFFFF' }}>{d}</option>)}
            </select>
            <select
              value={dob.year}
              onChange={(e) => setDob({ ...dob, year: e.target.value })}
              className="w-full rounded-xl px-3 py-3 text-sm font-medium text-white outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="" style={{ background: '#FFFFFF' }}>Year</option>
              {years.map((y) => <option key={y} value={y} style={{ background: '#FFFFFF' }}>{y}</option>)}
            </select>
          </div>
          {calcAge() !== null && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {calcAge()! >= 15 ? (
                <>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                  </span>
                  <span className="text-xs text-green-400 font-semibold">You're {calcAge()} — perfect!</span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500/20">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </span>
                  <span className="text-xs text-red-400 font-semibold">You must be 15+ to use Boboh Vibe</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Gender — premium card */}
        <div className="mb-6 p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
          <label className="flex items-center gap-2 text-[11px] font-bold text-white/60 uppercase tracking-[0.12em] mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
            Gender
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setGender('male')}
              className="relative p-4 rounded-2xl flex flex-col items-center gap-2 transition-all overflow-hidden"
              style={{
                background: gender === 'male' ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                border: `2px solid ${gender === 'male' ? '#7c3aed' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: gender === 'male' ? '0 8px 24px rgba(124,58,237,0.3)' : 'none',
              }}
            >
              {gender === 'male' && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
              )}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={gender === 'male' ? '#a855f7' : '#888'} strokeWidth="2"><circle cx="10" cy="14" r="5" /><path d="M19 5l-5.4 5.4M19 5h-5M19 5v5" /></svg>
              <span className={`text-sm font-bold ${gender === 'male' ? 'text-white' : 'text-white/70'}`}>Male</span>
            </button>
            <button
              onClick={() => setGender('female')}
              className="relative p-4 rounded-2xl flex flex-col items-center gap-2 transition-all overflow-hidden"
              style={{
                background: gender === 'female' ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.04)',
                border: `2px solid ${gender === 'female' ? '#ec4899' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: gender === 'female' ? '0 8px 24px rgba(236,72,153,0.3)' : 'none',
              }}
            >
              {gender === 'female' && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ec4899, #be185d)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
              )}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={gender === 'female' ? '#ec4899' : '#888'} strokeWidth="2"><circle cx="12" cy="9" r="5" /><path d="M12 14v8M8 18h8" /></svg>
              <span className={`text-sm font-bold ${gender === 'female' ? 'text-white' : 'text-white/70'}`}>Female</span>
            </button>
          </div>
        </div>

        {error && <p className="auth-v2-error mb-4 text-center">{error}</p>}

        <button onClick={handleNextFromStep1} disabled={saving || !dob.day || !dob.month || !dob.year || !gender || (calcAge() !== null && calcAge()! < 15)} className="auth-v2-btn-primary w-full">
          {saving ? <div className="auth-v2-spinner" /> : 'Continue'}
        </button>
      </div>
    </div>
  )
}

// ============ FORGOT PASSWORD VIEW ============
function ForgotPasswordView({ initialEmail, onBack, showToast }: { initialEmail?: string; onBack: () => void; showToast: (m: string) => void }) {
  const [step, setStep] = useState<'request' | 'sent' | 'reset' | 'done'>(initialEmail ? 'sent' : 'request')
  const [emailOrUsername, setEmailOrUsername] = useState(initialEmail || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hasTokenFromUrl, setHasTokenFromUrl] = useState(false)

  useEffect(() => {
    // Check URL for ?token=xxx (from email link)
    const url = new URL(window.location.href)
    const t = url.searchParams.get('token')
    if (t) {
      setToken(t)
      setHasTokenFromUrl(true)
      setStep('reset')
    }
  }, [])

  const sendResetLink = async () => {
    setError(null)
    if (!emailOrUsername.trim()) { setError('Enter your email or username'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername: emailOrUsername.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reset link')
      setStep('sent')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setLoading(false) }
  }

  const resetPassword = async () => {
    setError(null)
    if (!token.trim()) { setError('Reset token is required'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset password')
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="relative min-h-screen overflow-y-auto flex flex-col items-center px-4" style={{ paddingTop: '8vh', paddingBottom: '4vh' }}>
      {/* Premium background */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'linear-gradient(180deg, #08040c 0%, #0c0614 40%, #050507 100%)' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '60%', height: '60%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', top: '20%', right: '-10%', width: '55%', height: '55%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)', filter: 'blur(70px)' }} />
      </div>

      <div className="relative w-full max-w-md" style={{ zIndex: 2 }}>
        <button onClick={onBack} className="text-white/60 hover:text-white p-2 mb-4 flex items-center gap-2 text-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back to login
        </button>

        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="auth-v2-logo-glow"><VibeFamLogo size="md" /></div>
          </div>
          {step === 'request' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
              <p className="text-white/50 text-sm">Enter your email or username — we'll send a reset link.</p>
            </>
          )}
          {step === 'sent' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
              <p className="text-white/50 text-sm">If that account exists, a reset link has been sent.</p>
            </>
          )}
          {step === 'reset' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Set New Password</h1>
              <p className="text-white/50 text-sm">Enter your new password below.</p>
            </>
          )}
          {step === 'done' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Password Reset! 🎉</h1>
              <p className="text-white/50 text-sm">You can now log in with your new password.</p>
            </>
          )}
        </div>

        {/* Step: Request */}
        {step === 'request' && (
          <div className="space-y-4">
            <input
              type="text"
              value={emailOrUsername}
              onChange={(e) => setEmailOrUsername(e.target.value)}
              placeholder="Email or username"
              autoCapitalize="none"
              className="auth-v2-input"
              onKeyDown={(e) => { if (e.key === 'Enter') sendResetLink() }}
            />
            {error && <p className="auth-v2-error">{error}</p>}
            <button onClick={sendResetLink} disabled={loading} className="auth-v2-btn-primary w-full">
              {loading ? <div className="auth-v2-spinner" /> : 'Send Reset Link'}
            </button>
          </div>
        )}

        {/* Step: Sent */}
        {step === 'sent' && (
          <div className="space-y-4">
            <div className="bg-white/5 rounded-2xl p-4 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" className="mx-auto mb-2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              <p className="text-white text-sm font-semibold mb-1">Email sent to your inbox</p>
              <p className="text-white/40 text-xs">Check your spam folder if you don't see it.</p>
            </div>
            <button onClick={() => setStep('request')} className="auth-v2-text-btn w-full py-2 text-sm">
              ← Try a different email
            </button>
            <button onClick={() => { setToken(''); setStep('reset') }} className="auth-v2-btn-primary w-full">
              I have a reset link →
            </button>
          </div>
        )}

        {/* Step: Reset (enter token + new password) */}
        {step === 'reset' && (
          <div className="space-y-3">
            {/* Only show token input if NOT from URL (manual entry) */}
            {!hasTokenFromUrl && (
              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase tracking-wider mb-1.5">Reset Token</label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your reset token"
                  autoCapitalize="none"
                  className="auth-v2-input"
                />
              </div>
            )}
            {hasTokenFromUrl && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" className="inline mr-1.5"><polyline points="20 6 9 17 4 12" /></svg>
                <span className="text-green-400 text-xs font-semibold">Reset link verified — set your new password below</span>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold text-white/60 uppercase tracking-wider mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="auth-v2-input"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/60 uppercase tracking-wider mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="auth-v2-input"
                onKeyDown={(e) => { if (e.key === 'Enter') resetPassword() }}
              />
            </div>
            {error && <p className="auth-v2-error">{error}</p>}
            <button onClick={resetPassword} disabled={loading} className="auth-v2-btn-primary w-full">
              {loading ? <div className="auth-v2-spinner" /> : 'Reset Password'}
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <button onClick={onBack} className="auth-v2-btn-primary w-full">
            Continue to Login →
          </button>
        )}
      </div>
    </div>
  )
}

// ============ ACCOUNT & SECURITY MODAL ============
function AccountSecurityModal({ me, open, onClose, showToast }: { me: SessionUser; open: boolean; onClose: () => void; showToast: (m: string) => void }) {
  const [info, setInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'info' | 'send-code' | 'verify' | 'change' | 'done'>('info')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLoading(true)
      api('/api/auth/security').then((d) => setInfo(d.user)).catch(() => {}).finally(() => setLoading(false))
      setStep('info'); setCode(''); setNewPassword(''); setConfirmPassword(''); setError(null)
    }
  }, [open])

  if (!open) return null

  const sendCode = async () => {
    setProcessing(true); setError(null)
    try {
      const res = await fetch('/api/auth/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send-code' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send code')
      showToast('Verification code sent to your email')
      setStep('verify')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setProcessing(false) }
  }

  const verifyCode = async () => {
    setProcessing(true); setError(null)
    try {
      const res = await fetch('/api/auth/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify-code', code }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid code')
      setStep('change')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setProcessing(false) }
  }

  const changePassword = async () => {
    setError(null)
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setProcessing(true)
    try {
      const res = await fetch('/api/auth/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change-password', code, newPassword }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      setStep('done')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setProcessing(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-[#FFFFFF] border border-white/10 rounded-t-3xl md:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header — premium classic with gold accent */}
        <div className="sticky top-0 z-10 p-4 flex items-center gap-3 border-b border-white/8" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(212,175,55,0.08) 100%)', backdropFilter: 'blur(20px)' }}>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <div className="flex-1 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <h2 className="text-white font-bold text-lg" style={{ letterSpacing: '-0.01em' }}>Account &amp; Security</h2>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : step === 'info' ? (
            <>
              {/* Profile header — premium with gold ring */}
              <div className="flex flex-col items-center mb-5">
                <div className="relative mb-3">
                  {info?.avatarUrl ? (
                    <img src={info.avatarUrl} alt="" className="w-24 h-24 rounded-full object-cover" style={{ border: '3px solid #d4af37', boxShadow: '0 0 24px rgba(212,175,55,0.3)' }} />
                  ) : (
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl ${waAvatarClass(info?.username || 'U')}`} style={{ border: '3px solid #d4af37', boxShadow: '0 0 24px rgba(212,175,55,0.3)' }}>
                      {waInitial(info?.displayName || info?.username || 'U')}
                    </div>
                  )}
                  {info?.verified && (
                    <div className="absolute -bottom-1 -right-1 bg-[#FFFFFF] rounded-full p-0.5">
                      <VerifiedBadge type={info.verifiedType} size={20} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-black font-bold text-lg">{info?.displayName || info?.username}</h3>
                </div>
                <p className="text-fam-muted text-sm">@{info?.username}</p>
                <div className="mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: info?.isAdmin ? 'rgba(239,68,68,0.15)' : info?.verified ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)', color: info?.isAdmin ? '#ef4444' : info?.verified ? '#a855f7' : 'rgba(255,255,255,0.4)' }}>
                  {info?.isAdmin ? 'Admin' : info?.verified ? 'Verified' : 'Standard'}
                </div>
              </div>

              {/* Get Verified card — premium gold offer */}
              {!info?.verified && (
                <a
                  href="https://wa.me/254795314221"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-5 rounded-2xl overflow-hidden relative group"
                  style={{ background: 'linear-gradient(135deg, #1a1408 0%, #2a1f0a 50%, #1a1408 100%)', border: '1px solid rgba(212,175,55,0.3)' }}
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity" style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(212,175,55,0.2) 50%, transparent 60%)' }} />
                  <div className="relative p-4 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #d4af37, #b8941f)', boxShadow: '0 4px 16px rgba(212,175,55,0.4)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-white font-bold text-base">Get Verified</span>
                        <VerifiedBadge type="blue" size={14} />
                      </div>
                      <p className="text-white/60 text-xs mb-1">Premium blue badge for your profile</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold" style={{ color: '#d4af37' }}>$3.5</span>
                        <span className="text-white/40 text-xs">/ 2 months</span>
                      </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2.5" className="flex-shrink-0"><polyline points="9 18 15 12 9 6" /></svg>
                  </div>
                  <div className="relative px-4 pb-3 flex items-center gap-1.5 text-[11px] text-white/40">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#25D366' }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z" /></svg>
                    Contact us on WhatsApp to get verified
                  </div>
                </a>
              )}

              {/* Info section — premium classic cards */}
              <div className="mb-5">
                <h4 className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                  Account Information
                </h4>
                <div className="space-y-1.5">
                  <InfoRow label="Email" value={info?.email || 'Not set'} icon="mail" />
                  <InfoRow label="Phone" value={info?.whatsappNumber || 'Not set'} icon="phone" />
                  <InfoRow label="Gender" value={info?.gender ? (info.gender.charAt(0).toUpperCase() + info.gender.slice(1)) : 'Not set'} icon="user" />
                  <InfoRow label="Date of Birth" value={info?.dateOfBirth ? new Date(info.dateOfBirth).toLocaleDateString() : 'Not set'} icon="calendar" />
                  <InfoRow label="Joined" value={info?.createdAt ? new Date(info.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'} icon="calendar" />
                </div>
              </div>

              {/* Stats section */}
              <div className="mb-5">
                <h4 className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                  Statistics
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div className="text-xl font-bold text-white">{info?._count?.posts || 0}</div>
                    <div className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">Posts</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div className="text-xl font-bold text-white">{info?._count?.gotFollows || 0}</div>
                    <div className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">Followers</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <div className="text-xl font-bold text-white">{info?._count?.sentFollows || 0}</div>
                    <div className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">Following</div>
                  </div>
                </div>
              </div>

              {/* Name change limit info */}
              <div className="mb-5 rounded-xl p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(212,175,55,0.15)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-black">Display name changes</div>
                  <div className="text-[11px] text-fam-muted">{info?.displayNameChangeCount || 0} of 2 used (resets every 60 days)</div>
                </div>
              </div>

              {/* Change password button — premium */}
              <button
                onClick={() => setStep('send-code')}
                className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)', boxShadow: '0 8px 24px rgba(124,58,237,0.3)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Change Password
              </button>
            </>
          ) : step === 'send-code' ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(212,175,55,0.1))', border: '1px solid rgba(124,58,237,0.3)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Verify Your Identity</h3>
              <p className="text-white/50 text-sm mb-5 max-w-[260px] mx-auto">Create your account in seconds and start sharing your vibe.</p>
              {error && (
                <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs font-semibold text-center">{error}</div>
              )}
              <button onClick={sendCode} disabled={processing} className="w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                {processing ? <div className="auth-v2-spinner" /> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    Send Verification Code
                  </>
                )}
              </button>
              <button onClick={() => setStep('info')} className="w-full mt-2 py-2 text-white/50 hover:text-white text-sm font-semibold">← Back</button>
            </div>
          ) : step === 'verify' ? (
            <div className="py-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-bold text-lg mb-1">Enter Verification Code</h3>
                <p className="text-white/50 text-sm">Check your email for the 6-digit code.</p>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-3xl tracking-[0.5em] text-center font-bold outline-none focus:border-fam-purple"
                style={{ fontFamily: 'monospace' }}
                maxLength={6}
              />
              {error && (
                <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs font-semibold text-center">{error}</div>
              )}
              <button onClick={verifyCode} disabled={processing || code.length !== 6} className="w-full mt-3 py-3.5 rounded-xl text-white font-bold disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                {processing ? <div className="auth-v2-spinner" /> : 'Verify Code'}
              </button>
              <button onClick={sendCode} className="w-full mt-2 py-2 text-fam-purple/80 hover:text-fam-purple text-sm font-semibold">Resend code</button>
            </div>
          ) : step === 'change' ? (
            <div className="py-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-bold text-lg mb-1">Set New Password</h3>
                <p className="text-white/50 text-sm">Choose a strong password (min 6 characters).</p>
              </div>
              <div className="space-y-3">
                <PremiumInput icon="lock" type="password" value={newPassword} onChange={setNewPassword} placeholder="New password" />
                <PremiumInput icon="lock" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm new password" />
              </div>
              {error && (
                <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs font-semibold text-center">{error}</div>
              )}
              <button onClick={changePassword} disabled={processing} className="w-full mt-4 py-3.5 rounded-xl text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
                {processing ? <div className="auth-v2-spinner" /> : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    Change Password
                  </>
                )}
              </button>
            </div>
          ) : step === 'done' ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, #00BA7C, #00875A)', boxShadow: '0 12px 36px rgba(0,186,124,0.4)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h3 className="text-white font-bold text-xl mb-1">Password Changed!</h3>
              <p className="text-white/50 text-sm mb-6">Your password has been updated successfully.</p>
              <button onClick={onClose} className="w-full py-3.5 rounded-xl text-white font-bold" style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>Done</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: 'mail' | 'phone' | 'user' | 'calendar' }) {
  const icons: Record<string, React.ReactNode> = {
    mail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
    phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    user: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  }
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors hover:bg-white/[0.04]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="flex items-center gap-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
        {icon && icons[icon] && <span className="text-white/30">{icons[icon]}</span>}
        {label}
      </span>
      <span className="text-sm font-semibold text-white text-right max-w-[60%] truncate">{value}</span>
    </div>
  )
}

// ============ Premium Input (with icon) ============
function PremiumInput({ icon, value, onChange, placeholder, type = 'text', autoCapitalize, onEnter }: {
  icon: 'user' | 'at' | 'mail' | 'lock'
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoCapitalize?: 'none' | 'sentences'
  onEnter?: () => void
}) {
  const icons: Record<string, React.ReactNode> = {
    user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    at: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>,
    mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
    lock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  }
  const [focused, setFocused] = useState(false)
  return (
    <div
      className="relative flex items-center rounded-xl transition-all"
      style={{
        background: focused ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${focused ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="pl-3.5 pr-2" style={{ color: focused ? '#a855f7' : 'rgba(255,255,255,0.3)' }}>
        {icons[icon]}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/30 py-3 pr-4"
      />
    </div>
  )
}

// ============ AUTH SCREEN ============
function AuthScreen({ onAuthed, showToast, onForgotPassword, isApp }: { onAuthed: (u: SessionUser) => void; showToast: (m: string) => void; onForgotPassword: (initialEmail?: string) => void; isApp?: boolean }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [form, setForm] = useState({ username: '', email: '', password: '', displayName: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStep, setVerifyStep] = useState<'auth' | 'verify'>('auth')
  const [otpCode, setOtpCode] = useState('')
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Page title
  useEffect(() => { document.title = 'Boboh Vibe' }, [])

  // Handle Google Sign-In redirect result (for APK where popups are blocked)
  useEffect(() => {
    (async () => {
      try {
        const { auth } = await import('@/lib/firebase')
        const { getRedirectResult } = await import('firebase/auth')
        const result = await getRedirectResult(auth)
        if (result && result.user) {
          const googleUser = result.user
          setLoading(true)
          const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleId: googleUser.uid, email: googleUser.email, displayName: googleUser.displayName, photoURL: googleUser.photoURL }),
          })
          const data = await res.json()
          if (data.ok) {
            showToast('Welcome to Boboh Vibe!')
            onAuthed(data.user)
          } else {
            setError(data.error || 'Google sign-in failed')
          }
        }
      } catch (e: unknown) {
        // Ignore — no redirect result
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        // Check terms acceptance first
        if (!termsAccepted) {
          setError('⚠️ Please accept the Terms of Service & Privacy Policy to continue')
          setLoading(false)
          return
        }
        // Validate all required fields
        if (!form.displayName || !form.displayName.trim()) {
          setError('Display name is required')
          setLoading(false)
          return
        }
        if (!form.username || !form.username.trim()) {
          setError('Username is required')
          setLoading(false)
          return
        }
        if (form.username.length < 3) {
          setError('Username must be at least 3 characters')
          setLoading(false)
          return
        }
        if (!/^[a-zA-Z0-9_.]+$/.test(form.username)) {
          setError('Username can only have letters, numbers, _ and .')
          setLoading(false)
          return
        }
        if (!form.email || !form.email.trim()) {
          setError('Email is required for verification')
          setLoading(false)
          return
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
          setError('Please enter a valid email address')
          setLoading(false)
          return
        }
        if (!form.password || form.password.length < 6) {
          setError('Password must be at least 6 characters')
          setLoading(false)
          return
        }
        // Send verification code via email
        const verifyRes = await fetch('/api/auth/send-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email }) })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Failed to send verification code')
        setVerifyEmail(form.email.trim())
        setVerifyStep('verify')
        setLoading(false)
        return
      }
      // Login
      if (!form.username || !form.password) {
        setError('Username and password are required')
        setLoading(false)
        return
      }
      const path = '/api/auth/login'
      const body = { username: form.username, password: form.password }
      const d = await api(path, { method: 'POST', body: JSON.stringify(body) }) as { user: SessionUser }
      showToast('Welcome back!')
      onAuthed(d.user)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Something went wrong') } finally { setLoading(false) }
  }

  const verifyCode = async () => {
    setVerifyLoading(true)
    setError(null)
    const verifyRes = await fetch('/api/auth/send-verification', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verifyEmail, code: otpCode.trim() }) })
    const verifyData = await verifyRes.json()
    if (!verifyRes.ok || !verifyData.ok) { setError(verifyData.error || 'Invalid code'); setVerifyLoading(false); return }
    try {
      const d = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username: form.username, email: verifyEmail, password: form.password, displayName: form.displayName || form.username }) }) as { user: SessionUser }
      showToast('Email verified! Welcome to Boboh Vibe!')
      onAuthed(d.user)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setVerifyLoading(false) }
  }

  const resendCode = async () => {
    setVerifyLoading(true)
    try {
      const res = await fetch('/api/auth/send-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verifyEmail }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Code re-sent!')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') } finally { setVerifyLoading(false) }
  }

  // ========== VERIFY STEP ==========
  if (verifyStep === 'verify') {
    return (
      <div className="relative min-h-screen flex items-center justify-center" style={{ zIndex: 1 }}>
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: '#000', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '55%', height: '55%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%)', filter: 'blur(70px)' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '50%', height: '50%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        </div>
        <div className="relative w-full max-w-sm px-6" style={{ zIndex: 2 }}>
          <div className="text-center mb-6">
            <div className="inline-grid h-16 w-16 place-items-center rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(124,58,237,0.15))', border: '1px solid rgba(34,197,94,0.3)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" /></svg>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Verify your email</h1>
            <p className="text-sm text-white/50">Enter the 6-digit code sent to<br /><span className="text-[#22c55e] font-semibold">{verifyEmail}</span></p>
          </div>
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input key={i} type="text" inputMode="numeric" maxLength={1} value={otpCode[i] || ''}
                onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); const c = otpCode.split(''); c[i] = val; setOtpCode(c.join('')); if (val && i < 5) { (e.target.parentElement?.children[i + 1] as HTMLInputElement)?.focus() } }}
                onKeyDown={(e) => { if (e.key === 'Backspace' && !otpCode[i] && i > 0) { (e.target.parentElement?.children[i - 1] as HTMLInputElement)?.focus() } if (e.key === 'Enter' && otpCode.length === 6) verifyCode() }}
                className="w-11 h-14 rounded-xl text-center text-xl font-bold text-white outline-none transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)' }} autoFocus={i === 0} />
            ))}
          </div>
          {error && <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs font-semibold text-center">{error}</div>}
          <button onClick={verifyCode} disabled={verifyLoading || otpCode.length !== 6} className="w-full py-3.5 rounded-xl text-white font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #22c55e, #7c3aed)', boxShadow: '0 8px 24px rgba(34,197,94,0.3)' }}>
            {verifyLoading ? <div className="auth-v2-spinner" /> : 'Verify & create account'}
          </button>
          <div className="flex justify-between mt-3">
            <button onClick={() => setVerifyStep('auth')} className="text-sm text-white/40 hover:text-white transition">← Back</button>
            <button onClick={resendCode} disabled={verifyLoading} className="text-sm text-[#22c55e] hover:text-[#22c55e]/80 transition font-semibold">Resend code</button>
          </div>
        </div>
      </div>
    )
  }

  // ========== AUTH STEP ==========
  return (
    <div className="relative min-h-screen overflow-y-auto flex flex-col items-center" style={{ paddingTop: '4vh', paddingBottom: '4vh', zIndex: 1 }}>
      {/* Pure black background — cool premium */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', background: '#000000', pointerEvents: 'none' }}>
        {/* Animated orbs — green + purple + gold on pure black */}
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '55%', height: '55%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)', filter: 'blur(70px)', animation: 'vibefam-orb-float 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '25%', right: '-10%', width: '50%', height: '50%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 70%)', filter: 'blur(80px)', animation: 'vibefam-orb-float 10s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '25%', width: '45%', height: '45%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)', filter: 'blur(90px)', animation: 'vibefam-orb-float 12s ease-in-out infinite' }} />
        {/* Subtle grid overlay */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      <div className="relative w-full max-w-md px-6" style={{ zIndex: 2 }}>
        {/* Logo with premium glow + intro animation — uses BLACK bg logo on splash */}
        <div className="text-center mb-6">
          <div className="auth-v2-logo-glow inline-block mb-5" style={{ animation: 'vibefam-fade-up 0.8s ease-out', filter: 'drop-shadow(0 0 30px rgba(34,197,94,0.4)) drop-shadow(0 0 60px rgba(124,58,237,0.2))' }}>
            <img src="/vibefam-logo-black.svg" alt="Boboh Vibe" width={300} height={150} style={{ objectFit: 'contain', display: 'block' }} />
          </div>
          <p className="text-white/50 text-sm font-medium tracking-wide" style={{ animation: 'vibefam-fade-up 0.6s 0.3s ease-out backwards' }}>Share your vibe. Build your fam.</p>
          {/* Premium badge row */}
          <div className="flex items-center justify-center gap-2 mt-3" style={{ animation: 'vibefam-fade-up 0.6s 0.5s ease-out backwards' }}>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z"/></svg>
              Premium
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(124,58,237,0.1)', color: '#a855f7', border: '1px solid rgba(124,58,237,0.25)' }}>
              M-Pesa Wallet
            </span>
          </div>
          {/* Loading spinner — only shows during loading */}
          {loading && (
            <div className="flex justify-center mt-6" style={{ animation: 'vibefam-fade-up 0.3s ease-out' }}>
              <div style={{
                width: 32, height: 32,
                border: '3px solid rgba(255,255,255,0.1)',
                borderTopColor: '#22c55e',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          )}
        </div>

        {/* Premium glass card — cooler with gradient border */}
        <div
          className="relative rounded-3xl p-[1.5px] mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,0.3) 0%, rgba(124,58,237,0.3) 50%, rgba(212,175,55,0.2) 100%)',
            animation: 'vibefam-fade-up 0.6s 0.4s ease-out backwards',
          }}
        >
        <div
          className="rounded-3xl p-6"
          style={{
            background: 'rgba(10,10,13,0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Toggle — premium pill */}
          <div className="flex gap-1 bg-white/5 rounded-2xl p-1 mb-5">
            <button
              onClick={() => { setMode('signup'); setError(null) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mode === 'signup' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
              style={mode === 'signup' ? { background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 12px rgba(124,58,237,0.4)' } : {}}
            >
              Sign up
            </button>
            <button
              onClick={() => { setMode('login'); setError(null) }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${mode === 'login' ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
              style={mode === 'login' ? { background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', boxShadow: '0 4px 12px rgba(124,58,237,0.4)' } : {}}
            >
              Log in
            </button>
          </div>

          {/* Inputs — premium with icons */}
          <div className="space-y-3">
            {mode === 'signup' && (
              <PremiumInput icon="user" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} placeholder="Display name" />
            )}
            <PremiumInput icon="at" value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder={mode === 'login' ? 'Username or email' : 'Username'} autoCapitalize="none" />
            {mode === 'signup' && (
              <PremiumInput icon="mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="Email address" autoCapitalize="none" />
            )}
            <PremiumInput icon="lock" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="Password" onEnter={() => { if (form.username && form.password) submit() }} />
          </div>

          {error && (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs font-semibold text-center">
              {error}
            </div>
          )}
          {mode === 'signup' && (
            <div className="mt-3 flex items-center gap-1.5 text-white/40 text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              A 6-digit verification code will be sent to your email
            </div>
          )}

          {/* Continue button — premium gradient */}
          <button
            onClick={submit}
            disabled={loading || !form.username || !form.password || (mode === 'signup' && !form.email)}
            className="w-full mt-5 py-3.5 rounded-xl text-white font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%)', boxShadow: '0 8px 24px rgba(124,58,237,0.4)' }}
          >
            {loading ? <div className="auth-v2-spinner" /> : (
              <>
                {mode === 'login' ? 'Log in' : 'Continue'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </>
            )}
          </button>

          {mode === 'login' && (
            <button onClick={() => onForgotPassword()} className="w-full mt-2 py-2 text-center text-sm font-semibold text-fam-purple/80 hover:text-fam-purple transition-colors">
              Forgot password?
            </button>
          )}
          </div>
        </div>

        {/* Google sign-in — full width premium button */}
        <button
          onClick={async () => {
            try {
              const { auth, googleProvider } = await import('@/lib/firebase')
              // In APK (WebView), popups are blocked — use redirect instead
              if (isApp) {
                const { signInWithRedirect } = await import('firebase/auth')
                await signInWithRedirect(auth, googleProvider)
              } else {
                const { signInWithPopup } = await import('firebase/auth')
                const result = await signInWithPopup(auth, googleProvider)
                const googleUser = result.user
                const res = await fetch('/api/auth/google', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ googleId: googleUser.uid, email: googleUser.email, displayName: googleUser.displayName, photoURL: googleUser.photoURL }),
                })
                const data = await res.json()
                if (data.ok) {
                  showToast('Welcome to Boboh Vibe!')
                  onAuthed(data.user)
                } else {
                  setError(data.error || 'Google sign-in failed')
                }
              }
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Google sign-in failed')
            }
          }}
          className="w-full py-3.5 rounded-xl bg-white text-gray-900 font-bold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all active:scale-[0.98]"
          style={{ animation: 'vibefam-fade-up 0.6s 0.6s ease-out backwards', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          Continue with Google
        </button>

        {/* Terms acceptance — prominent card */}
        <label className={`flex items-start gap-3 mt-4 cursor-pointer p-3 rounded-xl border transition-all ${mode === 'signup' ? '' : 'opacity-50'}`} style={{ borderColor: termsAccepted ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)', background: termsAccepted ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)' }}>
          <div className="relative flex-shrink-0 mt-0.5">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="sr-only" />
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all" style={{ borderColor: termsAccepted ? '#22c55e' : 'rgba(255,255,255,0.2)', background: termsAccepted ? '#22c55e' : 'transparent' }}>
              {termsAccepted && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
          </div>
          <span className="text-white/50 text-xs leading-relaxed">
            I agree to the <span className="text-white/80 font-semibold">Terms of Service</span> & <span className="text-white/80 font-semibold">Privacy Policy</span>. I confirm I am at least 15 years old.
          </span>
        </label>
      </div>
    </div>
  )
}

// ============ FEED VIEW ============
function FeedView({ me, onViewPost, setView, onViewUser, onViewStory }: {
  me: SessionUser
  onViewPost: (p: Post) => void
  setView: (v: 'feed' | 'discover' | 'create' | 'notifications' | 'profile' | 'post' | 'story' | 'userSearch') => void
  onViewUser: (u: string) => void
  onViewStory: (g: StoryGroup) => void
}) {
  const [data, setData] = useState<{ posts: Post[]; stories: StoryGroup[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api('/api/feed').then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load feed'))
  }, [])

  if (error) return <CenterMsg msg={error} action="Retry" onAction={() => location.reload()} />
  if (!data) return <Loading />
  if (data.posts.length === 0 && data.stories.length === 0) {
    return (
      <div className="space-y-3">
        <StoriesBar stories={[]} onView={onViewStory} onAddStory={() => setView('createStory')} me={me} onViewUser={onViewUser} />
        <div className="bg-[#FFFFFF] rounded-2xl p-3 mx-4 md:mx-0 border border-fam-border">
          <div className="flex items-center gap-3 mb-3">
            {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${waAvatarClass(me.username)}`}>{waInitial(me.displayName || me.username)}</div>}
            <button onClick={() => setView('create')} className="flex-1 text-left bg-[#F5F5F7] border border-fam-border rounded-full px-4 py-2.5 text-sm text-fam-muted">What do you want to talk about?</button>
          </div>
          <div className="flex gap-2 border-t border-fam-border pt-3">
            <button onClick={() => setView('create')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg> Photo</button>
            <button onClick={() => setView('create')} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg> Video</button>
          </div>
        </div>
        <CenterMsg msg="No posts yet" sub="Be the first to post!" action="Create post" onAction={() => setView('create')} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stories bar — ALWAYS show (even if no stories, just show Create story card) */}
      <StoriesBar stories={data.stories} onView={onViewStory} onAddStory={() => setView('createStory')} me={me} onViewUser={onViewUser} />

      {/* Post composer — Facebook-style "What do you want to talk about?" */}
      <div className="bg-[#FFFFFF] rounded-2xl p-3 mx-4 md:mx-0 border border-fam-border">
        <div className="flex items-center gap-3 mb-3">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${waAvatarClass(me.username)}`}>
              {waInitial(me.displayName || me.username)}
            </div>
          )}
          <button
            onClick={() => setView('create')}
            className="flex-1 text-left bg-[#F5F5F7] border border-fam-border rounded-full px-4 py-2.5 text-sm text-fam-muted hover:bg-[#EBEBEE] transition-colors"
          >
            What do you want to talk about?
          </button>
        </div>
        <div className="flex gap-2 border-t border-fam-border pt-3">
          <button
            onClick={() => setView('create')}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-[#F5F5F7] text-sm font-semibold text-fam-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            Photo
          </button>
          <button
            onClick={() => setView('create')}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-[#F5F5F7] text-sm font-semibold text-fam-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            Video
          </button>
        </div>
      </div>

      {/* Posts */}
      {data.posts.length === 0 ? (
        <CenterMsg msg="No posts yet" sub="Be the first to post!" action="Create post" onAction={() => setView('create')} />
      ) : (
        data.posts.map((p) => (
          <PostCard key={p.id} post={p} me={me} onView={(post) => { onViewPost(post); setView('post') }} onViewUser={onViewUser} />
        ))
      )}
    </div>
  )
}

// ============ STORIES BAR ============
function StoriesBar({ stories, onView, onAddStory, me, onViewUser }: {
  stories: StoryGroup[]
  onView: (g: StoryGroup) => void
  onAddStory: () => void
  me: SessionUser
  onViewUser: (u: string) => void
}) {
  const myStories = stories.find((s) => s.isMine)

  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-4 md:px-0 py-3 border-b border-fam-border">
      {/* Create story card — card-style with split background + floating + button */}
      <button onClick={onAddStory} className="flex-shrink-0 w-[96px] h-[140px] rounded-2xl overflow-hidden relative bg-fam-surface border border-fam-border hover:opacity-90 transition-opacity">
        {/* Top 70% — avatar/initial area with gradient */}
        <div className="h-[70%] bg-gradient-to-br from-fam-purple to-fam-violet flex items-center justify-center relative">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-white">{waInitial(me.displayName || me.username)}</span>
          )}
          {/* Floating + button at bottom-center, overlapping the split */}
          <div className="absolute bottom-[-14px] left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#22c55e] flex items-center justify-center border-[3px] border-fam-bg shadow-lg z-10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
          </div>
        </div>
        {/* Bottom 30% — white/dark area with label */}
        <div className="h-[30%] flex items-end justify-center pb-2 pt-4">
          <span className="text-[11px] font-semibold text-fam-text">Create story</span>
        </div>
      </button>

      {/* My existing stories (if any) */}
      {myStories && (
        <button onClick={() => onView(myStories)} className="flex-shrink-0 w-[96px] h-[140px] rounded-2xl overflow-hidden relative border-2 border-fam-purple">
          {myStories.items[0]?.imageUrl ? (
                  <img src={myStories.items[0].imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-800 flex items-center justify-center p-4">
                    <span className="text-white text-sm font-bold text-center">{myStories.items[0]?.caption || 'Text story'}</span>
                  </div>
                )}
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-1">
              {myStories.author.avatarUrl ? (
                <img src={myStories.author.avatarUrl} alt="" className="w-6 h-6 rounded-full border border-white object-cover" />
              ) : (
                <div className={`w-6 h-6 rounded-full border border-white flex items-center justify-center text-white text-[10px] font-bold ${waAvatarClass(myStories.author.username)}`}>{waInitial(myStories.author.displayName || myStories.author.username)}</div>
              )}
              <span className="text-[10px] text-white font-semibold truncate">Your story</span>
            </div>
          </div>
        </button>
      )}

      {/* Other users' stories — card-style */}
      {stories.filter((s) => !s.isMine).map((s) => (
        <button key={s.author.id} onClick={() => onView(s)} className="flex-shrink-0 w-[96px] h-[140px] rounded-2xl overflow-hidden relative border border-fam-border">
          <img src={s.items[0]?.imageUrl} alt="" className="w-full h-full object-cover" />
          {/* Avatar at top-left */}
          <div className="absolute top-2 left-2">
            {s.author.avatarUrl ? (
              <img src={s.author.avatarUrl} alt="" className="w-8 h-8 rounded-full border-2 border-fam-purple object-cover" />
            ) : (
              <div className={`w-8 h-8 rounded-full border-2 border-fam-purple flex items-center justify-center text-white text-xs font-bold ${waAvatarClass(s.author.username)}`}>{waInitial(s.author.displayName || s.author.username)}</div>
            )}
          </div>
          {/* Username at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
            <span className="text-[10px] text-white font-semibold truncate block">{s.author.displayName || s.author.username}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ============ POST CARD ============
function PostCard({ post, me, onView, onViewUser }: {
  post: Post
  me: SessionUser
  onView: (p: Post) => void
  onViewUser: (u: string) => void
}) {
  const [liked, setLiked] = useState(post.liked)
  const [likeCount, setLikeCount] = useState(post._count.likes)
  const [bookmarked, setBookmarked] = useState(post.bookmarked)
  const [showHeart, setShowHeart] = useState(false)

  const toggleLike = async () => {
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeCount((c) => c + (wasLiked ? -1 : 1))
    try {
      await api(`/api/posts/${post.id}/like`, { method: 'POST' })
    } catch {
      setLiked(wasLiked)
      setLikeCount((c) => c + (wasLiked ? 1 : -1))
    }
  }

  const toggleBookmark = async () => {
    const was = bookmarked
    setBookmarked(!was)
    try {
      await api(`/api/posts/${post.id}/bookmark`, { method: 'POST' })
    } catch {
      setBookmarked(was)
    }
  }

  const doubleTap = () => {
    if (!liked) toggleLike()
    setShowHeart(true)
    setTimeout(() => setShowHeart(false), 800)
  }

  return (
    <article className="bg-[#FFFFFF] md:rounded-2xl border-b md:border border-fam-border overflow-hidden mb-2">
      {/* Header — avatar + name + time (FB Lite style) */}
      <div className="flex items-center gap-2.5 p-3">
        {post.author.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" onClick={() => onViewUser(post.author.username)} />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${waAvatarClass(post.author.username)}`} onClick={() => onViewUser(post.author.username)}>
            {waInitial(post.author.displayName || post.author.username)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={() => onViewUser(post.author.username)} className="flex items-center gap-1 text-sm font-semibold hover:opacity-70">
            <span>{post.author.displayName || post.author.username}</span>
            {post.author.verified && <VerifiedBadge type={post.author.verifiedType} size={14} />}
          </button>
          <div className="text-xs text-fam-muted flex items-center gap-1">
            <span>{timeAgo(post.createdAt)}</span>
            {post.location && <><span>·</span><span className="truncate">{post.location}</span></>}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
          </div>
        </div>
        <button onClick={() => onView(post)} className="p-1 text-fam-muted hover:text-fam-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
      </div>

      {/* Caption (text) — only show above image/video, NOT for text-only posts */}
      {post.caption && (post.imageUrl || post.videoUrl) && (
        <div className="px-3 pb-2 text-sm text-black whitespace-pre-wrap break-words">
          {post.caption}
        </div>
      )}

      {/* Text-only post — shiny gradient background when no image/video */}
      {!post.imageUrl && !post.videoUrl && post.caption && (
        <div className="mx-3 mb-3 rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f97316 100%)', minHeight: '120px' }}>
          {/* Shiny overlay */}
          <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)', backgroundSize: '200% 200%', animation: 'shimmer 3s ease-in-out infinite' }} />
          <div className="relative z-10 flex items-center justify-center min-h-[80px]">
            <p className="text-white text-lg font-semibold whitespace-pre-wrap break-words text-center" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
              {post.caption}
            </p>
          </div>
        </div>
      )}

      {/* Image — tap to view full screen, double-tap to like */}
      {post.imageUrl && (
        <div className="relative bg-black" onClick={doubleTap}>
          <img
            src={post.imageUrl}
            alt={post.caption || 'Post'}
            className="w-full max-h-[500px] object-contain cursor-pointer"
            style={{ filter: filterCss(post.filter) }}
            onClick={(e) => { e.stopPropagation(); onView(post) }}
          />
          {showHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="white" className="drop-shadow-lg animate-ping">
                <path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Video — with poster/thumbnail preview */}
      {post.videoUrl && (
        <div className="bg-black relative">
          <video src={post.videoUrl} controls preload="metadata" poster={post.imageUrl || ''} className="w-full max-h-[500px]" />
          {!post.imageUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action bar — FB Lite style with counts */}
      <div className="p-3">
        {/* Counts row */}
        <div className="flex items-center justify-between mb-2 text-sm text-fam-muted">
          <span className="flex items-center gap-1">
            {likeCount > 0 && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#22c55e"><path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" /></svg>
                {likeCount.toLocaleString()}
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            {post._count.comments > 0 && <span>{post._count.comments} comments</span>}
            {post.viewCount > 0 && <span>{post.viewCount.toLocaleString()} views</span>}
          </div>
        </div>

        {/* Action buttons row — FB Lite style */}
        <div className="flex items-center gap-1 border-t border-fam-border pt-2">
          <button onClick={toggleLike} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-fam-surface text-sm font-semibold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? '#22c55e' : 'none'} stroke={liked ? '#22c55e' : 'currentColor'} strokeWidth="2">
              <path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" />
            </svg>
            <span className={liked ? 'text-[#22c55e]' : ''}>Like</span>
          </button>
          <button onClick={() => onView(post)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-fam-surface text-sm font-semibold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Comment
          </button>
          <button onClick={() => onView(post)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-fam-surface text-sm font-semibold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Share
          </button>
          <button onClick={toggleBookmark} className="flex items-center justify-center py-1.5 px-2 rounded-lg hover:bg-fam-surface">
            <svg width="18" height="18" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  )
}

// ============ DISCOVER VIEW ============
function DiscoverView({ me, onViewPost, onViewUser }: {
  me: SessionUser
  onViewPost: (p: Post) => void
  onViewUser: (u: string) => void
}) {
  const [data, setData] = useState<{ suggested: { id: string; username: string; displayName: string; avatarUrl: string; verified: boolean; verifiedType?: string; _count: { gotFollows: number } }[]; posts: Post[] } | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; username: string; displayName: string; avatarUrl: string; verified: boolean; verifiedType?: string; _count: { gotFollows: number } }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api('/api/discover').then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  useEffect(() => {
    const q = search.trim()
    if (!q) return
    const t = setTimeout(() => {
      api(`/api/discover?q=${encodeURIComponent(q)}`).then((d) => setSearchResults(d.users)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  if (error) return <CenterMsg msg={error} />
  if (!data) return <Loading />

  return (
    <div className="space-y-6 pb-4">
      {/* Search bar — premium */}
      <div className="px-4 md:px-0 pt-4">
        <div className="relative">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fam-muted pointer-events-none"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (!e.target.value.trim()) setSearchResults(null)
            }}
            placeholder="Search people..."
            className="w-full bg-fam-surface border border-fam-border rounded-xl pl-11 pr-4 py-3 text-sm text-fam-text placeholder:text-fam-muted focus:outline-none focus:border-fam-purple transition-colors"
          />
        </div>
      </div>

      {/* Search results — horizontal scroll cards */}
      {searchResults && (
        <div className="px-4 md:px-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-fam-text flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Search Results
            </h3>
            <span className="text-xs text-fam-muted">{searchResults.length} found</span>
          </div>
          {searchResults.length === 0 ? (
            <div className="bg-fam-surface rounded-xl p-8 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-fam-muted"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <p className="text-sm font-semibold text-fam-text">No users found</p>
              <p className="text-xs text-fam-muted mt-1">Try a different name or username</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {searchResults.map((u) => (
                <UserCard key={u.id} user={u} me={me} onViewUser={onViewUser} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* People you may know — horizontal scroll cards (like Facefam) */}
      {!search && data.suggested.length > 0 && (
        <div className="px-4 md:px-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-fam-text flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              People You May Know
            </h3>
            <span className="text-xs font-semibold text-fam-purple">{data.suggested.length} people</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {data.suggested.map((u) => (
              <UserCard key={u.id} user={u} me={me} onViewUser={onViewUser} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ USER CARD (Facefam-style horizontal scroll card) ============
function UserCard({ user, me, onViewUser }: {
  user: { id: string; username: string; displayName: string; avatarUrl: string; verified: boolean; verifiedType?: string; _count: { gotFollows: number } }
  me: SessionUser
  onViewUser: (u: string) => void
}) {
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(user._count.gotFollows)
  const [loading, setLoading] = useState(false)

  const toggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (user.id === me.id) return
    setLoading(true)
    const was = following
    setFollowing(!was)
    setFollowers((c) => c + (was ? -1 : 1))
    try {
      await api(`/api/users/${user.username}/follow`, { method: 'POST' })
    } catch {
      setFollowing(was)
      setFollowers((c) => c + (was ? 1 : -1))
    } finally {
      setLoading(false)
    }
  }

  const isMe = user.id === me.id

  return (
    <div
      onClick={() => onViewUser(user.username)}
      className="flex-shrink-0 w-36 rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: '#FFFFFF', border: '1px solid #E5E5EA', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
    >
      {/* Avatar — large circular at top */}
      <div className="pt-4 pb-2 flex justify-center">
        <div className="relative">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-20 h-20 rounded-full object-cover"
              style={{ border: '2px solid rgba(124,58,237,0.3)' }}
            />
          ) : (
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl ${waAvatarClass(user.username)}`}
              style={{ border: '2px solid rgba(124,58,237,0.3)' }}
            >
              {waInitial(user.displayName || user.username)}
            </div>
          )}
          {user.verified && (
            <div className="absolute -bottom-0.5 -right-0.5 bg-[#FFFFFF] rounded-full p-0.5">
              <VerifiedBadge type={user.verifiedType} size={16} />
            </div>
          )}
        </div>
      </div>

      {/* Name + username */}
      <div className="px-2 pb-3 text-center">
        <div className="text-sm font-bold text-black truncate">{user.displayName || user.username}</div>
        <div className="text-xs text-fam-muted truncate">@{user.username}</div>
        <div className="text-[10px] text-fam-muted/60 mt-0.5">{followers} followers</div>
      </div>

      {/* Follow button — full width green (like Facefam) */}
      <button
        onClick={toggleFollow}
        disabled={loading || isMe}
        className={`w-full py-2.5 text-xs font-bold transition-colors ${
          isMe ? 'bg-[#F5F5F7] text-[#8E8E93] cursor-default'
          : following ? 'bg-[#E5E5EA] text-[#8E8E93] hover:bg-[#D1D1D6]'
          : 'bg-[#22c55e] text-white hover:bg-[#16a34a]'
        }`}
      >
        {loading ? '...' : isMe ? 'You' : following ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

// ============ USER ROW (with follow button — for vertical lists) ============
function UserRow({ user, me, onViewUser }: {
  user: { id: string; username: string; displayName: string; avatarUrl: string; verified: boolean; verifiedType?: string; _count: { gotFollows: number } }
  me: SessionUser
  onViewUser: (u: string) => void
}) {
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(user._count.gotFollows)
  const [loading, setLoading] = useState(false)

  const toggleFollow = async () => {
    setLoading(true)
    const was = following
    setFollowing(!was)
    setFollowers((c) => c + (was ? -1 : 1))
    try {
      await api(`/api/users/${user.username}/follow`, { method: 'POST' })
    } catch {
      setFollowing(was)
      setFollowers((c) => c + (was ? 1 : -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 p-2 hover:bg-fam-surface rounded-xl">
      <Avatar src={user.avatarUrl} name={user.displayName} size={44} onClick={() => onViewUser(user.username)} />
      <div className="flex-1 min-w-0">
        <button onClick={() => onViewUser(user.username)} className="flex items-center gap-1 text-sm font-semibold hover:opacity-70">
          {user.username}
          {user.verified && <VerifiedBadge type={user.verifiedType} />}
        </button>
        <div className="text-xs text-fam-muted truncate">{user.displayName} · {followers} followers</div>
      </div>
      {user.id !== me.id && (
        <button
          onClick={toggleFollow}
          disabled={loading}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
            following ? 'bg-fam-surface border border-fam-border text-fam-text' : 'fam-gradient text-white'
          }`}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

// ============ CREATE VIEW ============
function CreateView({ me, onPosted, showToast }: { me: SessionUser; onPosted: () => void; showToast: (m: string) => void }) {
  const [caption, setCaption] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [location, setLocation] = useState('')
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postType, setPostType] = useState<'text' | 'photo' | 'video'>('text')
  const fileInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  const handlePhoto = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setImageUrl(d.url)
      setVideoUrl('')
      setPostType('photo')
      showToast('Photo attached ✓')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleVideo = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setVideoUrl(d.url)
      setImageUrl('')
      setPostType('video')
      showToast('Video attached ✓')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    if (!caption.trim() && !imageUrl && !videoUrl) return showToast('Add text, photo, or video first')
    setPosting(true)
    try {
      const r = await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ caption: caption.trim(), imageUrl, videoUrl, location: location.trim() }),
      })
      showToast('Posted! 🎉')
      setCaption(''); setImageUrl(''); setVideoUrl(''); setLocation(''); setPostType('text')
      onPosted()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold flex-1">Create post</h2>
      </div>

      {/* Compose card */}
      <div className="bg-[#F5F5F7] rounded-2xl p-4 mb-4">
        {/* Author row */}
        <div className="flex items-center gap-2.5 mb-3">
          {me.avatarUrl ? (
            <img src={me.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${waAvatarClass(me.username)}`}>
              {waInitial(me.displayName || me.username)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-1">
              {me.displayName || me.username}
              {me.verified && <VerifiedBadge type={me.verifiedType} size={14} />}
            </div>
            <div className="text-xs text-fam-muted">@{me.username}</div>
          </div>
        </div>

        {/* Caption textarea */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={`What's on your mind, ${me.displayName?.split(' ')[0] || me.username}?`}
          className="w-full bg-transparent border-none outline-none text-base text-fam-text placeholder:text-fam-muted resize-none mb-3"
          autoFocus
        />

        {/* Media preview */}
        {imageUrl && (
          <div className="relative mb-3 rounded-xl overflow-hidden">
            <img src={imageUrl} alt="" className="w-full max-h-80 object-contain bg-black" />
            <button
              onClick={() => { setImageUrl(''); setPostType('text') }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        {videoUrl && (
          <div className="relative mb-3 rounded-xl overflow-hidden">
            <video src={videoUrl} controls className="w-full max-h-80 bg-black" />
            <button
              onClick={() => { setVideoUrl(''); setPostType('text') }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        )}

        {/* Location input */}
        <div className="flex items-center gap-2 mb-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-muted">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location (optional)"
            className="flex-1 bg-transparent border-none outline-none text-sm text-fam-text placeholder:text-fam-muted"
          />
        </div>

        {/* Upload buttons row */}
        <div className="flex gap-2 border-t border-fam-border pt-3">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading || posting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#E5E5EA] text-fam-text text-sm font-semibold hover:bg-[#D1D1D6] disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            Photo
          </button>
          <button
            onClick={() => videoInput.current?.click()}
            disabled={uploading || posting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#E5E5EA] text-fam-text text-sm font-semibold hover:bg-[#D1D1D6] disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Video
          </button>
        </div>

        {uploading && <div className="text-center text-fam-muted text-xs mt-2">Uploading...</div>}

        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); e.target.value = '' }} />
        <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideo(f); e.target.value = '' }} />
      </div>

      {/* Post button */}
      <button
        onClick={submit}
        disabled={posting || uploading || (!caption.trim() && !imageUrl && !videoUrl)}
        className="w-full py-3 rounded-xl bg-[#22c55e] text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-[#16a34a]"
      >
        {posting ? <Spinner /> : 'Post'}
      </button>
    </div>
  )
}

// ============ PROFILE VIEW ============
function ProfileView({ username, me, onViewPost, onBack, onEditProfile, onOpenDM, onGift, onOpenWallet, onOpenSaved }: {
  username: string
  me: SessionUser
  onViewPost: (p: Post) => void
  onBack: () => void
  onEditProfile: () => void
  onOpenDM: (username: string) => void
  onGift: (user: Author) => void
  onOpenWallet: () => void
  onOpenSaved: () => void
}) {
  const [data, setData] = useState<{ user: SessionUser & { isFollowing: boolean; isMe: boolean; verifiedType?: string }; posts: { id: string; imageUrl: string; caption: string; createdAt: string; _count: { likes: number; comments: number } }[]; bannedProfile?: { reason: string; permanent: boolean; until: string | null; bannedAt: string | null } | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [profileTab, setProfileTab] = useState<'posts' | 'media' | 'info'>('posts')

  const load = useCallback(() => {
    api(`/api/users/${username}`).then((d) => {
      setData(d)
      setFollowing(d.user.isFollowing)
      setFollowers(d.user._count?.gotFollows || 0)
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
  }, [username])

  useEffect(() => { load() }, [load])

  const toggleFollow = async () => {
    const was = following
    setFollowing(!was)
    setFollowers((c) => c + (was ? -1 : 1))
    try {
      await api(`/api/users/${username}/follow`, { method: 'POST' })
    } catch {
      setFollowing(was)
      setFollowers((c) => c + (was ? 1 : -1))
    }
  }

  if (error) return <CenterMsg msg={error} action="Back" onAction={onBack} />
  if (!data) return <Loading />

  const u = data.user
  // Cover image: use coverUrl if set, else use avatar as faded bg, else gradient
  const coverGradient = 'linear-gradient(135deg, #1a1f2e 0%, #2d1b4e 50%, #1a1f2e 100%)'
  const coverSrc = (u as { coverUrl?: string }).coverUrl || u.avatarUrl
  const coverIsUserCover = !!(u as { coverUrl?: string }).coverUrl

  const handleCoverUpload = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      // Save coverUrl to user profile
      await api('/api/me/profile', { method: 'PATCH', body: JSON.stringify({ coverUrl: d.url }) })
      // Update local state
      setData((prev) => prev ? { ...prev, user: { ...prev.user, coverUrl: d.url } as typeof prev.user } : prev)
    } catch (e: unknown) {
      // ignore
    }
  }

  return (
    <div className="pb-8 bg-[#FFFFFF] min-h-screen">
      {/* Back button (mobile) */}
      <button onClick={onBack} className="md:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-full glass border border-fam-border flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
      </button>

      {/* Banned banner (if applicable) */}
      {data.bannedProfile && (
        <BannedProfileBanner banInfo={data.bannedProfile} />
      )}

      {/* Cover image — full width */}
      <div className="relative h-40 md:h-56 w-full overflow-hidden group" style={{ background: coverGradient }}>
        {coverSrc && (
          <img src={coverSrc} alt="" className={`w-full h-full object-cover ${coverIsUserCover ? '' : 'opacity-30'}`} />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0d] via-transparent to-transparent" />
        {/* Upload cover button — only for own profile */}
        {u.isMe && (
          <label className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-semibold cursor-pointer hover:bg-black/90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
            </svg>
            {coverIsUserCover ? 'Change cover' : 'Upload cover'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = '' }}
            />
          </label>
        )}
      </div>

      {/* Profile info section — avatar overlaps cover */}
      <div className="relative px-4 md:px-6 -mt-16 md:-mt-20">
        {/* Avatar + action buttons row */}
        <div className="flex items-end justify-between mb-3">
          {/* Avatar (circular, overlapping cover) */}
          {u.avatarUrl ? (
            <img
              src={u.avatarUrl}
              alt={u.displayName}
              className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-[#FFFFFF] flex-shrink-0"
            />
          ) : (
            <div className={`w-28 h-28 md:w-32 md:h-32 rounded-full flex items-center justify-center text-white text-4xl font-bold border-4 border-[#FFFFFF] flex-shrink-0 ${waAvatarClass(u.username)}`}>
              {waInitial(u.displayName || u.username)}
            </div>
          )}

          {/* Action buttons (right-aligned, same row as avatar) */}
          <div className="flex gap-2 flex-wrap justify-end pb-2">
            {u.isMe ? (
              <>
                <button onClick={onEditProfile} className="px-4 py-2 rounded-lg bg-[#F5F5F7] border border-fam-border text-sm font-semibold hover:bg-[#E5E5EA] text-black">
                  Edit profile
                </button>
                <button onClick={onOpenWallet} className="px-3 py-2 rounded-lg bg-[#F5F5F7] border border-fam-border text-sm font-semibold hover:bg-[#E5E5EA] text-black flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                  <span className="hidden sm:inline">Wallet</span>
                </button>
                <button onClick={onOpenSaved} className="px-3 py-2 rounded-lg bg-[#F5F5F7] border border-fam-border text-sm font-semibold hover:bg-[#E5E5EA] text-black flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                  <span className="hidden sm:inline">Saved</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleFollow}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    following
                      ? 'bg-[#F5F5F7] border border-fam-border text-black'
                      : 'bg-[#22c55e] text-white hover:bg-[#16a34a]'
                  }`}
                >
                  {following ? 'Following' : 'Follow'}
                </button>
                <button onClick={() => onOpenDM(u.username)} className="px-3 py-2 rounded-lg bg-[#F5F5F7] border border-fam-border text-sm font-semibold hover:bg-[#E5E5EA] text-black flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                  <span className="hidden sm:inline">Message</span>
                </button>
                <button onClick={() => onGift({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified })} className="px-3 py-2 rounded-lg bg-[#22c55e] text-white text-sm font-semibold hover:bg-[#16a34a] flex items-center gap-1.5">
                  🎁 <span className="hidden sm:inline">Gift</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Username + verification badge */}
        <div className="flex items-center gap-2 mb-0.5">
          <h1 className="text-xl font-bold text-black">{u.displayName || u.username}</h1>
          {u.verified && <VerifiedBadge type={u.verifiedType} size={20} />}
        </div>

        {/* Handle */}
        <div className="text-sm text-fam-muted mb-2">@{u.username}</div>

        {/* Metadata: joined date + location */}
        <div className="flex items-center gap-4 text-xs text-fam-muted mb-3">
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Joined {new Date(u.createdAt || Date.now()).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
          </span>
        </div>

        {/* Stats — 3 columns */}
        <div className="flex gap-8 mb-3">
          <div>
            <div className="text-lg font-bold text-black">{u._count?.posts || 0}</div>
            <div className="text-xs text-fam-muted uppercase tracking-wider">Posts</div>
          </div>
          <div>
            <div className="text-lg font-bold text-black">{u._count?.sentFollows || 0}</div>
            <div className="text-xs text-fam-muted uppercase tracking-wider">Following</div>
          </div>
          <div>
            <div className="text-lg font-bold text-black">{followers}</div>
            <div className="text-xs text-fam-muted uppercase tracking-wider">Followers</div>
          </div>
        </div>

        {/* Bio */}
        {u.bio && (
          <p className="text-sm text-fam-text whitespace-pre-wrap mb-3 max-w-lg">{u.bio}</p>
        )}

        {/* Private profile notice */}
        {data.privateProfile && (
          <div className="mt-2 p-4 bg-[#F5F5F7] rounded-xl text-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-fam-muted"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <p className="text-sm font-semibold text-black">This account is private</p>
            <p className="text-xs text-fam-muted mt-1">Follow to see their posts and details.</p>
          </div>
        )}

        {/* Support buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {!u.verified && u.isMe && (
            <button
              onClick={() => onOpenDM('xtech')}
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-semibold flex items-center gap-1.5"
            >
              <VerifiedBadge type="blue" size={14} /> Get Verified
            </button>
          )}
          {u.whatsappNumber && (
            <a
              href={`https://wa.me/${u.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-xs font-semibold flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5 4.5.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.2-.3-.2-.6-.4z" /></svg>
              WhatsApp
            </a>
          )}
          {u.email && (
            <a
              href={`mailto:${u.email}`}
              className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] text-fam-muted text-xs font-semibold flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
              Email
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-t border-fam-border px-4 md:px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setProfileTab('posts')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              profileTab === 'posts' ? 'border-[#22c55e] text-black' : 'border-transparent text-fam-muted hover:text-fam-text'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
            Posts
          </button>
          <button
            onClick={() => setProfileTab('media')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              profileTab === 'media' ? 'border-[#22c55e] text-black' : 'border-transparent text-fam-muted hover:text-fam-text'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            Media
          </button>
          <button
            onClick={() => setProfileTab('info')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              profileTab === 'info' ? 'border-[#22c55e] text-black' : 'border-transparent text-fam-muted hover:text-fam-text'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            Info
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 md:px-6 pt-3">
        {profileTab === 'posts' && (
          <>
            {data.posts.length === 0 ? (
              <CenterMsg
                msg={u.isMe ? "You haven't posted yet" : "No posts yet"}
                sub={u.isMe ? 'Tap the + button to create your first post' : undefined}
              />
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {data.posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onViewPost({
                      id: p.id,
                      imageUrl: p.imageUrl,
                      caption: p.caption,
                      location: '',
                      filter: 'none',
                      createdAt: p.createdAt,
                      author: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, verified: u.verified },
                      liked: false,
                      bookmarked: false,
                      _count: p._count,
                    })}
                    className="aspect-square relative group overflow-hidden rounded-sm"
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:opacity-80" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 text-center" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f97316 100%)' }}>
                        <p className="text-white text-xs font-semibold line-clamp-4 overflow-hidden" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{p.caption}</p>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white font-semibold flex items-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" /></svg>
                        {p._count.likes}
                      </span>
                      <span className="text-white font-semibold flex items-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        {p._count.comments}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {profileTab === 'media' && (
          <>
            {data.posts.length === 0 ? (
              <CenterMsg msg="No media yet" />
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {data.posts.map((p) => (
                  <div key={p.id} className="aspect-square overflow-hidden rounded-sm">
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {profileTab === 'info' && (
          <div className="space-y-3 pt-2 max-w-lg">
            <div className="bg-[#F5F5F7] rounded-xl p-4">
              <h3 className="text-xs font-semibold text-fam-muted uppercase tracking-wider mb-2">About</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="text-fam-muted">Username:</dt>
                  <dd className="text-black font-semibold">@{u.username}</dd>
                </div>
                {u.displayName && (
                  <div className="flex items-center gap-2">
                    <dt className="text-fam-muted">Display name:</dt>
                    <dd className="text-black font-semibold">{u.displayName}</dd>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <dt className="text-fam-muted">Joined:</dt>
                  <dd className="text-black font-semibold">{new Date(u.createdAt || Date.now()).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</dd>
                </div>
                {u.verified && (
                  <div className="flex items-center gap-2">
                    <dt className="text-fam-muted">Verified:</dt>
                    <dd className="flex items-center gap-1">
                      <VerifiedBadge type={u.verifiedType} size={16} />
                      <span className="text-black font-semibold capitalize">{u.verifiedType} badge</span>
                    </dd>
                  </div>
                )}
                {u.bio && (
                  <div>
                    <dt className="text-fam-muted mb-1">Bio:</dt>
                    <dd className="text-black whitespace-pre-wrap">{u.bio}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ POST DETAIL VIEW ============
function PostDetailView({ post, me, onBack, onViewUser, showToast }: {
  post: Post
  me: SessionUser
  onBack: () => void
  onViewUser: (u: string) => void
  showToast: (m: string) => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(true)
  const [posting, setPosting] = useState(false)
  const [liked, setLiked] = useState(post.liked)
  const [likeCount, setLikeCount] = useState(post._count.likes)
  const [viewCount, setViewCount] = useState(post.viewCount || 0)
  const [bookmarked, setBookmarked] = useState(post.bookmarked)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [showComments, setShowComments] = useState(false)

  const loadComments = useCallback(() => {
    api(`/api/posts/${post.id}/comment`).then((d) => setComments(d.comments)).catch(() => {}).finally(() => setLoadingComments(false))
    api('/api/posts', { method: 'PATCH', body: JSON.stringify({ postId: post.id }) }).then((d) => setViewCount(d.viewCount)).catch(() => {})
  }, [post.id])

  const sendComment = async () => {
    if (!commentText.trim() || posting) return
    const text = commentText.trim()
    setCommentText('')
    setPosting(true)
    // Optimistic
    const temp: Comment = { id: 'temp-' + Date.now(), text, createdAt: new Date().toISOString(), author: { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl, verified: me.verified } }
    setComments((c) => [...c, temp])
    try {
      const d = await api(`/api/posts/${post.id}/comment`, { method: 'POST', body: JSON.stringify({ text }) })
      setComments((c) => c.map((x) => x.id === temp.id ? d.comment : x))
    } catch {
      setComments((c) => c.filter((x) => x.id !== temp.id))
      setCommentText(text)
    } finally {
      setPosting(false)
    }
  }

  const toggleLike = async () => {
    const was = liked
    setLiked(!was)
    setLikeCount((c) => c + (was ? -1 : 1))
    try { await api(`/api/posts/${post.id}/like`, { method: 'POST' }) } catch { setLiked(was); setLikeCount((c) => c + (was ? 1 : -1)) }
  }

  const toggleBookmark = async () => {
    const was = bookmarked
    setBookmarked(!was)
    try { await api(`/api/posts/${post.id}/bookmark`, { method: 'POST' }) } catch { setBookmarked(was) }
  }

  const downloadPhoto = async () => {
    try {
      const response = await fetch(post.imageUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vibefam-${post.id}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Photo downloaded ✓')
    } catch {
      showToast('Download failed')
    }
  }

  useEffect(() => { loadComments() }, [loadComments])

  return (
    <div className="fixed inset-0 z-40 bg-[#FFFFFF] flex flex-col">
      {/* Top bar — back + download + menu */}
      <div className="flex items-center justify-between p-3 bg-black border-b border-fam-border">
        <button onClick={onBack} className="p-2 text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-white">Post</span>
        </div>
        <div className="flex items-center gap-1">
          {post.imageUrl && (
            <button onClick={downloadPhoto} className="p-2 text-white hover:bg-white/10 rounded-full" title="Download">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          <button onClick={() => showToast('More options coming soon')} className="p-2 text-white hover:bg-white/10 rounded-full">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Author header */}
        <div className="flex items-center gap-2.5 p-3">
          {post.author.avatarUrl ? (
            <img src={post.author.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${waAvatarClass(post.author.username)}`}>
              {waInitial(post.author.displayName || post.author.username)}
            </div>
          )}
          <div className="flex-1">
            <button onClick={() => onViewUser(post.author.username)} className="flex items-center gap-1 text-sm font-semibold hover:opacity-70">
              <span>{post.author.displayName || post.author.username}</span>
              {post.author.verified && <VerifiedBadge type={post.author.verifiedType} size={14} />}
            </button>
            <div className="text-xs text-fam-muted">{timeAgo(post.createdAt)}{post.location ? ` · ${post.location}` : ''}</div>
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="px-3 pb-3 text-sm text-fam-text whitespace-pre-wrap break-words">
            {post.caption}
          </div>
        )}

        {/* Image — tap to open full-screen viewer */}
        {post.imageUrl && (
          <div className="bg-black" onClick={() => setShowPhotoViewer(true)}>
            <img src={post.imageUrl} alt={post.caption} className="w-full max-h-[600px] object-contain cursor-pointer" style={{ filter: filterCss(post.filter) }} />
          </div>
        )}

        {/* Video — with poster/thumbnail */}
        {post.videoUrl && (
          <div className="bg-black relative">
            <video src={post.videoUrl} controls preload="metadata" poster={post.imageUrl || ''} className="w-full max-h-[600px]" />
            {!post.imageUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Counts */}
        <div className="flex items-center justify-between px-3 py-2 text-sm text-fam-muted border-b border-fam-border">
          <span className="flex items-center gap-1">
            {likeCount > 0 && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#22c55e"><path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" /></svg>
                {likeCount.toLocaleString()}
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            <span>{comments.length} comments</span>
            {viewCount > 0 && <span>{viewCount.toLocaleString()} views</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-fam-border">
          <button onClick={toggleLike} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-fam-surface text-sm font-semibold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? '#22c55e' : 'none'} stroke={liked ? '#22c55e' : 'currentColor'} strokeWidth="2">
              <path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" />
            </svg>
            <span className={liked ? 'text-[#22c55e]' : ''}>Like</span>
          </button>
          <button onClick={() => setShowComments(true)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-fam-surface text-sm font-semibold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Comment
          </button>
          <button onClick={toggleBookmark} className="flex items-center justify-center py-1.5 px-2 rounded-lg hover:bg-fam-surface">
            <svg width="18" height="18" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        {/* Comments preview (first 3) */}
        <div className="p-3">
          {loadingComments ? (
            <div className="text-center text-fam-muted text-sm py-2">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="text-center text-fam-muted text-sm py-2">No comments yet. Be the first!</div>
          ) : (
            <>
              {comments.slice(0, 3).map((c) => (
                <div key={c.id} className="flex gap-2 mb-2">
                  {c.author.avatarUrl ? (
                    <img src={c.author.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${waAvatarClass(c.author.username)}`}>
                      {waInitial(c.author.displayName || c.author.username)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="bg-fam-surface rounded-2xl px-3 py-2">
                      <button onClick={() => onViewUser(c.author.username)} className="text-xs font-semibold flex items-center gap-1 hover:opacity-70">
                        <span>{c.author.displayName || c.author.username}</span>
                        {c.author.verified && <VerifiedBadge type={c.author.verifiedType} size={12} />}
                      </button>
                      <div className="text-sm text-fam-text">{c.text}</div>
                    </div>
                    <div className="text-xs text-fam-muted mt-0.5 ml-3">{timeAgo(c.createdAt)}</div>
                  </div>
                </div>
              ))}
              {comments.length > 3 && (
                <button onClick={() => setShowComments(true)} className="text-fam-muted text-sm hover:opacity-70 mt-1">
                  View all {comments.length} comments →
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Comment input bar — fixed at bottom */}
      <div className="p-3 bg-[#FFFFFF] border-t border-fam-border flex items-center gap-2">
        {me.avatarUrl ? (
          <img src={me.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${waAvatarClass(me.username)}`}>
            {waInitial(me.displayName || me.username)}
          </div>
        )}
        <input
          type="text"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && commentText.trim()) sendComment() }}
          placeholder="Write a comment..."
          className="flex-1 bg-fam-surface border border-fam-border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-fam-purple"
        />
        <button
          onClick={sendComment}
          disabled={!commentText.trim() || posting}
          className="p-2 text-fam-purple disabled:opacity-30"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>

      {/* Full-screen photo viewer */}
      {showPhotoViewer && post.imageUrl && (
        <FullScreenPhotoViewer imageUrl={post.imageUrl} onClose={() => setShowPhotoViewer(false)} onDownload={downloadPhoto} showToast={showToast} />
      )}

      {/* Full-screen comments view */}
      {showComments && (
        <FullCommentsView
          post={post}
          me={me}
          comments={comments}
          commentText={commentText}
          setCommentText={setCommentText}
          onSend={sendComment}
          onBack={() => setShowComments(false)}
          onViewUser={onViewUser}
          loading={loadingComments}
          posting={posting}
        />
      )}
    </div>
  )
}

// ============ Full-screen photo viewer (FB Lite style) ============
function FullScreenPhotoViewer({ imageUrl, onClose, onDownload, showToast }: {
  imageUrl: string
  onClose: () => void
  onDownload: () => void
  showToast: (m: string) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 bg-black">
        <button onClick={onClose} className="p-2 text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
      </div>

      {/* Photo — centered, full screen */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <img src={imageUrl} alt="" className="max-w-full max-h-full object-contain" />
      </div>

      {/* Action menu (FB Lite style — Save / Hide / Report) */}
      {showMenu && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#FFFFFF] rounded-t-2xl p-2 animate-fade-in">
          <button onClick={() => { onDownload(); setShowMenu(false) }} className="flex items-center gap-3 p-3 hover:bg-fam-surface rounded-lg w-full text-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-text">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="text-fam-text text-sm font-semibold">Save photo</span>
          </button>
          <button onClick={() => { showToast('Hidden'); setShowMenu(false); onClose() }} className="flex items-center gap-3 p-3 hover:bg-fam-surface rounded-lg w-full text-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-text">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span className="text-fam-text text-sm font-semibold">I don't want to see this</span>
          </button>
          <button onClick={() => { showToast('Report submitted'); setShowMenu(false); onClose() }} className="flex items-center gap-3 p-3 hover:bg-fam-surface rounded-lg w-full text-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-400">
              <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
            </svg>
            <span className="text-rose-400 text-sm font-semibold">Find support or report photo</span>
          </button>
          <button onClick={() => setShowMenu(false)} className="flex items-center gap-3 p-3 hover:bg-fam-surface rounded-lg w-full text-left">
            <span className="text-fam-muted text-sm font-semibold w-full text-center">Cancel</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ============ Full-screen comments view (FB Lite style) ============
function FullCommentsView({ post, me, comments, commentText, setCommentText, onSend, onBack, onViewUser, loading, posting }: {
  post: Post
  me: SessionUser
  comments: Comment[]
  commentText: string
  setCommentText: (s: string) => void
  onSend: () => void
  onBack: () => void
  onViewUser: (u: string) => void
  loading: boolean
  posting: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  return (
    <div className="fixed inset-0 z-[60] bg-[#FFFFFF] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-fam-border bg-[#FFFFFF]">
        <button onClick={onBack} className="p-1 text-fam-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1">
          <div className="font-semibold text-sm">Comments</div>
          <div className="text-xs text-fam-muted">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</div>
        </div>
      </div>

      {/* Sort selector */}
      <div className="px-3 py-2 text-xs text-fam-muted border-b border-fam-border bg-[#FFFFFF]">
        Most relevant
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="text-center text-fam-muted text-sm py-8">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">💬</div>
            <div className="text-fam-text font-semibold text-sm">No comments yet</div>
            <div className="text-fam-muted text-xs mt-1">Start the conversation.</div>
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              {c.author.avatarUrl ? (
                <img src={c.author.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${waAvatarClass(c.author.username)}`}>
                  {waInitial(c.author.displayName || c.author.username)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="bg-[#F5F5F7] rounded-2xl px-3 py-2 inline-block">
                  <button onClick={() => onViewUser(c.author.username)} className="text-xs font-semibold flex items-center gap-1 hover:opacity-70 mb-0.5">
                    <span>{c.author.displayName || c.author.username}</span>
                    {c.author.verified && <VerifiedBadge type={c.author.verifiedType} size={12} />}
                  </button>
                  <div className="text-sm text-fam-text break-words">{c.text}</div>
                </div>
                <div className="flex items-center gap-3 text-xs text-fam-muted mt-1 ml-3">
                  <span>{timeAgo(c.createdAt)}</span>
                  <button className="font-semibold hover:text-fam-text">Like</button>
                  <button className="font-semibold hover:text-fam-text">Reply</button>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Comment input bar — fixed at bottom */}
      <div className="p-3 bg-[#FFFFFF] border-t border-fam-border flex items-center gap-2">
        {me.avatarUrl ? (
          <img src={me.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${waAvatarClass(me.username)}`}>
            {waInitial(me.displayName || me.username)}
          </div>
        )}
        <div className="flex-1 flex items-center bg-fam-surface border border-fam-border rounded-full px-4 py-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && commentText.trim()) onSend() }}
            placeholder="Write a comment..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-fam-text placeholder:text-fam-muted"
            autoFocus
          />
          <button className="ml-2 text-fam-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </button>
        </div>
        <button
          onClick={onSend}
          disabled={!commentText.trim() || posting}
          className="p-2 text-[#22c55e] disabled:opacity-30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>
    </div>
  )
}

// ============ STORY VIEW ============
function StoryView({ group, onClose, onViewUser, me }: {
  group: StoryGroup
  onClose: () => void
  onViewUser: (u: string) => void
  me: SessionUser
}) {
  const [idx, setIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<{ id: string; text: string; author: Author; createdAt: string }[]>([])
  const [commentText, setCommentText] = useState('')
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const items = group.items
  const current = items[idx]
  const isOwner = group.isMine

  const next = () => {
    if (idx < items.length - 1) { setIdx(idx + 1); setProgress(0) }
    else { onClose() }
  }
  const prev = () => {
    if (idx > 0) { setIdx(idx - 1); setProgress(0) }
  }

  useEffect(() => {
    if (paused) return
    timerRef.current = setInterval(() => {
      setProgress((p) => { if (p >= 100) { next(); return 0 } return p + 2 })
    }, 100)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [idx, paused])

  useEffect(() => {
    if (current) {
      api(`/api/stories/${current.id}/comments`).then((d) => setComments(d.comments)).catch(() => {})
    }
  }, [current?.id])

  // Pause story when menu or delete confirm is open
  useEffect(() => {
    if (menuOpen || deleteConfirm) setPaused(true)
  }, [menuOpen, deleteConfirm])

  const sendComment = async () => {
    if (!commentText.trim() || !current) return
    const text = commentText.trim()
    setCommentText('')
    try {
      const d = await api(`/api/stories/${current.id}/comments`, { method: 'POST', body: JSON.stringify({ text }) })
      setComments((c) => [...c, d.comment])
    } catch {}
  }

  const handleDelete = async () => {
    if (!current) return
    setDeleting(true)
    try {
      await api(`/api/stories/${current.id}`, { method: 'DELETE' })
      // Move to next story or close
      if (items.length > 1) {
        // Remove this item from local state by advancing
        if (idx < items.length - 1) { setIdx(idx + 1); setProgress(0) }
        else { onClose() }
      } else {
        onClose()
      }
    } catch (e: unknown) {
      // Still close — story may already be gone
      onClose()
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
      setMenuOpen(false)
    }
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) next() }}>
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3 pt-4">
        {items.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }} />
          </div>
        ))}
      </div>
      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-20 flex items-center gap-3 p-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={onClose} className="text-white p-1">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        {group.author.avatarUrl ? (
          <img src={group.author.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${waAvatarClass(group.author.username)}`}>
            {waInitial(group.author.displayName || group.author.username)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={() => { onViewUser(group.author.username); onClose() }} className="flex items-center gap-1 text-sm font-semibold text-white hover:opacity-80">
            <span>{group.author.displayName || group.author.username}</span>
            {group.author.verified && <VerifiedBadge type={group.author.verifiedType} size={14} />}
          </button>
          <div className="text-xs text-white/60">{waTime(current.createdAt)}</div>
        </div>
        <button onClick={() => setPaused(!paused)} className="text-white/70 p-2">
          {paused ? <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>}
        </button>
        <button onClick={() => setShowComments(!showComments)} className="text-white/70 p-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        </button>
        {/* 3-dot menu — only for story owner */}
        {isOwner && (
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-white/70 p-2 hover:text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-[#FFFFFF] border border-white/10 rounded-xl overflow-hidden shadow-2xl min-w-[160px]">
                  <button
                    onClick={() => { setMenuOpen(false); setDeleteConfirm(true) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors text-left"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    Delete story
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {/* Story image */}
      <div className="flex-1 relative" onDoubleClick={next}>
        <img src={current.imageUrl} alt="Story" className="w-full h-full object-cover" style={{ filter: filterCss(current.filter) }} />
        {current.musicTitle && (
          <StoryMusicSticker title={current.musicTitle} artist={current.musicArtist || ''} previewUrl={current.musicPreviewUrl || ''} artworkUrl={current.musicArtworkUrl || ''} />
        )}
        {current.caption && (
          <div className="absolute bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <p className="text-white text-center font-semibold text-lg">{current.caption}</p>
          </div>
        )}
      </div>
      {/* Tap zones */}
      <button onClick={(e) => { e.stopPropagation(); prev() }} className="absolute left-0 top-0 bottom-0 w-1/3 z-10" />
      <button onClick={(e) => { e.stopPropagation(); next() }} className="absolute right-0 top-0 bottom-0 w-1/3 z-10" />
      {/* Bottom bar */}
      <div className="relative z-20 p-4 bg-gradient-to-t from-black/80 to-transparent">
        {showComments && (
          <div className="bg-black/60 rounded-2xl p-3 mb-3 max-h-48 overflow-y-auto">
            {comments.length === 0 ? <p className="text-white/40 text-xs text-center py-2">No comments yet</p> : comments.map((c) => (
              <div key={c.id} className="flex gap-2 mb-2">
                {c.author.avatarUrl ? <img src={c.author.avatarUrl} alt="" className="w-6 h-6 rounded-full" /> : <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${waAvatarClass(c.author.username)}`}>{waInitial(c.author.displayName || c.author.username)}</div>}
                <div className="flex-1"><span className="text-white/80 text-xs font-semibold">{c.author.displayName || c.author.username}</span><span className="text-white/70 text-xs ml-1">{c.text}</span></div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-white/10 border border-white/20 rounded-full px-4 py-2.5">
            <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendComment() }} placeholder="Send message..." className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/40" />
          </div>
          <button className="text-white/60 hover:text-red-400 transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-4.5-7-10.5C5 7.5 7.5 5 10.5 5c1.5 0 3 .75 3 2 0-1.25 1.5-2 3-2 3 0 5.5 2.5 5.5 5.5 0 6-7 10.5-7 10.5z" /></svg>
          </button>
          <button onClick={sendComment} disabled={!commentText.trim()} className="text-white/60 hover:text-white disabled:opacity-30 transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => !deleting && setDeleteConfirm(false)}>
          <div className="bg-[#FFFFFF] border border-white/10 rounded-2xl p-6 max-w-[320px] w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Delete story?</h3>
            <p className="text-white/50 text-sm mb-6">This story will be permanently removed. This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/15 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateStoryView({ me, onPosted, showToast, onBack }: { me: SessionUser; onPosted: () => void; showToast: (m: string) => void; onBack: () => void }) {
  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [filter, setFilter] = useState('none')
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [musicSearch, setMusicSearch] = useState('')
  const [musicResults, setMusicResults] = useState<{trackName: string; artistName: string; previewUrl: string; artworkUrl: string}[]>([])
  const [selectedMusic, setSelectedMusic] = useState<{title: string; artist: string; previewUrl: string; artworkUrl: string} | null>(null)
  const [searchingMusic, setSearchingMusic] = useState(false)
  const [createMode, setCreateMode] = useState<'camera' | 'text' | 'music'>('camera')
  const [musicTab, setMusicTab] = useState<'bongo' | 'trending' | 'search'>('bongo')
  const [loadingItunes, setLoadingItunes] = useState<string | null>(null) // song id being fetched from itunes
  const fileInput = useRef<HTMLInputElement>(null)

  // Curated Bongo Flava + 2026 hits — Tanzania/East Africa's hottest tracks
  // Each item: { id, title, artist, category } — preview+artwork fetched from iTunes on tap
  const CURATED_SONGS: { id: string; title: string; artist: string; category: 'bongo' | 'trending' }[] = [
    // === Bongo Flava (Tanzanian) ===
    { id: 'b1', title: 'Number 1', artist: 'Diamond Platnumz', category: 'bongo' },
    { id: 'b2', title: 'Mountains', artist: 'Diamond Platnumz', category: 'bongo' },
    { id: 'b3', title: 'Yatapita', artist: 'Diamond Platnumz', category: 'bongo' },
    { id: 'b4', title: 'Single Again', artist: 'Diamond Platnumz', category: 'bongo' },
    { id: 'b5', title: 'Mtaalamu', artist: 'Harmonize', category: 'bongo' },
    { id: 'b6', title: 'Single', artist: 'Harmonize', category: 'bongo' },
    { id: 'b7', title: 'Ushamba', artist: 'Harmonize', category: 'bongo' },
    { id: 'b8', title: 'Sukari', artist: 'Zuchu', category: 'bongo' },
    { id: 'b9', title: 'Kwikwi', artist: 'Zuchu', category: 'bongo' },
    { id: 'b10', title: 'Raha', artist: 'Zuchu', category: 'bongo' },
    { id: 'b11', title: 'Nimependa', artist: 'Marioo', category: 'bongo' },
    { id: 'b12', title: 'Naogopa', artist: 'Marioo', category: 'bongo' },
    { id: 'b13', title: 'Nani', artist: 'Mbosso', category: 'bongo' },
    { id: 'b14', title: 'Tambura', artist: 'Mbosso', category: 'bongo' },
    { id: 'b15', title: 'Nawaza', artist: 'Mbosso', category: 'bongo' },
    { id: 'b16', title: 'Niteke', artist: 'Rayvanny', category: 'bongo' },
    { id: 'b17', title: 'Mwanza', artist: 'Diamond Platnumz', category: 'bongo' },
    { id: 'b18', title: 'Yuda', artist: 'Alikiba', category: 'bongo' },
    { id: 'b19', title: 'Mahaba', artist: 'Nandy', category: 'bongo' },
    { id: 'b20', title: 'Sugua', artist: 'Nandy', category: 'bongo' },
    { id: 'b21', title: 'Simuachi', artist: 'Jux', category: 'bongo' },
    { id: 'b22', title: 'Ololufe', artist: 'Jux', category: 'bongo' },
    { id: 'b23', title: 'Amaboko', artist: 'Jay Melody', category: 'bongo' },
    { id: 'b24', title: 'Nakumbuka', artist: 'Jay Melody', category: 'bongo' },
    { id: 'b25', title: 'Toto', artist: 'Bin Karmo', category: 'bongo' },
    { id: 'b26', title: 'Nakupenda', artist: 'Masauti', category: 'bongo' },
    { id: 'b27', title: 'Lemme', artist: 'Whozu', category: 'bongo' },
    { id: 'b28', title: 'Nakombolewa', artist: 'Saraphina', category: 'bongo' },
    // === 2026 trending / fresh hits ===
    { id: 't1', title: '2026', artist: 'Diamond Platnumz', category: 'trending' },
    { id: 't2', title: 'New Year', artist: 'Harmonize', category: 'trending' },
    { id: 't3', title: 'Back Again', artist: 'Zuchu', category: 'trending' },
    { id: 't4', title: 'Wangu', artist: 'Marioo', category: 'trending' },
    { id: 't5', title: 'Move', artist: 'Rayvanny', category: 'trending' },
    { id: 't6', title: 'Pressure', artist: 'Mbosso', category: 'trending' },
    { id: 't7', title: 'Ego', artist: 'Alikiba', category: 'trending' },
    { id: 't8', title: 'Higher', artist: 'Nandy', category: 'trending' },
    { id: 't9', title: 'Level Up', artist: 'Jux', category: 'trending' },
    { id: 't10', title: 'Vision', artist: 'Jay Melody', category: 'trending' },
    { id: 't11', title: 'Pressure', artist: 'Whozu', category: 'trending' },
    { id: 't12', title: 'One', artist: 'Saraphina', category: 'trending' },
    { id: 't13', title: 'Wet', artist: 'Bin Karmo', category: 'trending' },
    { id: 't14', title: 'Love', artist: 'Otile Brown', category: 'trending' },
    { id: 't15', title: 'Soft', artist: 'Khaligraph Jones', category: 'trending' },
    { id: 't16', title: 'Run', artist: 'Bien', category: 'trending' },
  ]

  const searchMusic = async (query: string) => {
    if (!query.trim()) { setMusicResults([]); return }
    setSearchingMusic(true)
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12&media=music&country=tz`)
      const data = await res.json()
      setMusicResults((data.results || []).map((r: { trackName: string; artistName: string; previewUrl: string; artworkUrl100: string }) => ({ trackName: r.trackName, artistName: r.artistName, previewUrl: r.previewUrl, artworkUrl: r.artworkUrl100 })))
    } catch { setMusicResults([]) } finally { setSearchingMusic(false) }
  }

  // Fetch preview URL + artwork from iTunes for a curated song
  const fetchFromItunes = async (song: { id: string; title: string; artist: string }) => {
    setLoadingItunes(song.id)
    try {
      const query = `${song.title} ${song.artist}`
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1&media=music`)
      const data = await res.json()
      if (data.results && data.results[0]) {
        const r = data.results[0]
        setSelectedMusic({
          title: song.title,
          artist: song.artist,
          previewUrl: r.previewUrl || '',
          artworkUrl: r.artworkUrl100 || '',
        })
      } else {
        // No iTunes match — use the song as-is with no preview
        setSelectedMusic({
          title: song.title,
          artist: song.artist,
          previewUrl: '',
          artworkUrl: '',
        })
      }
    } catch {
      setSelectedMusic({
        title: song.title,
        artist: song.artist,
        previewUrl: '',
        artworkUrl: '',
      })
    } finally {
      setLoadingItunes(null)
    }
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setImageUrl(d.url)
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Upload failed') } finally { setUploading(false) }
  }

  const submit = async () => {
    // Text mode doesn't need an image
    if (createMode === 'text' && !caption.trim()) return showToast('Please type something')
    setPosting(true)
    try {
      await api('/api/stories', { method: 'POST', body: JSON.stringify({ imageUrl: imageUrl || '', caption, filter, musicTitle: selectedMusic?.title || '', musicArtist: selectedMusic?.artist || '', musicPreviewUrl: selectedMusic?.previewUrl || '', musicArtworkUrl: selectedMusic?.artworkUrl || '' }) })
      showToast('Story shared!'); onPosted()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed to share story') } finally { setPosting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 pt-6">
        <button onClick={onBack} className="text-white p-1"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        <h2 className="text-white font-bold text-lg">New story</h2>
        <div className="w-8" />
      </div>
      <div className="flex justify-center gap-3 p-4">
        <button onClick={() => setCreateMode('text')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${createMode === 'text' ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}><span className="font-bold">Aa</span> Text</button>
        <button onClick={() => setCreateMode('music')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${createMode === 'music' ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg> Music</button>
        <button onClick={() => setCreateMode('camera')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${createMode === 'camera' ? 'bg-white text-black' : 'bg-white/10 text-white/60'}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> Camera</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {createMode === 'camera' && (
          <>
            {!imageUrl ? (
              <button onClick={() => fileInput.current?.click()} disabled={uploading} className="w-full aspect-[9/16] max-h-[500px] border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-white/40 transition-colors">
                {uploading ? <Spinner size="lg" /> : (<><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg><p className="text-white font-semibold">Tap to upload photo</p><p className="text-white/40 text-xs">JPG, PNG, WEBP — max 10MB</p></>)}
              </button>
            ) : (
              <div className="relative aspect-[9/16] max-h-[500px] rounded-2xl overflow-hidden bg-black mb-4">
                <img src={imageUrl} alt="Story preview" className="w-full h-full object-cover" style={{ filter: filterCss(filter) }} />
                <button onClick={() => { setImageUrl(''); setFilter('none') }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                {selectedMusic && (
                  <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 backdrop-blur rounded-full pl-1 pr-3 py-1">
                    {selectedMusic.artworkUrl ? <img src={selectedMusic.artworkUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="16" r="2.5" /></svg></div>}
                    <div className="text-xs"><div className="text-white font-semibold leading-tight truncate max-w-[120px]">{selectedMusic.title}</div><div className="text-white/60 leading-tight truncate max-w-[120px]">{selectedMusic.artist}</div></div>
                  </div>
                )}
                {caption && <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent"><p className="text-white text-center font-semibold text-lg">{caption}</p></div>}
              </div>
            )}
            {imageUrl && (<div className="mb-4"><div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">{FILTERS.map((f) => (<button key={f.name} onClick={() => setFilter(f.name)} className={`flex-shrink-0 flex flex-col items-center gap-1 ${filter === f.name ? 'opacity-100' : 'opacity-60'}`}><div className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${filter === f.name ? 'border-white' : 'border-transparent'}`}><img src={imageUrl} alt={f.label} className="w-full h-full object-cover" style={{ filter: f.css }} /></div><span className={`text-[10px] ${filter === f.name ? 'text-white font-semibold' : 'text-white/50'}`}>{f.label}</span></button>))}</div></div>)}
            {imageUrl && <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption (optional)" maxLength={100} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/40 mb-4 focus:outline-none focus:border-white/30" />}
          </>
        )}
        {createMode === 'text' && (
          <div className="aspect-[9/16] max-h-[500px] rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-800 flex flex-col items-center justify-center p-6 mb-4">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Start typing" maxLength={200} autoFocus className="w-full bg-transparent border-none outline-none text-center text-white text-2xl font-bold placeholder:text-white/50 resize-none" rows={4} />
          </div>
        )}
        {createMode === 'music' && (
          <>
            {!imageUrl ? (
              <button onClick={() => { setCreateMode('camera') }} className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="mx-auto mb-2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <p className="text-white font-semibold">Upload a photo first</p><p className="text-white/40 text-xs mt-1">Switch to Camera tab to upload</p>
              </button>
            ) : selectedMusic ? (
              <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 mb-4">
                {selectedMusic.artworkUrl ? <img src={selectedMusic.artworkUrl} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="16" r="2.5" /></svg></div>}
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white truncate">{selectedMusic.title}</div><div className="text-xs text-white/50 truncate">{selectedMusic.artist}</div></div>
                <button onClick={() => setSelectedMusic(null)} className="p-2 text-white/40 hover:text-red-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
              </div>
            ) : (
              <>
                {/* Tabs: Bongo / Trending 2026 / Search */}
                <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-3">
                  <button onClick={() => setMusicTab('bongo')} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${musicTab === 'bongo' ? 'bg-white text-black' : 'text-white/60'}`}>🎵 Bongo Flava</button>
                  <button onClick={() => setMusicTab('trending')} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${musicTab === 'trending' ? 'bg-white text-black' : 'text-white/60'}`}>🔥 2026 Hits</button>
                  <button onClick={() => setMusicTab('search')} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${musicTab === 'search' ? 'bg-white text-black' : 'text-white/60'}`}>🔍 Search</button>
                </div>

                {musicTab === 'search' && (
                  <>
                    <input type="text" value={musicSearch} onChange={(e) => { setMusicSearch(e.target.value); searchMusic(e.target.value) }} placeholder="Search any song..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/40 mb-3 focus:outline-none focus:border-white/30" />
                    {searchingMusic && <div className="text-xs text-white/40 mb-2">Searching...</div>}
                    {musicResults.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2">Results</div>
                        {musicResults.map((r, i) => (
                          <button key={i} onClick={() => { setSelectedMusic({ title: r.trackName, artist: r.artistName, previewUrl: r.previewUrl, artworkUrl: r.artworkUrl }); setMusicSearch(''); setMusicResults([]) }} className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left">
                            {r.artworkUrl && <img src={r.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                            <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white truncate">{r.trackName}</div><div className="text-xs text-white/50 truncate">{r.artistName}</div></div>
                            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg></div>
                          </button>
                        ))}
                      </div>
                    )}
                    {musicSearch && !searchingMusic && musicResults.length === 0 && (
                      <p className="text-xs text-white/40 text-center py-4">No songs found for "{musicSearch}"</p>
                    )}
                  </>
                )}

                {musicTab === 'bongo' && (
                  <div className="space-y-1">
                    <div className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2">🇹🇿 Original Bongo Flava</div>
                    {CURATED_SONGS.filter((s) => s.category === 'bongo').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => fetchFromItunes(s)}
                        disabled={loadingItunes === s.id}
                        className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, hsl(${(s.id.charCodeAt(0) * 13 + s.id.charCodeAt(1) * 7) % 360}, 70%, 50%), hsl(${(s.id.charCodeAt(0) * 13 + s.id.charCodeAt(1) * 7 + 60) % 360}, 70%, 45%))` }}>
                          {loadingItunes === s.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : s.title.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white truncate">{s.title}</div><div className="text-xs text-white/50 truncate">{s.artist}</div></div>
                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg></div>
                      </button>
                    ))}
                  </div>
                )}

                {musicTab === 'trending' && (
                  <div className="space-y-1">
                    <div className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2">🔥 Trending 2026</div>
                    {CURATED_SONGS.filter((s) => s.category === 'trending').map((s) => (
                      <button
                        key={s.id}
                        onClick={() => fetchFromItunes(s)}
                        disabled={loadingItunes === s.id}
                        className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, hsl(${(s.id.charCodeAt(0) * 17 + s.id.charCodeAt(1) * 11) % 360}, 70%, 50%), hsl(${(s.id.charCodeAt(0) * 17 + s.id.charCodeAt(1) * 11 + 80) % 360}, 70%, 45%))` }}>
                          {loadingItunes === s.id ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : s.title.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-white truncate">{s.title}</div><div className="text-xs text-white/50 truncate">{s.artist}</div></div>
                        <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg></div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <div className="p-4 bg-black border-t border-white/5">
        <button onClick={submit} disabled={posting || (createMode === 'camera' && !imageUrl)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {posting ? <Spinner /> : (<>Share story<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></>)}
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}

// ============ EDIT PROFILE MODAL ============
function EditProfileModal({ me, onClose, onSaved, showToast }: {
  me: SessionUser
  onClose: () => void
  onSaved: (u: SessionUser) => void
  showToast: (m: string) => void
}) {
  const [displayName, setDisplayName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleAvatar = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setAvatarUrl(d.url)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      // Update avatar if changed
      if (avatarUrl !== me.avatarUrl) {
        await api('/api/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatarUrl }) })
      }
      // Update profile
      const d = await api('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName, bio }),
      })
      onSaved(d.user)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Edit profile</h3>
          <button onClick={onClose} className="text-fam-muted hover:text-fam-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Avatar */}
        <div className="flex justify-center mb-6">
          <button onClick={() => fileInput.current?.click()} disabled={uploading} className="relative">
            <Avatar src={avatarUrl} name={displayName} size={88} ring="active" />
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full fam-gradient flex items-center justify-center border-2 border-fam-bg">
              {uploading ? <Spinner /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              )}
            </div>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f) }}
        />

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full bg-fam-surface border border-fam-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-fam-purple"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="Tell people about yourself..."
              className="w-full bg-fam-surface border border-fam-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-fam-purple"
            />
            <div className="text-right text-xs text-fam-muted">{bio.length}/200</div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-fam-surface text-sm font-semibold">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !displayName.trim()}
              className="flex-1 py-2.5 rounded-xl fam-gradient text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Spinner /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ GIFT MODAL ============
function GiftModal({ me, target, onClose, onSuccess, showToast }: {
  me: SessionUser
  target: Author
  onClose: () => void
  onSuccess: () => void
  showToast: (m: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [sticker, setSticker] = useState('🎁')
  const [balance, setBalance] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stickers = ['🎁', '🎉', '❤️', '🌹', '⭐', '🏆', '💎', '🔥']

  useEffect(() => {
    api('/api/wallet').then((d) => setBalance(d.wallet.balance)).catch(() => {})
  }, [])

  const send = async () => {
    const amt = Number(amount)
    if (!amt || amt < 1) {
      setError('Enter a valid amount (minimum KES 1)')
      return
    }
    setSending(true)
    setError(null)
    try {
      await api('/api/wallet/gift', {
        method: 'POST',
        body: JSON.stringify({ toUserId: target.id, amountKES: amt, message, sticker }),
      })
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send gift')
    } finally {
      setSending(false)
    }
  }

  const quickAmounts = [10, 50, 100, 500]

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Send gift</h3>
          <button onClick={onClose} className="text-fam-muted hover:text-fam-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Recipient */}
        <div className="flex items-center gap-3 p-3 bg-fam-surface rounded-xl mb-4">
          <Avatar src={target.avatarUrl} name={target.displayName} size={40} />
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold">{target.username}{target.verified && <VerifiedBadge type={target.verifiedType} />}</div>
            <div className="text-xs text-fam-muted">{target.displayName}</div>
          </div>
        </div>

        {/* Balance */}
        <div className="text-xs text-fam-muted mb-3">
          Your balance: <span className="font-bold text-fam-text">KES {balance !== null ? (balance / 100).toFixed(2) : '...'}</span>
        </div>

        {/* Sticker picker */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Sticker</label>
          <div className="flex gap-2 flex-wrap">
            {stickers.map((s) => (
              <button
                key={s}
                onClick={() => setSticker(s)}
                className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center ${sticker === s ? 'bg-fam-purple/30 border border-fam-purple' : 'bg-fam-surface'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Amount (KES)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-fam-purple"
          />
          <div className="flex gap-2 mt-2">
            {quickAmounts.map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="flex-1 py-1.5 rounded-lg bg-fam-surface text-xs font-semibold hover:bg-fam-border"
              >
                KES {q}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Message (optional)</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            placeholder="Enjoy! 🎉"
            className="w-full bg-fam-surface border border-fam-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-fam-purple"
          />
        </div>

        {error && <div className="text-rose-400 text-sm bg-rose-500/10 rounded-lg p-2.5 mb-3">{error}</div>}

        <button
          onClick={send}
          disabled={sending || !amount}
          className="w-full py-3 rounded-xl fam-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending ? <Spinner /> : <>Send {sticker} KES {amount || '0'}</>}
        </button>
      </div>
    </div>
  )
}

// ============ VIBEFAM AI CHAT MODAL ============
function AiChatModal({ me, onClose }: { me: SessionUser; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api('/api/ai/chat').then((d) => setMessages(d.chats.map((c: { role: string; text: string }) => ({ role: c.role, text: c.text })))).catch(() => {})
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const d = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ text }) })
      setMessages((m) => [...m, { role: 'assistant', text: d.reply }])
    } catch (e: unknown) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, I had trouble responding. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="glass md:rounded-2xl w-full md:max-w-md h-[85vh] md:h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header — no profile, just the AI name */}
        <div className="flex items-center gap-3 p-3 border-b border-fam-border">
          <div className="w-10 h-10 rounded-full fam-gradient flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm flex items-center gap-1.5">VibeFam AI <VerifiedBadge type="blue" /></div>
            <div className="text-xs text-fam-muted">Always here to help • No profile</div>
          </div>
          <button onClick={onClose} className="p-2 text-fam-muted hover:text-fam-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-2xl fam-gradient flex items-center justify-center mb-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" /></svg>
              </div>
              <p className="font-bold text-lg">VibeFam AI</p>
              <p className="text-sm text-fam-muted mt-1">Ask me anything about Boboh Vibe — posting, live, wallet, gifts, verification, and more!</p>
            </div>
          )}
          {messages.map((m, i) => {
            const isMe = m.role === 'user'
            return (
              <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${isMe ? 'fam-gradient text-white rounded-br-md' : 'bg-fam-surface text-fam-text rounded-bl-md'}`}>
                  {m.text}
                </div>
              </div>
            )
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-fam-surface px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-fam-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-fam-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-fam-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-fam-border">
          <div className="flex gap-2 items-end">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder="Ask VibeFam AI..."
              className="flex-1 bg-fam-surface border border-fam-border rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-fam-purple"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-full fam-gradient text-white flex items-center justify-center disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ GROUPS VIEW ============
function GroupsView({ onOpenGroup, onBack, onCreate, onJoin }: {
  onOpenGroup: (g: { id: string; name: string; inviteCode: string }) => void
  onBack: () => void
  onCreate: () => void
  onJoin: () => void
}) {
  const [groups, setGroups] = useState<{ id: string; name: string; description: string; inviteCode: string; isAdmin: boolean; _count?: { members: number } }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/groups/create').then((d) => setGroups(d.groups)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-[#FFFFFF] min-h-screen">
      {/* WhatsApp-style dark header */}
      <div className="wa-panel flex items-center gap-2 px-3 py-3 border-b border-[#E5E5EA] sticky top-0 z-10">
        <button onClick={onBack} className="md:hidden p-1 text-fam-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h2 className="text-xl font-bold flex-1 text-white">Groups</h2>
        <button onClick={onJoin} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-fam-text" title="Join with code">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
        </button>
        <button onClick={onCreate} className="p-2 rounded-full wa-bubble-out text-white" title="Create group">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      <div className="px-2 py-2">
        {loading ? <Loading /> : groups.length === 0 ? (
          <CenterMsg msg="No groups yet" sub="Create a group or join one with an invite code" action="Create group" onAction={onCreate} />
        ) : (
          <div className="space-y-0">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onOpenGroup({ id: g.id, name: g.name, inviteCode: g.inviteCode })}
                className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] rounded-lg text-left"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${waAvatarClass(g.name)}`}>
                  {waInitial(g.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px] text-white truncate">{g.name}</span>
                    {g.isAdmin && <span className="text-[10px] bg-fam-purple/20 text-fam-purple px-1.5 py-0.5 rounded-full font-bold uppercase">Admin</span>}
                  </div>
                  <div className="text-[13px] text-fam-muted">{g._count?.members || 0} members</div>
                </div>
                <div className="text-[11px] text-fam-muted font-mono flex-shrink-0">{g.inviteCode}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ CREATE GROUP VIEW ============
function CreateGroupView({ me, onCreated, onBack, showToast }: { me: SessionUser; onCreated: (g: { id: string; name: string; inviteCode: string }) => void; onBack: () => void; showToast: (m: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return showToast('Group name required')
    setLoading(true)
    try {
      const d = await api('/api/groups/create', { method: 'POST', body: JSON.stringify({ name: name.trim(), description }) })
      showToast('Group created! Share the invite code.')
      onCreated({ id: d.group.id, name: d.group.name, inviteCode: d.group.inviteCode })
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="px-4 py-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold">New Group</h2>
      </div>
      <Input label="Group name" value={name} onChange={setName} placeholder="My Awesome Group" />
      <div className="mt-3">
        <label className="block text-xs font-semibold text-fam-muted uppercase tracking-wider mb-1.5">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={300} placeholder="What's this group about?" className="w-full bg-fam-surface border border-fam-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-fam-purple" />
      </div>
      <button onClick={submit} disabled={loading} className="w-full mt-6 py-3 rounded-xl fam-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <Spinner /> : 'Create Group'}</button>
    </div>
  )
}

// ============ JOIN GROUP VIEW ============
function JoinGroupView({ me, onJoined, onBack, showToast }: { me: SessionUser; onJoined: (g: { id: string; name: string; inviteCode: string }) => void; onBack: () => void; showToast: (m: string) => void }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (code.trim().length < 6) return showToast('Enter valid invite code')
    setLoading(true)
    try {
      const d = await api('/api/groups/join', { method: 'POST', body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }) })
      showToast('Joined group!')
      onJoined({ id: d.group.id, name: d.group.name, inviteCode: d.group.inviteCode })
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed to join') }
    finally { setLoading(false) }
  }

  return (
    <div className="px-4 py-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold">Join Group</h2>
      </div>
      <Input label="Invite code" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="ABCD1234" />
      <button onClick={submit} disabled={loading} className="w-full mt-6 py-3 rounded-xl fam-gradient text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <Spinner /> : 'Join Group'}</button>
    </div>
  )
}

// ============ GROUP CHAT VIEW ============
function GroupChatView({ me, group, onBack, onInfo, showToast }: { me: SessionUser; group: { id: string; name: string; inviteCode: string }; onBack: () => void; onInfo: () => void; showToast: (m: string) => void }) {
  const [messages, setMessages] = useState<{ id: string; text: string; senderId: string; sender: Author; replyTo?: { id: string; text: string; sender: { id: string; username: string; displayName: string } } | null }[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; sender: { displayName: string; username: string } } | null>(null)
  const [chatLocked, setChatLocked] = useState(false)
  const [showPinSetup, setShowPinSetup] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try { const d = await api(`/api/groups/${group.id}/messages`); setMessages(d.messages) } catch {}
    finally { setLoading(false) }
  }, [group.id])

  // Fetch group info for member count + check if chat is locked (localStorage)
  useEffect(() => {
    api(`/api/groups/${group.id}`).then((d: { group?: { members?: unknown[] } }) => {
      if (d?.group?.members) setMemberCount(d.group.members.length)
    }).catch(() => {})
    // Check lock state
    const locked = localStorage.getItem(`vibefam-chat-locked-${group.id}`) === '1'
    if (locked) setChatLocked(true)
  }, [group.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!text.trim()) return
    const msgText = text.trim()
    const replyToId = replyTo?.id
    setText('')
    setReplyTo(null)
    try {
      const d = await api(`/api/groups/${group.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: msgText, replyToId }),
      })
      setMessages((m) => [...m, d.message])
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed to send') }
  }

  // If chat is locked, show lock screen first
  if (chatLocked) {
    return (
      <>
        <ChatLockScreen
          chatId={group.id}
          chatName={group.name}
          onUnlock={() => setChatLocked(false)}
          onExit={onBack}
        />
      </>
    )
  }

  return (
    <div className="fixed inset-0 md:relative md:inset-auto z-40 flex flex-col bg-[#FFFFFF] md:rounded-2xl md:border md:border-fam-border md:max-h-[85vh]">
      {/* WhatsApp-style group header */}
      <div className="wa-panel flex items-center gap-2 px-2 py-2 border-b">
        <button onClick={onBack} className="p-1.5 text-fam-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button onClick={onInfo} className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${waAvatarClass(group.name)}`}>
            {waInitial(group.name)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] text-white truncate">{group.name}</div>
            <div className="text-[12px] text-fam-muted">
              {memberCount !== null ? `Group · ${memberCount} members` : `Code: ${group.inviteCode}`}
            </div>
          </div>
        </button>
        <button onClick={onInfo} className="p-2 rounded-full hover:bg-white/5 text-fam-text" title="Voice call">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
        </button>
        <button onClick={onInfo} className="p-2 rounded-full hover:bg-white/5 text-fam-text" title="Group info">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        </button>
      </div>

      {/* WhatsApp-style messages area with doodle pattern */}
      <div className="wa-chat-bg flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="bg-[#F5F5F7] text-fam-muted text-xs px-4 py-2 rounded-lg text-center max-w-[280px]">
              🔒 Messages are end-to-end encrypted. Say hi to the group!
            </div>
          </div>
        ) : (
          messages.map((m, idx) => (
            <GroupChatBubble
              key={m.id}
              m={m}
              idx={idx}
              messages={messages}
              me={me}
              onViewUser={(u) => { /* could navigate to user */ }}
              onReply={(msg) => setReplyTo(msg)}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Reply composer (above input) */}
      {replyTo && (
        <ReplyComposer
          replyTo={replyTo}
          onCancel={() => setReplyTo(null)}
          isGroup={true}
        />
      )}

      {/* WhatsApp-style input bar */}
      <div className="wa-panel px-2 py-2 border-t flex items-end gap-1.5">
        <button onClick={() => { setShowEmojiPicker(!showEmojiPicker) }} className="p-2 text-fam-muted hover:text-fam-text" title="Emoji">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
        </button>
        <div className="flex-1 wa-input px-4 py-2 flex items-center min-h-[40px]">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            placeholder="Message"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-fam-text placeholder:text-fam-muted"
          />
          <button onClick={() => photoInputRef.current?.click()} className="ml-2 text-fam-muted hover:text-fam-text" title="Attach photo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          </button>
          <button onClick={() => cameraInputRef.current?.click()} className="ml-1 text-fam-muted hover:text-fam-text" title="Camera">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </button>
        </div>
        <button
          onClick={send}
          disabled={!text.trim()}
          className="w-11 h-11 rounded-full wa-bubble-out flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title="Send"
        >
          {text.trim() ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          )}
        </button>
      </div>

      {showPinSetup && (
        <PinSetupModal
          chatId={group.id}
          onClose={() => setShowPinSetup(false)}
          onSet={() => { setShowPinSetup(false); showToast('Chat locked. PIN required next time.') }}
        />
      )}
    </div>
  )
}

// ============ GROUP INFO VIEW ============
function GroupInfoView({ group, me, onBack, showToast }: { group: { id: string; name: string; inviteCode: string }; me: SessionUser; onBack: () => void; showToast: (m: string) => void }) {
  const [info, setInfo] = useState<{ group: { name: string; description: string; inviteCode: string; onlyAdminsCanChat: boolean; isHallOfFame?: boolean; members: { userId: string; isAdmin: boolean; user: Author }[]; creator: Author }; isAdmin: boolean; isMember: boolean; media?: { url: string; messageId: string; createdAt: string }[] } | null>(null)
  const [addUsername, setAddUsername] = useState('')
  const [chatLocked, setChatLocked] = useState(false)
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showVoiceChat, setShowVoiceChat] = useState(false)
  const [showHoF, setShowHoF] = useState(false)

  const load = useCallback(() => { api(`/api/groups/${group.id}`).then(setInfo).catch(() => {}) }, [group.id])
  useEffect(() => {
    load()
    // Sync chat lock state from localStorage
    setChatLocked(localStorage.getItem(`vibefam-chat-locked-${group.id}`) === '1')
  }, [load])

  if (!info) return <Loading />

  const copyCode = () => { navigator.clipboard.writeText(group.inviteCode); showToast('Invite code copied!') }
  const copyLink = () => { navigator.clipboard.writeText(`https://vibefam.dpdns.org/@${group.inviteCode}`); showToast('Invite link copied! Share it anywhere.') }
  // Actually the invite link is the group code — share as #group=CODE
  const copyLink2 = () => { navigator.clipboard.writeText(`https://vibefam.dpdns.org#group=${group.inviteCode}`); showToast('Invite link copied! Share it anywhere.') }

  const toggleAdminChat = async () => {
    try {
      const d = await api(`/api/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'toggleChat', onlyAdminsCanChat: !info.group.onlyAdminsCanChat }) })
      setInfo({ ...info, group: { ...info.group, onlyAdminsCanChat: d.onlyAdminsCanChat } })
      showToast(d.onlyAdminsCanChat ? 'Only admins can chat now' : 'All members can chat now')
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
  }

  const toggleHallOfFame = async () => {
    try {
      const d = await api(`/api/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'toggleHallOfFame', isHallOfFame: !info.group.isHallOfFame }) })
      setInfo({ ...info, group: { ...info.group, isHallOfFame: d.isHallOfFame } })
      showToast(d.isHallOfFame ? 'Group inducted into Hall of Fame! 🏆' : 'Removed from Hall of Fame')
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
  }

  const promoteMember = async (userId: string, makeAdmin: boolean) => {
    try {
      await api(`/api/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'promote', targetUserId: userId, makeAdmin }) })
      showToast(makeAdmin ? 'Promoted to admin' : 'Removed admin')
      load()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
  }

  const removeMember = async (userId: string) => {
    try {
      await api(`/api/groups/${group.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'remove', targetUserId: userId }) })
      showToast('Member removed')
      load()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
  }

  const addMember = async () => {
    if (!addUsername.trim()) return
    try {
      await api(`/api/groups/${group.id}/members`, { method: 'POST', body: JSON.stringify({ username: addUsername.trim() }) })
      showToast(`${addUsername} added to group`)
      setAddUsername('')
      load()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed to add') }
  }

  const toggleChatLock = () => {
    if (chatLocked) {
      // Unlock (remove PIN)
      localStorage.removeItem(`vibefam-chat-locked-${group.id}`)
      localStorage.removeItem(`vibefam-chat-pin-${group.id}`)
      setChatLocked(false)
      showToast('Chat lock removed')
    } else {
      // Set up PIN
      setShowPinSetup(true)
    }
  }

  return (
    <div className="bg-black min-h-screen text-fam-text pb-12">
      {/* WhatsApp-style top nav */}
      <div className="wa-panel flex items-center justify-between px-3 py-3 border-b border-[#E5E5EA] sticky top-0 z-10">
        <button onClick={onBack} className="p-1.5 text-fam-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <button onClick={() => showToast('More options coming soon')} className="p-1.5 text-fam-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </button>
      </div>

      {/* Group header — large avatar, name, member count, Hall of Fame badge */}
      <div className="flex flex-col items-center pt-6 pb-5 px-4">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-bold mb-4 ${waAvatarClass(group.name)}`}>
          {waInitial(info.group.name)}
        </div>
        <h1 className="text-2xl font-bold text-center text-white">{info.group.name}</h1>
        <p className="text-sm text-fam-muted mt-1">Group · {info.group.members.length} members</p>

        {/* Hall of Fame badge */}
        <button onClick={() => setShowHoF(true)} className="flex items-center gap-2 mt-3 hover:opacity-80">
          <span className={`wa-hof-text text-[14px] ${info.group.isHallOfFame ? 'text-yellow-400' : 'text-white/70'}`}>HALL OF FAME</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={info.group.isHallOfFame ? '#fbbf24' : 'rgba(255,255,255,0.4)'}><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.27A5 5 0 0 1 13 14.9V18h3v2H8v-2h3v-3.1a5 5 0 0 1-2.73-2.9H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.73V7zm10 0v2.73A2 2 0 0 0 18 8V7h-1z"/></svg>
          <span className="text-[13px] text-[#10b981] hover:underline">Read more</span>
        </button>
      </div>

      {/* Action buttons — Voice chat / Add / Search */}
      <div className="grid grid-cols-3 gap-3 px-4 mb-6">
        <button onClick={() => setShowVoiceChat(true)} className="wa-action-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          <span>Voice chat</span>
        </button>
        <button onClick={info.isAdmin ? () => {
          const el = document.getElementById('add-member-input')
          if (el) { el.scrollIntoView({behavior:'smooth'}); el.focus() }
        } : () => showToast('Only admins can add members')} className="wa-action-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
          <span>Add</span>
        </button>
        <button onClick={() => showToast('Search coming soon')} className="wa-action-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <span>Search</span>
        </button>
      </div>

      {/* Media, links, and docs section — REAL media from API */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between py-3 border-b border-[#E5E5EA]">
          <span className="text-[15px] text-fam-muted">Media, links, and docs</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] text-white">{info.media?.length || 0}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fam-muted"><polyline points="9 18 15 12 9 6" /></svg>
          </div>
        </div>
        {info.media && info.media.length > 0 && (
          <div className="wa-media-scroll flex gap-2 overflow-x-auto py-3">
            {info.media.map((m, i) => (
              <div key={i} className="media-tile w-24 flex-shrink-0">
                <img src={m.url} alt="" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings list */}
      <div className="px-4 mb-4">
        <div className="bg-[#F5F5F7] rounded-lg overflow-hidden">
          <button onClick={() => showToast('Storage info coming soon')} className="wa-settings-row w-full text-left">
            <svg className="wa-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            <div className="flex-1">
              <div className="text-[15px] text-white">Manage storage</div>
              <div className="text-[12px] text-fam-muted">0 MB</div>
            </div>
          </button>
          <button onClick={() => showToast('Notifications coming soon')} className="wa-settings-row w-full text-left">
            <svg className="wa-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <div className="flex-1">
              <div className="text-[15px] text-white">Notifications</div>
              <div className="text-[12px] text-fam-muted">Highlights</div>
            </div>
          </button>
          <button onClick={() => showToast('Media visibility coming soon')} className="wa-settings-row w-full text-left">
            <svg className="wa-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            <div className="flex-1">
              <div className="text-[15px] text-white">Media visibility</div>
            </div>
          </button>
          <div className="wa-settings-row">
            <svg className="wa-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div className="flex-1">
              <div className="text-[15px] text-white">Encryption</div>
              <div className="text-[12px] text-fam-muted">Messages and calls are end-to-end encrypted. Tap to learn more.</div>
            </div>
          </div>
          <div className="wa-settings-row">
            <svg className="wa-settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
            <div className="flex-1">
              <div className="text-[15px] text-white">Chat lock</div>
              <div className="text-[12px] text-fam-muted">{chatLocked ? 'Locked — PIN required to open' : 'Lock and hide this chat on this device.'}</div>
            </div>
            <button
              onClick={toggleChatLock}
              className={`relative w-10 h-6 rounded-full transition-colors ${chatLocked ? 'bg-fam-purple' : 'bg-[#D1D1D6]'}`}
              title="Toggle chat lock"
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${chatLocked ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Invite Link section */}
      <div className="px-4 mb-4">
        <div className="bg-[#F5F5F7] rounded-lg p-4">
          <div className="text-[11px] text-fam-muted uppercase font-semibold mb-1 tracking-wider">Invite Link</div>
          <code className="text-base font-bold fam-gradient-text block truncate mb-3">vibefam.dpdns.org#group={info.group.inviteCode}</code>
          <div className="flex gap-2">
            <button onClick={copyLink2} className="flex-1 py-2.5 rounded-lg wa-bubble-out text-white text-sm font-semibold">Copy Link</button>
            <button onClick={copyCode} className="px-4 py-2.5 rounded-lg bg-[#F5F5F7] text-fam-text text-sm font-semibold">Code</button>
          </div>
          <p className="text-[11px] text-fam-muted mt-2">Share this link — anyone who opens it will join the group automatically.</p>
        </div>
      </div>

      {/* Admin controls */}
      {info.isAdmin && (
        <div className="px-4 mb-4">
          <div className="bg-[#F5F5F7] rounded-lg p-4">
            <h3 className="text-[11px] text-fam-muted uppercase font-semibold mb-3 tracking-wider">Admin Controls</h3>
            <button onClick={toggleAdminChat} className={`w-full py-2.5 rounded-lg text-sm font-semibold mb-3 ${info.group.onlyAdminsCanChat ? 'bg-amber-500/10 text-amber-400' : 'bg-[#F5F5F7] text-fam-text'}`}>
              {info.group.onlyAdminsCanChat ? '🔒 Only admins can chat (tap to allow all)' : '💬 All members can chat (tap to restrict)'}
            </button>
            <button onClick={() => setShowHoF(true)} className="w-full py-2.5 rounded-lg text-sm font-semibold mb-3 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              🏆 {info.group.isHallOfFame ? 'Manage Hall of Fame status' : 'Nominate for Hall of Fame'}
            </button>
            <div className="flex gap-2">
              <input
                id="add-member-input"
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="Add by username..."
                autoCapitalize="none"
                className="flex-1 bg-[#F5F5F7] border border-[#D1D1D6] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fam-purple"
                onKeyDown={(e) => { if (e.key === 'Enter') addMember() }}
              />
              <button onClick={addMember} className="px-4 py-2 rounded-lg wa-bubble-out text-white text-sm font-semibold">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="px-4">
        <h3 className="text-[11px] text-fam-muted uppercase font-semibold mb-2 tracking-wider">Members ({info.group.members.length})</h3>
        <div className="bg-[#F5F5F7] rounded-lg overflow-hidden">
          {info.group.members.map((m, idx) => (
            <div key={m.userId} className={`flex items-center gap-3 p-3 ${idx < info.group.members.length - 1 ? 'border-b border-[#E5E5EA]' : ''}`}>
              {m.user.avatarUrl ? (
                <img src={m.user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${waAvatarClass(m.user.username)}`}>
                  {waInitial(m.user.displayName || m.user.username)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-1">
                  <span className="text-white truncate">{m.user.username}</span>
                  {m.user.verified && <VerifiedBadge type={m.user.verifiedType} />}
                </div>
                <div className="text-xs text-fam-muted truncate">{m.user.displayName}</div>
              </div>
              {m.isAdmin && <span className="text-[10px] bg-fam-purple/20 text-fam-purple px-2 py-1 rounded-full font-semibold uppercase tracking-wider">Admin</span>}
              {info.isAdmin && m.userId !== me.id && (
                <div className="flex gap-1">
                  <button onClick={() => promoteMember(m.userId, !m.isAdmin)} className="p-1.5 rounded-lg bg-[#F5F5F7] text-fam-muted hover:text-fam-purple" title={m.isAdmin ? 'Remove admin' : 'Make admin'}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z" /></svg>
                  </button>
                  <button onClick={() => removeMember(m.userId)} className="p-1.5 rounded-lg bg-[#F5F5F7] text-rose-400 hover:bg-rose-500/10" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showVoiceChat && (
        <VoiceChatModal
          groupName={info.group.name}
          onClose={() => setShowVoiceChat(false)}
          showToast={showToast}
        />
      )}
      {showHoF && (
        <HallOfFameModal
          groupName={info.group.name}
          onClose={() => setShowHoF(false)}
          isAdmin={info.isAdmin}
          onToggle={toggleHallOfFame}
          isHallOfFame={!!info.group.isHallOfFame}
        />
      )}
      {showPinSetup && (
        <PinSetupModal
          chatId={group.id}
          onClose={() => setShowPinSetup(false)}
          onSet={() => {
            setShowPinSetup(false)
            setChatLocked(true)
            showToast('Chat locked. PIN required next time.')
          }}
        />
      )}
    </div>
  )
}

// ============ LIVE LIST VIEW ============
function LiveListView({ onStartLive, onViewLive, onBack }: { onStartLive: () => void; onViewLive: (id: string) => void; onBack: () => void }) {
  const [streams, setStreams] = useState<{ id: string; title: string; viewerCount: number; likeCount: number; host: Author }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/live').then((d) => setStreams(d.streams)).catch(() => {}).finally(() => setLoading(false))
    const t = setInterval(() => api('/api/live').then((d) => setStreams(d.streams)).catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="md:hidden p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold flex-1">Live</h2>
        <button onClick={onStartLive} className="px-4 py-2 rounded-xl fam-gradient text-white text-sm font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Go Live
        </button>
      </div>
      {loading ? <Loading /> : streams.length === 0 ? (
        <CenterMsg msg="No live streams" sub="Be the first to go live!" action="Go Live" onAction={onStartLive} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {streams.map((s) => (
            <button key={s.id} onClick={() => onViewLive(s.id)} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-fam-surface border border-fam-border">
              <div className="absolute inset-0 fam-gradient opacity-30" />
              <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-500 px-2 py-1 rounded-full text-xs font-bold text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</div>
              <div className="absolute top-2 right-2 bg-black/50 px-2 py-1 rounded-full text-xs text-white">👥 {s.viewerCount}</div>
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <div className="text-white font-semibold text-sm truncate">{s.title}</div>
                <div className="text-white/70 text-xs">@{s.host.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ LIVE STREAM VIEW ============
function LiveStreamView({ me, streamId, onBack, showToast }: { me: SessionUser; streamId: string; onBack: () => void; showToast: (m: string) => void }) {
  const [stream, setStream] = useState<{ id: string; title: string; viewerCount: number; likeCount: number; host: Author & { _count?: { gotFollows: number } }; isLive: boolean } | null>(null)
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([])
  const [showGift, setShowGift] = useState(false)
  const [showApkPrompt, setShowApkPrompt] = useState(true)
  const heartId = useRef(0)

  const load = useCallback(() => {
    api(`/api/live/${streamId}`).then((d) => setStream(d.stream)).catch(() => {})
  }, [streamId])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  const tapLike = async () => {
    const id = heartId.current++
    const x = Math.random() * 200 - 100
    setHearts((h) => [...h, { id, x }])
    setTimeout(() => setHearts((h) => h.filter((heart) => heart.id !== id)), 2000)
    api(`/api/live/${streamId}/like`, { method: 'POST' }).catch(() => {})
  }

  const sendGift = async (amount: number, sticker: string) => {
    setShowGift(false)
    try {
      await api(`/api/live/${streamId}/gift`, { method: 'POST', body: JSON.stringify({ amountKES: amount, sticker }) })
      showToast(`Gift sent! ${sticker}`)
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Gift failed') }
  }

  if (!stream) return <Loading />
  const isHost = stream.host.id === me.id

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      {/* APK download prompt — shown on web for better experience */}
      {showApkPrompt && (
        <div className="absolute top-16 left-4 right-4 z-50 glass rounded-xl p-3 flex items-center gap-3 animate-slide-up">
          <div className="w-10 h-10 rounded-lg fam-gradient flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" /></svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Use VibeFam App for better experience</p>
            <p className="text-xs text-fam-muted">Camera, microphone, and calling work in the APK</p>
          </div>
          <a href="/vibefam.apk" download className="px-3 py-1.5 rounded-lg fam-gradient text-white text-xs font-semibold flex-shrink-0">Download APK</a>
          <button onClick={() => setShowApkPrompt(false)} className="text-fam-muted p-1 flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>
      )}
      {/* Stream area */}
      <div className="flex-1 relative overflow-hidden" onClick={tapLike}>
        <div className="absolute inset-0 fam-gradient opacity-20" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-32 h-32 rounded-full fam-gradient flex items-center justify-center text-5xl font-bold text-white mx-auto mb-4">{stream.host.displayName.charAt(0)}</div>
            <h2 className="text-white text-xl font-bold">{stream.title}</h2>
            <p className="text-white/70">@{stream.host.username}</p>
          </div>
        </div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center gap-3 p-4 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={onBack} className="text-white"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="bg-red-500 px-2 py-0.5 rounded text-xs font-bold text-white flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE</span>
              <span className="text-white text-sm">👥 {stream.viewerCount}</span>
              <span className="text-white text-sm">❤️ {stream.likeCount}</span>
            </div>
          </div>
          {isHost && <button onClick={async () => { await api(`/api/live/${streamId}`, { method: 'DELETE' }); onBack() }} className="bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold">End</button>}
        </div>

        {/* Floating hearts */}
        <div className="absolute bottom-20 right-4 pointer-events-none">
          {hearts.map((h) => (
            <div key={h.id} className="absolute text-4xl animate-bounce" style={{ transform: `translateX(${h.x}px)`, animationDuration: '2s', animationIterationCount: 1, bottom: 0, opacity: 0, animationName: 'floatUp' }}>❤️</div>
          ))}
        </div>
        <style>{`@keyframes floatUp { 0% { opacity: 1; bottom: 0; } 100% { opacity: 0; bottom: 300px; } }`}</style>
      </div>

      {/* Bottom actions */}
      <div className="p-4 bg-black/90 border-t border-fam-border flex items-center gap-3">
        <input type="text" placeholder="Say something..." className="flex-1 bg-fam-surface border border-fam-border rounded-full px-4 py-2.5 text-sm text-white focus:outline-none" />
        <button onClick={tapLike} className="w-12 h-12 rounded-full bg-fam-surface flex items-center justify-center text-2xl">❤️</button>
        <button onClick={() => setShowGift(true)} className="w-12 h-12 rounded-full fam-gradient flex items-center justify-center text-2xl">🎁</button>
      </div>

      {/* Gift modal */}
      {showGift && (
        <div className="absolute bottom-20 left-0 right-0 bg-fam-surface rounded-t-2xl p-4 border-t border-fam-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Send Gift</h3>
            <button onClick={() => setShowGift(false)} className="text-fam-muted">✕</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { amt: 10, sticker: '🌹' }, { amt: 50, sticker: '🎁' }, { amt: 100, sticker: '🎉' }, { amt: 200, sticker: '💎' },
              { amt: 500, sticker: '🏆' }, { amt: 1000, sticker: '👑' }, { amt: 2000, sticker: '🚀' }, { amt: 5000, sticker: '💸' },
            ].map((g) => (
              <button key={g.amt} onClick={() => sendGift(g.amt, g.sticker)} className="flex flex-col items-center gap-1 p-3 bg-fam-bg rounded-xl hover:bg-fam-border">
                <span className="text-3xl">{g.sticker}</span>
                <span className="text-xs font-bold">KES {g.amt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ ADMIN VIEW ============
function AdminView({ me, onBack, showToast }: { me: SessionUser; onBack: () => void; showToast: (m: string) => void }) {
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string; avatarUrl: string; verified: boolean; verifiedType: string; isAdmin: boolean; createdAt: string; _count: { posts: number; gotFollows: number } }[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => { api('/api/admin/users').then((d) => setUsers(d.users)).catch(() => {}).finally(() => setLoading(false)) }, [])
  useEffect(() => { load() }, [load])

  const setBadge = async (userId: string, badgeType: string) => {
    try {
      await api('/api/admin/verify', { method: 'POST', body: JSON.stringify({ userId, verifiedType: badgeType }) })
      showToast(badgeType ? `${badgeType} badge applied!` : 'Badge removed')
      load()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Failed') }
  }

  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch {}
    window.location.reload()
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg></button>
        <h2 className="text-xl font-bold flex-1">Admin Dashboard</h2>
        <span className="text-xs bg-fam-purple/20 text-fam-purple px-3 py-1 rounded-full font-semibold">{users.length} users</span>
        <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Logout
        </button>
      </div>
      {loading ? <Loading /> : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="bg-fam-surface rounded-xl p-3">
              <div className="flex items-center gap-3 mb-2">
                <Avatar src={u.avatarUrl} name={u.displayName} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1">{u.username}{u.verified && <VerifiedBadge type={u.verifiedType} />}{u.isAdmin && <span className="text-xs bg-fam-purple/20 text-fam-purple px-1.5 py-0.5 rounded">ADMIN</span>}</div>
                  <div className="text-xs text-fam-muted">{u.displayName} · {u._count.posts} posts · {u._count.gotFollows} followers</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setBadge(u.id, 'blue')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${u.verifiedType === 'blue' ? 'bg-blue-500 text-white' : 'bg-fam-bg text-fam-muted'}`}>🔵 Blue</button>
                <button onClick={() => setBadge(u.id, 'red')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${u.verifiedType === 'red' ? 'bg-rose-500 text-white' : 'bg-fam-bg text-fam-muted'}`}>🔴 Red</button>
                <button onClick={() => setBadge(u.id, 'green')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${u.verifiedType === 'green' ? 'bg-green-500 text-white' : 'bg-fam-bg text-fam-muted'}`}>🟢 Green</button>
                <button onClick={() => setBadge(u.id, '')} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fam-bg text-fam-muted">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ SWITCH ACCOUNT MODAL ============
function SwitchAccountModal({ currentMe, onClose, onSwitched, onLogout }: {
  currentMe: SessionUser
  onClose: () => void
  onSwitched: (u: SessionUser) => void
  onLogout: () => void
}) {
  const [accounts, setAccounts] = useState<SessionUser[]>([currentMe])
  const [showLogin, setShowLogin] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const addAccount = async () => {
    if (!username.trim() || !password) return
    setLoading(true)
    try {
      const d = await api('/api/auth/switch', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) })
      onSwitched(d.user)
    } catch (e: unknown) {
      // Show error inline
    } finally { setLoading(false) }
  }

  const removeAccount = (id: string) => {
    setAccounts((a) => a.filter((acc) => acc.id !== id))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Accounts</h3>
          <button onClick={onClose} className="text-fam-muted hover:text-fam-text"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        </div>

        {/* Current accounts list */}
        <div className="space-y-2 mb-4">
          {accounts.map((acc) => (
            <div key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl ${acc.id === currentMe.id ? 'bg-fam-purple/20 border border-fam-purple' : 'bg-fam-surface'}`}>
              <Avatar src={acc.avatarUrl} name={acc.displayName} size={40} />
              <div className="flex-1">
                <div className="text-sm font-semibold flex items-center gap-1">{acc.username}{acc.verified && <VerifiedBadge type={acc.verifiedType} />}</div>
                <div className="text-xs text-fam-muted">{acc.displayName}{acc.id === currentMe.id ? ' · Current' : ''}</div>
              </div>
              {acc.id !== currentMe.id && <button onClick={() => removeAccount(acc.id)} className="text-fam-muted hover:text-rose-400 p-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>}
            </div>
          ))}
        </div>

        {/* Add another account */}
        {showLogin ? (
          <div className="space-y-3 border-t border-fam-border pt-4">
            <Input label="Username or email" value={username} onChange={setUsername} placeholder="username" autoCapitalize="none" />
            <Input label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
            <button onClick={addAccount} disabled={loading} className="w-full py-2.5 rounded-xl fam-gradient text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <Spinner /> : 'Add account'}</button>
          </div>
        ) : (
          <button onClick={() => setShowLogin(true)} className="w-full py-2.5 rounded-xl bg-fam-surface border border-fam-border text-sm font-semibold flex items-center justify-center gap-2 mb-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
            Add another account
          </button>
        )}

        <button onClick={onLogout} className="w-full py-2.5 rounded-xl bg-rose-500/10 text-rose-400 text-sm font-semibold mt-2 flex items-center justify-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Log out
        </button>
      </div>
    </div>
  )
}

// ============ Incoming Call Overlay (shown when someone calls you) ============
// Polls /api/calls?incoming=1 every 3s for ringing calls where I'm the recipient.
// Shows caller avatar + Answer (green) / Decline (red) buttons.
// Answer → marks call as 'answered' via POST /api/calls/[id]/answer, then opens CallModal.
// Decline → marks call as 'missed' via PATCH /api/calls/[id]/answer, then dismisses.
function IncomingCallModal({ me, onAnswer, isApp }: { me: SessionUser; onAnswer: (call: { id: string; fromUser: Author; type: 'voice' | 'video' }) => void; isApp: boolean }) {
  const [incomingCall, setIncomingCall] = useState<{ id: string; fromUser: Author; type: 'voice' | 'video' } | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const ringtoneRef = useRef<{ stop: () => void } | null>(null)

  // Play WhatsApp-style ringtone when incoming call arrives
  const playIncomingRingtone = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const masterGain = audioCtx.createGain()
      masterGain.connect(audioCtx.destination)
      masterGain.gain.value = 0.4

      const scheduleRing = (startTime: number) => {
        // Tone 1 (1400Hz, 0.4s)
        const osc1 = audioCtx.createOscillator()
        const gain1 = audioCtx.createGain()
        osc1.connect(gain1); gain1.connect(masterGain)
        osc1.frequency.value = 1400; osc1.type = 'sine'
        gain1.gain.setValueAtTime(0, startTime)
        gain1.gain.linearRampToValueAtTime(0.6, startTime + 0.02)
        gain1.gain.setValueAtTime(0.6, startTime + 0.35)
        gain1.gain.linearRampToValueAtTime(0, startTime + 0.4)
        osc1.start(startTime); osc1.stop(startTime + 0.4)

        // Tone 2 (950Hz, 0.4s)
        const osc2 = audioCtx.createOscillator()
        const gain2 = audioCtx.createGain()
        osc2.connect(gain2); gain2.connect(masterGain)
        osc2.frequency.value = 950; osc2.type = 'sine'
        gain2.gain.setValueAtTime(0, startTime + 0.4)
        gain2.gain.linearRampToValueAtTime(0.6, startTime + 0.42)
        gain2.gain.setValueAtTime(0.6, startTime + 0.75)
        gain2.gain.linearRampToValueAtTime(0, startTime + 0.8)
        osc2.start(startTime + 0.4); osc2.stop(startTime + 0.8)
      }

      // Schedule repeating rings
      let time = audioCtx.currentTime
      for (let i = 0; i < 20; i++) { // 20 rings = ~40 seconds
        scheduleRing(time)
        time += 2.0
      }

      ringtoneRef.current = {
        stop: () => { try { masterGain.gain.value = 0; audioCtx.close() } catch {} }
      }
    } catch {}
  }

  const stopRingtone = () => {
    if (ringtoneRef.current) { ringtoneRef.current.stop(); ringtoneRef.current = null }
  }

  // Play ringtone when incoming call detected, stop when dismissed
  useEffect(() => {
    if (incomingCall) {
      playIncomingRingtone()
      // Trigger vibration on mobile (APK)
      if (navigator.vibrate) {
        navigator.vibrate([400, 200, 400, 200, 400, 200, 400, 200, 400, 200, 400, 200, 400, 200, 400])
      }
    } else {
      stopRingtone()
    }
    return () => stopRingtone()
  }, [incomingCall])

  // Poll for incoming calls every 2s (faster for less delay)
  useEffect(() => {
    if (!isApp) return
    let active = true
    const poll = async () => {
      if (!active || dismissing) return
      try {
        const d = await api('/api/calls?incoming=1') as { calls?: { id: string; type: string; status: string; fromUser: Author }[] }
        if (!active || dismissing) return
        const ringing = (d.calls || []).find(c => c.status === 'ringing')
        if (ringing && !incomingCall) {
          setIncomingCall({ id: ringing.id, fromUser: ringing.fromUser, type: ringing.type as 'voice' | 'video' })
        }
      } catch {}
    }
    poll()
    const t = setInterval(poll, 2000)
    return () => { active = false; clearInterval(t) }
  }, [isApp, incomingCall, dismissing])

  const handleAnswer = async () => {
    stopRingtone()
    if (!incomingCall) return
    setDismissing(true)
    try {
      await api(`/api/calls/${incomingCall.id}/answer`, { method: 'POST' })
      onAnswer(incomingCall)
    } catch {}
    setIncomingCall(null)
    setDismissing(false)
  }

  const handleDecline = async () => {
    stopRingtone()
    if (!incomingCall) return
    setDismissing(true)
    try {
      await api(`/api/calls/${incomingCall.id}/answer`, { method: 'PATCH' })
    } catch {}
    setIncomingCall(null)
    setDismissing(false)
  }

  if (!incomingCall) return null

  const caller = incomingCall.fromUser
  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between py-16 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(124,58,237,0.4) 0%, transparent 60%)' }} />

      {/* Top: "Incoming call" label */}
      <div className="relative z-10 text-center">
        <p className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-1">
          {incomingCall.type === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call'}
        </p>
        <p className="text-white/40 text-xs">Boboh Vibe</p>
      </div>

      {/* Middle: avatar + name */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="relative">
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)', animation: 'vibefam-success-pulse 1.5s ease-in-out infinite' }} />
          {caller.avatarUrl ? (
            <img src={caller.avatarUrl} alt="" className="relative w-32 h-32 rounded-full object-cover border-4 border-white/20" />
          ) : (
            <div className={`relative w-32 h-32 rounded-full flex items-center justify-center text-white font-bold text-5xl ${waAvatarClass(caller.username)}`}>
              {waInitial(caller.displayName || caller.username)}
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <h2 className="text-white text-2xl font-bold">{caller.displayName || caller.username}</h2>
            {caller.verified && <VerifiedBadge type={caller.verifiedType} size={20} />}
          </div>
          <p className="text-white/50 text-sm mt-1">@{caller.username}</p>
        </div>
      </div>

      {/* Bottom: Answer / Decline buttons */}
      <div className="relative z-10 flex gap-12">
        {/* Decline */}
        <button
          onClick={handleDecline}
          disabled={dismissing}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40 hover:scale-105 transition-transform active:scale-95">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span className="text-white/70 text-xs font-semibold">Decline</span>
        </button>

        {/* Answer */}
        <button
          onClick={handleAnswer}
          disabled={dismissing}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40 hover:scale-105 transition-transform active:scale-95 animate-bounce">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span className="text-white/70 text-xs font-semibold">Answer</span>
        </button>
      </div>
    </div>
  )
}

// ============ WebRTC Call Modal (real P2P voice/video calls) ============
function CallModal({ me, target, type, onClose, showToast, existingCallId }: {
  me: SessionUser
  target: Author
  type: 'voice' | 'video'
  onClose: () => void
  showToast: (m: string) => void
  existingCallId?: string  // If set, this is an ANSWERED call — don't create a new one
}) {
  const [status, setStatus] = useState<'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed'>(existingCallId ? 'connecting' : 'calling')
  const [callId, setCallId] = useState<string>('')
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(type === 'video')
  const [speakerEnabled, setSpeakerEnabled] = useState(true)
  const [callDuration, setCallDuration] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callIdRef = useRef<string>(existingCallId || '')

  // Ringtone — WhatsApp-style dual-tone ring (repeating)
  // WhatsApp's ringtone: two tones (950Hz + 1400Hz) in quick succession, then 2s silence, repeat
  const playRingtone = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const masterGain = audioCtx.createGain()
      masterGain.connect(audioCtx.destination)
      masterGain.gain.value = 0.3

      // Schedule repeating ring tones (WhatsApp pattern)
      let time = audioCtx.currentTime
      const scheduleRing = (startTime: number) => {
        // Tone 1 (higher pitch, 0.4s)
        const osc1 = audioCtx.createOscillator()
        const gain1 = audioCtx.createGain()
        osc1.connect(gain1)
        gain1.connect(masterGain)
        osc1.frequency.value = 1400
        osc1.type = 'sine'
        gain1.gain.setValueAtTime(0, startTime)
        gain1.gain.linearRampToValueAtTime(0.5, startTime + 0.02)
        gain1.gain.setValueAtTime(0.5, startTime + 0.35)
        gain1.gain.linearRampToValueAtTime(0, startTime + 0.4)
        osc1.start(startTime)
        osc1.stop(startTime + 0.4)

        // Tone 2 (lower pitch, 0.4s, starts right after tone 1)
        const osc2 = audioCtx.createOscillator()
        const gain2 = audioCtx.createGain()
        osc2.connect(gain2)
        gain2.connect(masterGain)
        osc2.frequency.value = 950
        osc2.type = 'sine'
        gain2.gain.setValueAtTime(0, startTime + 0.4)
        gain2.gain.linearRampToValueAtTime(0.5, startTime + 0.42)
        gain2.gain.setValueAtTime(0.5, startTime + 0.75)
        gain2.gain.linearRampToValueAtTime(0, startTime + 0.8)
        osc2.start(startTime + 0.4)
        osc2.stop(startTime + 0.8)
      }

      // Schedule 5 rings (covers ~10 seconds), then the interval will restart
      for (let i = 0; i < 5; i++) {
        scheduleRing(time)
        time += 2.0 // 0.8s ring + 1.2s silence = 2s total per cycle
      }

      // Keep ringing — restart every 10 seconds
      ringtoneRef.current = {
        stop: () => {
          try {
            masterGain.gain.value = 0
            audioCtx.close()
          } catch {}
        },
      } as unknown as HTMLAudioElement

      // Restart after 10 seconds if still ringing
      const restartInterval = setInterval(() => {
        if (status === 'ringing' || status === 'calling') {
          let t = audioCtx.currentTime
          for (let i = 0; i < 5; i++) {
            scheduleRing(t)
            t += 2.0
          }
        } else {
          clearInterval(restartInterval)
        }
      }, 10000)

    } catch (e) {
      // Audio context not available
    }
  }

  const stopRingtone = () => {
    if (ringtoneRef.current && typeof (ringtoneRef.current as unknown as { stop?: () => void }).stop === 'function') {
      (ringtoneRef.current as unknown as { stop: () => void }).stop()
    }
  }

  // Get local media stream (camera + mic)
  const getLocalStream = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Failed to access camera/mic'
      setErrorMsg(`Camera/Mic error: ${err}. Please grant permissions in your browser/APK settings.`)
      setStatus('failed')
      return null
    }
  }

  // Create WebRTC peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    pc.ontrack = (event) => {
      const [stream] = event.streams
      remoteStreamRef.current = stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
      if (status !== 'connected') {
        setStatus('connected')
        stopRingtone()
        startCallTimer()
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setStatus('ended')
        stopRingtone()
      }
    }

    return pc
  }

  const startCallTimer = () => {
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1)
    }, 1000)
  }

  // Initiate call (or join existing call if existingCallId is set)
  useEffect(() => {
    // Helper: wait for ICE gathering to complete (so all candidates are in the SDP)
    const waitForIce = (pc: RTCPeerConnection): Promise<void> => {
      return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', checkState)
        // Timeout after 3 seconds — don't block forever
        setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve() }, 3000)
      })
    }

    const initCall = async () => {
      // Get local media stream FIRST
      const stream = await getLocalStream()
      if (!stream) return

      // Create peer connection + add local tracks
      const pc = createPeerConnection()
      pcRef.current = pc
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      if (existingCallId) {
        // === ANSWERING an incoming call ===
        setCallId(existingCallId)
        callIdRef.current = existingCallId
        try { await api(`/api/calls/${existingCallId}/answer`, { method: 'POST' }) } catch {}
        setStatus('connecting')

        // Poll for the caller's SDP offer
        pollRef.current = setInterval(async () => {
          try {
            const callData = await api(`/api/calls/${callIdRef.current}`)
            if (callData.call.status === 'ended' || callData.call.status === 'missed') {
              setStatus('ended'); stopRingtone(); clearInterval(pollRef.current!); onClose(); return
            }
            if (callData.call.sdpOffer && pc.signalingState === 'stable') {
              clearInterval(pollRef.current!)
              // Set remote description (caller's offer)
              await pc.setRemoteDescription(JSON.parse(callData.call.sdpOffer))
              // Create answer
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              // Wait for ICE gathering
              await waitForIce(pc)
              // Send answer back to server
              await api(`/api/calls/${callIdRef.current}`, {
                method: 'PATCH',
                body: JSON.stringify({ sdpAnswer: JSON.stringify(pc.localDescription) }),
              })
              setStatus('connected'); stopRingtone(); startCallTimer()
              // Poll for call end
              pollRef.current = setInterval(async () => {
                try {
                  const d = await api(`/api/calls/${callIdRef.current}`)
                  if (d.call.status === 'ended' || d.call.status === 'missed') {
                    setStatus('ended'); stopRingtone(); clearInterval(pollRef.current!); onClose()
                  }
                } catch {}
              }, 3000)
            }
          } catch {}
        }, 1500)
        return
      }

      // === INITIATING a new call ===
      try {
        const d = await api('/api/calls', { method: 'POST', body: JSON.stringify({ toUsername: target.username, type }) })
        setCallId(d.call.id); callIdRef.current = d.call.id
      } catch { showToast('Failed to initiate call'); onClose(); return }

      playRingtone(); setStatus('ringing')

      // Create SDP offer + set as local description
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        // Wait for ICE gathering to complete (so all candidates are in the SDP)
        await waitForIce(pc)
        // Send offer (with ICE candidates) to server
        await api(`/api/calls/${callIdRef.current}`, {
          method: 'PATCH',
          body: JSON.stringify({ sdpOffer: JSON.stringify(pc.localDescription) }),
        })
      } catch {}

      // Poll for answer
      pollRef.current = setInterval(async () => {
        try {
          const callData = await api(`/api/calls/${callIdRef.current}`)
          if (callData.call.status === 'answered' && callData.call.sdpAnswer) {
            clearInterval(pollRef.current!)
            if (pc.signalingState !== 'stable') {
              await pc.setRemoteDescription(JSON.parse(callData.call.sdpAnswer))
            }
            setStatus('connected'); stopRingtone(); startCallTimer()
            pollRef.current = setInterval(async () => {
              try {
                const d = await api(`/api/calls/${callIdRef.current}`)
                if (d.call.status === 'ended' || d.call.status === 'missed') {
                  setStatus('ended'); stopRingtone(); clearInterval(pollRef.current!); onClose()
                }
              } catch {}
            }, 3000)
          } else if (callData.call.status === 'ended' || callData.call.status === 'missed') {
            setStatus('ended'); stopRingtone(); clearInterval(pollRef.current!); onClose()
          }
        } catch {}
      }, 1500)

      // Auto-end after 45s if no answer
      setTimeout(() => {
        if (status === 'ringing' || status === 'calling') {
          setStatus('ended'); stopRingtone()
          try { api(`/api/calls/${callIdRef.current}/answer`, { method: 'PATCH' }) } catch {}
          onClose()
        }
      }, 45000)
    }

    initCall()

    // Cleanup
    return () => {
      stopRingtone()
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (pcRef.current) {
        pcRef.current.close()
      }
    }
  }, [])

  const endCall = async () => {
    stopRingtone()
    if (timerRef.current) clearInterval(timerRef.current)
    if (pollRef.current) clearInterval(pollRef.current)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    if (pcRef.current) {
      pcRef.current.close()
    }
    if (callId) {
      try { await api(`/api/calls/${callId}/end`, { method: 'PATCH' }) } catch {}
    }
    setStatus('ended')
    setTimeout(onClose, 1500)
  }

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setMicEnabled(audioTrack.enabled)
      }
    }
  }

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setCameraEnabled(videoTrack.enabled)
      }
    }
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Remote video (full screen for video calls) */}
      {type === 'video' && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      )}

      {/* Local video (picture-in-picture) */}
      {type === 'video' && cameraEnabled && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-4 right-4 w-28 h-40 rounded-xl object-cover border-2 border-white/20 z-10"
          style={{ transform: 'scaleX(-1)' }}
        />
      )}

      {/* Top: status */}
      <div className="relative z-10 text-center pt-12">
        <div className="text-sm text-white/60 mb-2">{type === 'video' ? '📹 Video call' : '📞 Voice call'}</div>
        <div className="text-white text-lg font-semibold">
          {status === 'calling' && 'Connecting...'}
          {status === 'ringing' && 'Ringing...'}
          {status === 'connected' && formatDuration(callDuration)}
          {status === 'ended' && 'Call ended'}
          {status === 'failed' && 'Call failed'}
        </div>
        {errorMsg && <div className="text-rose-400 text-xs mt-2 max-w-xs mx-auto">{errorMsg}</div>}
      </div>

      {/* Center: avatar + name (for voice calls or when video not connected) */}
      {status !== 'connected' && (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10">
          <div className="relative mb-4">
            {target.avatarUrl ? (
              <img src={target.avatarUrl} alt="" className="w-32 h-32 rounded-full object-cover" />
            ) : (
              <div className={`w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-bold ${waAvatarClass(target.username)}`}>
                {waInitial(target.displayName || target.username)}
              </div>
            )}
            {status === 'ringing' && (
              <div className="absolute inset-0 rounded-full border-4 border-white/40 animate-ping" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            {target.displayName}
            {target.verified && <VerifiedBadge type={target.verifiedType} />}
          </h2>
          <p className="text-white/50">@{target.username}</p>
        </div>
      )}

      {/* Connected: show remote video (already full screen above) */}
      {status === 'connected' && (
        <div className="flex-1" />
      )}

      {/* Bottom: call controls */}
      <div className="relative z-10 pb-8 px-6">
        {/* Call controls row */}
        <div className="flex items-center justify-center gap-4 mb-4">
          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${micEnabled ? 'bg-white/15' : 'bg-white'}`}
            title={micEnabled ? 'Mute' : 'Unmute'}
          >
            {micEnabled ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            )}
          </button>

          {/* Camera toggle (video calls only) */}
          {type === 'video' && (
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${cameraEnabled ? 'bg-white/15' : 'bg-white'}`}
              title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {cameraEnabled ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23" /><path d="M21 21a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5" /><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          )}

          {/* Speaker toggle */}
          <button
            onClick={() => setSpeakerEnabled(!speakerEnabled)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${speakerEnabled ? 'bg-white/15' : 'bg-white'}`}
            title="Speaker"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={speakerEnabled ? 'white' : 'black'} strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
          </button>

          {/* End call */}
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors"
            title="End call"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)" /></svg>
          </button>
        </div>

        {/* Hint text */}
        {status === 'ringing' && (
          <p className="text-center text-white/40 text-xs">
            📳 Ringing... Waiting for {target.displayName} to answer.
          </p>
        )}
        {status === 'connected' && (
          <p className="text-center text-white/40 text-xs">
            ✅ Connected — {micEnabled ? 'Mic on' : 'Mic muted'}{type === 'video' ? (cameraEnabled ? ' · Camera on' : ' · Camera off') : ''}
          </p>
        )}
        {status === 'ended' && (
          <p className="text-center text-white/40 text-xs">
            Call ended. {callDuration > 0 ? `Duration: ${formatDuration(callDuration)}` : 'No answer.'}
          </p>
        )}
      </div>
    </div>
  )
}

