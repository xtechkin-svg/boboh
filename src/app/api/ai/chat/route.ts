import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// Get AI chat history
export async function GET() {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const chats = await db.aiChat.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  return NextResponse.json({ chats })
}

// Try Google Gemini API (free tier — 15 req/min, 1500/day)
// Requires GEMINI_API_KEY env var
async function tryGemini(messages: { role: string; content: string }[], userText: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.log('[VibeFam AI] No GEMINI_API_KEY set')
    return null
  }

  try {
    // Convert to Gemini format
    const contents = messages.slice(1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    const systemPrompt = messages[0]?.content || ''
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1000,
      },
    }

    console.log('[VibeFam AI] Calling Gemini with', contents.length, 'messages')

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    console.log('[VibeFam AI] Gemini response status:', res.status)

    if (!res.ok) {
      const err = await res.text()
      console.error('[VibeFam AI] Gemini error:', res.status, err.slice(0, 300))
      return null
    }

    const data = await res.json()
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
    console.log('[VibeFam AI] Gemini reply:', reply ? reply.slice(0, 100) : 'EMPTY')
    return reply && reply.trim() ? reply.trim() : null
  } catch (e: unknown) {
    console.error('[VibeFam AI] Gemini fetch error:', e instanceof Error ? e.message : 'unknown')
    return null
  }
}

// Try z-ai SDK (works within z.ai platform)
async function tryZaiSDK(messages: { role: string; content: string }[]): Promise<string | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: messages as { role: 'assistant' | 'user'; content: string }[],
      thinking: { type: 'disabled' },
    })
    const reply = completion.choices[0]?.message?.content || ''
    return reply.trim() ? reply : null
  } catch {
    return null
  }
}

// Fetch from Wikipedia API for knowledge questions
async function searchWikipedia(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`
    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()
    const results = searchData?.query?.search
    if (!results || results.length === 0) return null

    const title = results[0].title
    const extractUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const extractRes = await fetch(extractUrl)
    const extractData = await extractRes.json()

    if (extractData?.extract) {
      return `${extractData.extract}\n\n📚 Source: Wikipedia - ${title}`
    }
    return null
  } catch {
    return null
  }
}

// Evaluate math expressions safely
function tryMath(text: string): string | null {
  const mathMatch = text.match(/(?:what is|what's|calculate|compute|solve)\s+(.+?)[\?]?$/i)
  const expr = mathMatch ? mathMatch[1] : text
  const cleaned = expr.replace(/[^0-9+\-*/().\s]/g, '').trim()
  if (!cleaned || !/[0-9]/.test(cleaned) || !/[+\-*/]/.test(cleaned)) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${cleaned})`)()
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return `${expr.trim()} = **${result}** 🧮`
    }
  } catch {
    // not valid math
  }
  return null
}

