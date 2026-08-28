import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Boboh Vibe',
  description: 'Boboh Vibe — Share your vibe. Build your fam. Premium social network with live streaming, M-Pesa wallets, gifting, and more.',
  applicationName: 'Boboh Vibe',
  appleWebApp: {
    title: 'Boboh Vibe',
    capable: true,
    statusBarStyle: 'default',
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
