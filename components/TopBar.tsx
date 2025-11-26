'use client'

import { motion } from 'framer-motion'

interface TopBarProps {
  puzzleNumber: number
  date: string
  wordsUsed: number
  layersExplored: number
  onGiveUp: () => void
  onReset?: () => void
  pathsFound: number
}

export default function TopBar({
  puzzleNumber,
  date,
  wordsUsed,
  layersExplored,
  onGiveUp,
  onReset,
  pathsFound,
}: TopBarProps) {
  // Format date for display
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-hive-dark via-hive-dark/95 to-transparent"
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo and puzzle info */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 relative">
                <svg viewBox="0 0 32 32" className="w-full h-full">
                  {/* Hexagon */}
                  <polygon
                    points="16,2 28,9 28,23 16,30 4,23 4,9"
                    fill="none"
                    stroke="#F4B400"
                    strokeWidth="2"
                    className="drop-shadow-lg"
                  />
                  {/* Inner honeycomb pattern */}
                  <circle cx="16" cy="16" r="4" fill="#F4B400" />
                </svg>
              </div>
              <h1 className="text-xl font-display font-bold text-gradient-gold hidden sm:block">
                HiveLink
              </h1>
            </div>

            {/* Puzzle info */}
            <div className="flex items-center gap-2 text-sm">
              <span className="bg-hive-graphite/80 px-3 py-1 rounded-full text-hive-yellow font-medium">
                #{puzzleNumber}
              </span>
              <span className="text-gray-400 hidden sm:inline">{formattedDate}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Words used */}
            <div className="text-center">
              <motion.div
                key={wordsUsed}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-lg sm:text-xl font-bold text-white"
              >
                {wordsUsed}
              </motion.div>
              <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                Words
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-hive-graphite" />

            {/* Layers explored */}
            <div className="text-center">
              <motion.div
                key={layersExplored}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-lg sm:text-xl font-bold text-white"
              >
                {layersExplored}
              </motion.div>
              <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                Layers
              </div>
            </div>

            {/* Give up button */}
            {pathsFound === 0 && (
              <>
                <div className="w-px h-8 bg-hive-graphite hidden sm:block" />
                <button
                  onClick={onGiveUp}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg
                             bg-hive-graphite/50 hover:bg-hive-graphite/80 
                             text-gray-400 hover:text-gray-200
                             text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                    />
                  </svg>
                  <span>Give Up</span>
                </button>
              </>
            )}

            {/* Paths found badge */}
            {pathsFound > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                           bg-green-500/20 border border-green-500/30 text-green-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-sm font-medium">
                  {pathsFound} {pathsFound === 1 ? 'path' : 'paths'} found
                </span>
              </motion.div>
            )}

            {/* Reset button - always visible in top right */}
            {onReset && (
              <>
                <div className="w-px h-8 bg-hive-graphite" />
                <button
                  onClick={onReset}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                             bg-hive-graphite/50 hover:bg-hive-graphite/80 
                             text-gray-400 hover:text-gray-200
                             text-sm transition-colors"
                  aria-label="Reset game"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  )
}