// Knowledge-based fallback
function knowledgeFallback(text: string, userName: string): string {
  const t = text.trim().toLowerCase()

  if (/^(hello|hi|hey|hola|habari|sasa|niaje)\b/.test(t)) {
    const greetings = [
      `Hey ${userName}! 👋 What's on your mind? I can chat about anything — science, history, tech, life, or VibeFam features. Ask me anything!`,
      `Hi ${userName}! 😊 I'm VibeFam AI. I can help with general knowledge, math, definitions, and of course VibeFam features. What would you like to know?`,
      `Hello! 👋 Ask me anything — I'll do my best to help. I know about science, geography, math, programming, and more!`,
    ]
    return greetings[Math.floor(Math.random() * greetings.length)]
  }

  if (/how are you|how's it going|what's up|sup\b/.test(t)) {
    return `I'm doing great, thanks for asking! 😄 I'm always here and ready to help. What can I do for you today?`
  }

  if (/who are you|what are you|your name|about you/.test(t)) {
    return `I'm **VibeFam AI** 🤖 — your AI assistant inside the VibeFam social network. I can answer questions about almost anything: science, history, math, programming, geography, and more. I can also help you with VibeFam features like posting, following, wallet, live streaming, and more. Think of me as your personal ChatGPT built right into VibeFam!`
  }

  if (/thank|thanks|asante|appreciate/.test(t)) {
    return `You're welcome! 😊 Anything else I can help with?`
  }

  if ((t.includes('how') || t.includes('how to')) && (t.includes('post') || t.includes('upload'))) {
    return '📝 **To create a post:**\n1. Tap the **+** button in the bottom nav\n2. Type your text in "What\'s on your mind?"\n3. Optionally tap **Photo** or **Video** to attach media\n4. Add a location if you want\n5. Tap **Post**\n\nYou can post text-only, photo+text, or video+text!'
  }
  if (t.includes('wallet') || t.includes('topup') || t.includes('top up') || t.includes('mpesa')) {
    return '💰 **Wallet & M-Pesa:**\n1. Go to **Profile → Wallet**\n2. Tap **Top up via M-Pesa**\n3. Enter amount and your M-Pesa phone number\n4. Enter your M-Pesa PIN when you get the STK push\n5. Money appears instantly after confirmation\n\nYou can use your wallet to send gifts, tip live streamers, or withdraw to M-Pesa!'
  }
  if (t.includes('gift')) {
    return '🎁 **Sending gifts:**\n- Visit a user\'s profile → tap **🎁 Gift**\n- Or tap the gift icon in a DM chat\n- Or send gifts during live streams\n\nGifts are sent from your main wallet balance.'
  }
  if (t.includes('live')) {
    return '🎥 **Going live:**\n1. Open hamburger menu (☰) → **Go Live**\n2. Tap **Go Live** button\n3. Viewers can tap to send likes and gifts\n4. Gifts go to your live wallet\n5. Withdraw to M-Pesa once you have 500+ followers'
  }
  if (t.includes('follow')) {
    return '👥 **Following:**\n- Visit anyone\'s profile → tap **Follow**\n- Their posts appear in your feed\n- You can also see their stories\n\nNote: The main feed shows ALL public posts (like Facebook), so you\'ll see posts from people you don\'t follow too!'
  }
  if (t.includes('verified') || t.includes('badge')) {
    return '✅ **Getting verified:**\n1. Tap **Get Verified** on your profile\n2. This opens a DM with @vibefam\n3. Send your request\n4. An admin will review and assign a badge\n\nBadges: 🔵 Blue (general), 🟢 Green (premium), 🔴 Red (special), ⚫ Black (elite)'
  }
  if (t.includes('cover')) {
    return '🖼️ **Cover photo:**\n1. Go to your profile\n2. Tap **Upload cover** on the cover area\n3. Select a photo from your device\n4. It\'s saved instantly!\n\nYour cover photo is visible to everyone who visits your profile.'
  }
  if (t.includes('comment')) {
    return '💬 **Comments:**\n- Tap **Comment** on any post to open the full comments view\n- Write your comment and tap send\n- You can like and reply to other comments\n- Comments appear in real-time'
  }
  if (t.includes('group')) {
    return '👥 **Groups:**\n1. Tap the groups icon in the bottom nav\n2. Tap **+** to create a group, or **join** with an invite code\n3. Share the invite link so others can join\n4. Group features: chat, voice chat, media gallery, chat lock, Hall of Fame'
  }
  if (t.includes('dm') || t.includes('message') || t.includes('direct message') || t.includes('voice note')) {
    return '💬 **Direct Messages:**\n1. Tap the DM icon in the bottom nav\n2. Tap the pencil icon to start a new chat\n3. Enter a username and start chatting\n\nDMs support text, replies, link previews, voice notes (hold the mic button to record), and more!'
  }
  if (t.includes('ban') || t.includes('banned') || t.includes('appeal')) {
    return '⚠️ **If your account is banned:**\n1. You\'ll see a banned screen when you log in\n2. Tap **Request a review** to submit an appeal\n3. Admins review appeals within 24 hours\n4. If approved, you\'re unbanned. If rejected, the ban becomes permanent.\n\nContact @vibefam for support.'
  }
  if (t.includes('call')) {
    return '📞 **Voice & Video Calls:**\n- Open a DM chat with anyone\n- Tap the phone icon for a voice call, or the video icon for a video call\n- Calls use WebRTC — real peer-to-peer calling with camera + microphone\n- Ringtone plays while calling\n- Works best in the VibeFam APK (full camera + mic access)'
  }

  if (t.includes('joke') || t.includes('funny') || t.includes('make me laugh')) {
    const jokes = [
      'Why don\'t programmers like nature? It has too many bugs. 🐛',
      'Why did the developer go broke? Because he used up all his cache. 💸',
      'I told my computer I needed a break, and it said "No problem — I\'ll go to sleep." 😴',
      'Why do Java developers wear glasses? Because they don\'t C#. 👓',
      'What\'s a programmer\'s favorite hangout place? The Foo Bar. 🍺',
    ]
    return jokes[Math.floor(Math.random() * jokes.length)]
  }

  if (t.includes('time') || t.includes('date') || t.includes('day')) {
    const now = new Date()
    return `📅 It's currently **${now.toLocaleString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}**`
  }

  return `I'm not sure about that one, but I'm always learning! 🤔\n\nHere's what I CAN help with:\n• **General knowledge** — ask me about capitals, definitions, facts\n• **Math** — ask me to calculate anything\n• **VibeFam features** — posting, following, wallet, gifts, live, groups, DMs, badges, covers, calls, voice notes\n• **Jokes** — ask for a joke! 😄\n• **Time & date**\n\nWhat would you like to know?`
}

