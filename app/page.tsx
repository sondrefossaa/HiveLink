'use client'

import dynamic from 'next/dynamic'

// Dynamically import components that use browser APIs
const ParticleBackground = dynamic(() => import('@/components/ParticleBackground'), {
  ssr: false,
})

const Game = dynamic(() => import('@/components/Game'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 border-4 border-hive-yellow border-t-transparent rounded-full animate-spin" />
        <p className="text-hive-yellow text-lg">Loading HiveLink...</p>
      </div>
    </div>
  ),
})

export default function Home() {
  return (
    <main className="relative min-h-screen bg-hive-dark overflow-hidden">
      {/* Base gradient background - behind everything */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: `
            linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 50%, #0D0D0D 100%)
          `,
        }}
      />

      {/* Particle background with honeycomb, bubbles, and bees */}
      <ParticleBackground />

      {/* Game container */}
      <div className="relative z-10">
        <Game />
      </div>
    </main>
  )
}

