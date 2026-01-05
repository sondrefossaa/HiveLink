import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Background from "@/components/ParticleBackground";
import TopBar from "@/components/TopBar";
import { Suspense } from 'react';
import LoadingScreen from "./loading";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={<LoadingScreen />}>
          <TopBar />
          {children}
          <Background />
        </Suspense >

      </body>
    </html>
  );
}