// Send a message to VibeFam AI
export async function POST(req: NextRequest) {
  const me = await getSession()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { text } = body
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  // Save user message
  await db.aiChat.create({ data: { userId: me.id, role: 'user', text: text.trim() } })

  // Get conversation history (last 20 messages)
  const history = await db.aiChat.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  const systemPrompt = `You are VibeFam AI, a knowledgeable AI assistant integrated into the VibeFam social network. You are like ChatGPT — you can answer ANY question about ANY topic. You know about science, history, mathematics, programming, current events, creative writing, philosophy, health, relationships, and everything else. You're conversational, helpful, and engaging. Use emojis occasionally. Be concise but thorough. When asked about VibeFam features, help with: posting (text/photo/video), following, DMs, groups, live streaming, wallet (M-Pesa), gifts, badges, cover photos, voice notes, calls, and more.`

  const messages: { role: string; content: string }[] = [
    { role: 'assistant', content: systemPrompt },
    ...history.map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
  ]

  let aiReply = ''

  // 1. Try Google Gemini (real LLM, ChatGPT-like)
  const geminiReply = await tryGemini(messages, text)
  if (geminiReply) {
    aiReply = geminiReply
  } else {
    // 2. Try z-ai SDK (works within z.ai platform)
    const sdkReply = await tryZaiSDK(messages)
    if (sdkReply) {
      aiReply = sdkReply
    } else {
      // 3. Try math
      const mathResult = tryMath(text)
      if (mathResult) {
        aiReply = mathResult
      } else {
        // 4. Check pattern-based responses FIRST (greetings, jokes, VibeFam help)
        const t = text.trim().toLowerCase()
        const isGreeting = /^(hello|hi|hey|hola|habari|sasa|niaje)\b/.test(t)
        const isHowAreYou = /how are you|how's it going|what's up|sup\b/.test(t)
        const isWhoAreYou = /who are you|what are you|your name|about you/.test(t)
        const isThanks = /thank|thanks|asante|appreciate/.test(t)
        const isJoke = /joke|funny|make me laugh/.test(t)
        const isTimeDate = /\b(time|date|day)\b/.test(t) && t.length < 30
        const isVibeFamQuestion = /post|upload|wallet|topup|mpesa|gift|live|follow|verified|badge|cover|comment|group|dm|direct message|ban|appeal|call|voice note/.test(t)

        if (isGreeting || isHowAreYou || isWhoAreYou || isThanks || isJoke || isTimeDate || isVibeFamQuestion) {
          aiReply = knowledgeFallback(text, me.displayName || me.username)
        } else {
          // 5. Try Wikipedia for knowledge questions
          const searchQuery = text
            .replace(/^(what is|what's|who is|who's|tell me about|define|explain|describe)\s+/i, '')
            .replace(/\?$/, '')
            .trim()
          if (searchQuery.length > 2) {
            const wikiResult = await searchWikipedia(searchQuery)
            if (wikiResult) {
              aiReply = wikiResult
            } else {
              aiReply = knowledgeFallback(text, me.displayName || me.username)
            }
          } else {
            aiReply = knowledgeFallback(text, me.displayName || me.username)
          }
        }
      }
    }
  }

  // Save AI response
  await db.aiChat.create({ data: { userId: me.id, role: 'assistant', text: aiReply } })

  return NextResponse.json({ reply: aiReply })
}
