import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

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
  openGraph: {
    title: 'HiveLink - Daily Compound Word Puzzle',
    description: 'Chain compound words from start to goal in this daily puzzle game.',
    type: 'website',
    siteName: 'HiveLink',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HiveLink - Daily Compound Word Puzzle',
    description: 'Chain compound words from start to goal in this daily puzzle game.',
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
      <body className="font-sans antialiased bg-hive-dark text-white min-h-screen">
        {children}
      </body>
    </html>
  )
}

