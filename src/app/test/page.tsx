'use client'
import { useState } from 'react'

export default function EmailTestPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const sendCode = async () => {
    if (!email.trim()) return
    setLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setCode(data.code || '')
        setSent(true)
        setResult('✅ Email sent! Code: ' + (data.code || '(check your email)'))
      } else {
        setResult('❌ Error: ' + (data.error || 'Unknown'))
      }
    } catch (e) {
      setResult('❌ Fetch error: ' + (e instanceof Error ? e.message : 'unknown'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0d', color: 'white', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>📧 Email Verification Test</h1>
        <p style={{ color: '#888', marginBottom: '32px' }}>Send a verification code to any email address</p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
          <input
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='someone@example.com'
            style={{ width: '100%', padding: '14px', background: '#1a1a1f', border: '1px solid #2a2a30', borderRadius: '12px', color: 'white', fontSize: '16px', outline: 'none' }}
          />
        </div>

        <button
          onClick={sendCode}
          disabled={loading || !email.trim()}
          style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', border: 'none', borderRadius: '14px', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', opacity: loading || !email.trim() ? 0.4 : 1 }}
        >
          {loading ? 'Sending...' : 'Send Verification Code'}
        </button>

        {result && (
          <div style={{ marginTop: '20px', padding: '16px', background: '#1a1a1f', borderRadius: '12px', border: '1px solid #2a2a30', fontSize: '14px' }}>
            {result}
          </div>
        )}

        {sent && code && (
          <div style={{ marginTop: '16px', padding: '20px', background: '#1a1020', borderRadius: '12px', border: '2px solid #7c3aed', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>VERIFICATION CODE</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', letterSpacing: '8px', color: '#d4af37' }}>{code}</div>
          </div>
        )}

        <div style={{ marginTop: '32px', padding: '16px', background: '#1a1a1f', borderRadius: '12px', fontSize: '13px', color: '#888', lineHeight: 1.6 }}>
          <strong style={{ color: '#aaa' }}>How it works:</strong><br />
          1. Enter any email address<br />
          2. Click send — a 6-digit code is emailed<br />
          3. The code also appears here (for testing)<br />
          4. User enters the code to verify their email<br /><br />
          <strong style={{ color: '#aaa' }}>Config:</strong><br />
          • Gmail SMTP: {process.env.NEXT_PUBLIC_GMAIL_STATUS || 'checking...'}<br />
          • Resend API: active (limited to owner email on free tier)
        </div>
      </div>
    </div>
  )
}
