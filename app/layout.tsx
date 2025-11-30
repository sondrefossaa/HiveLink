import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { MotionPreferenceProvider } from '@/hooks/useMotionPreference'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HiveLink - Daily Compound Word Puzzle',
  description: 'Chain compound words from start to goal in this daily puzzle game. A new challenge every day!',
  keywords: ['puzzle', 'word game', 'compound words', 'daily puzzle', 'wordle', 'hivelink'],
  authors: [{ name: 'HiveLink' }],
  metadataBase: new URL('https://hivelink.buzz'),
  openGraph: {
    title: 'HiveLink - Daily Compound Word Puzzle',
    description: 'Chain compound words from start to goal in this daily puzzle game.',
    type: 'website',
    siteName: 'HiveLink',
    images: [
      {
        url: '/api/og',
        width: 1200,
        height: 630,
        alt: 'HiveLink - Daily Compound Word Puzzle',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HiveLink - Daily Compound Word Puzzle',
    description: 'Chain compound words from start to goal in this daily puzzle game.',
    images: ['/api/og'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D0D0D',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <meta name="google-adsense-account" content="ca-pub-6391311831202615"></meta>
      </head>
      <body className="font-sans antialiased bg-hive-dark text-white min-h-screen">
        <MotionPreferenceProvider>{children}</MotionPreferenceProvider>
      </body>
    </html>
  )
}

