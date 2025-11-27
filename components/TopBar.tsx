'use client'

import { motion } from 'framer-motion'
import { MotionToggle } from './MotionToggle'
import ShareButton from './ShareButton'
import type { PuzzleDifficulty, PuzzleMode } from '@/types'

interface TopBarProps {
  puzzleNumber?: number
  date?: string
  wordsUsed: number
  layersExplored: number
  onGiveUp: () => void
  pathsFound: number
  mode: PuzzleMode
  onModeChange: (mode: PuzzleMode) => void
  difficulty: PuzzleDifficulty
  onDifficultyChange: (difficulty: PuzzleDifficulty) => void
  onGeneratePractice: () => void
  isGeneratingPractice: boolean
  isDaily: boolean
  parValue?: number
  // Sharing props
  startWord: string
  goalWord: string
  startTime: number
  isComplete: boolean
}

const difficultyLabels: Record<PuzzleDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

export default function TopBar({
  puzzleNumber,
  date,
  wordsUsed,
  layersExplored,
  onGiveUp,
  pathsFound,
  mode,
  onModeChange,
  difficulty,
  onDifficultyChange,
  onGeneratePractice,
  isGeneratingPractice,
  isDaily,
  parValue,
  startWord,
  goalWord,
  startTime,
  isComplete,
}: TopBarProps) {
  // Format date for display
  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-40"
    >
      <div className="bg-hive-dark/95 backdrop-blur-sm">
        <div className="w-full px-4 sm:px-6 py-3">
          <div className="relative flex items-center justify-between gap-4">
            {/* Left: Logo and puzzle info */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 relative">
                  <svg viewBox="0 0 32 32" className="w-full h-full">
                    <polygon
                      points="16,2 28,9 28,23 16,30 4,23 4,9"
                      fill="none"
                      stroke="#F4B400"
                      strokeWidth="2"
                      className="drop-shadow-lg"
                    />
                    <circle cx="16" cy="16" r="4" fill="#F4B400" />
                  </svg>
                </div>
                <h1 className="text-xl font-display font-bold text-gradient-gold hidden sm:block">
                  HiveLink
                </h1>
              </div>

              <div className="flex items-center gap-2 text-sm">
                {isDaily ? (
                  <>
                    <span className="bg-hive-graphite/80 px-3 py-1 rounded-full text-hive-yellow font-medium">
                      #{puzzleNumber}
                    </span>
                    {formattedDate && (
                      <span className="text-gray-400 hidden sm:inline">{formattedDate}</span>
                    )}
                  </>
                ) : (
                  <span className="bg-hive-yellow/10 text-hive-yellow px-3 py-1 rounded-full font-medium">
                    Practice
                  </span>
                )}
              </div>
            </div>

            {/* Center: Mode selector (Desktop) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:block">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase tracking-wide text-[10px]">Mode</span>
                <div className="flex rounded-full bg-hive-graphite/70 p-1 text-xs">
                  {(['daily', 'practice'] as PuzzleMode[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => onModeChange(option)}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        mode === option
                          ? 'bg-hive-yellow text-hive-dark'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {option === 'daily' ? 'Daily' : 'Practice'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Stats & Controls */}
            <div className="flex items-center gap-4 justify-end">
              {/* Practice Controls (Desktop) */}
              {mode === 'practice' && (
                <div className="hidden lg:flex items-center gap-2 text-sm mr-2">
                  <select
                    value={difficulty}
                    onChange={(event) => onDifficultyChange(event.target.value as PuzzleDifficulty)}
                    className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                  >
                    {(['easy', 'medium', 'hard'] as PuzzleDifficulty[]).map((level) => (
                      <option key={level} value={level}>
                        {difficultyLabels[level]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      void onGeneratePractice()
                    }}
                    disabled={isGeneratingPractice}
                    className="px-2 py-1 rounded-lg bg-hive-yellow text-hive-dark text-xs font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors whitespace-nowrap"
                  >
                    {isGeneratingPractice ? '...' : 'New'}
                  </button>
                  <div className="w-px h-6 bg-hive-graphite mx-1" />
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-3 sm:gap-6">
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

                <div className="w-px h-8 bg-hive-graphite" />

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

                {parValue && (
                  <>
                    <div className="w-px h-8 bg-hive-graphite" />
                    <div className="text-center">
                      <motion.div
                        key={parValue}
                        initial={{ scale: 1.2 }}
                        animate={{ scale: 1 }}
                        className="text-lg sm:text-xl font-bold text-hive-yellow"
                      >
                        {parValue}
                      </motion.div>
                      <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">
                        Target
                      </div>
                    </div>
                  </>
                )}

                {pathsFound === 0 && (
                  <>
                    <div className="w-px h-8 bg-hive-graphite hidden sm:block" />
                    <button
                      onClick={onGiveUp}
                      className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg
                                 bg-hive-graphite/50 hover:bg-hive-graphite/80 
                                 text-gray-400 hover:text-gray-200
                                 text-sm transition-colors"
                      title="Give Up"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                        />
                      </svg>
                      <span className="hidden sm:inline">Give Up</span>
                    </button>
                  </>
                )}

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

                <div className="w-px h-8 bg-hive-graphite hidden sm:block" />
                
                <ShareButton
                  puzzleNumber={puzzleNumber}
                  wordsUsed={wordsUsed}
                  layers={layersExplored}
                  status={isComplete ? 'won' : 'playing'}
                  timeElapsed={Date.now() - startTime}
                  startWord={startWord}
                  goalWord={goalWord}
                  isDaily={isDaily}
                  difficulty={difficulty}
                  compact
                />
              </div>
            </div>
          </div>

          {/* Mobile Controls */}
          <div className="lg:hidden flex flex-col gap-2 mt-3 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase tracking-wide text-[10px]">Mode</span>
                <div className="flex rounded-full bg-hive-graphite/70 p-1 text-xs">
                  {(['daily', 'practice'] as PuzzleMode[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => onModeChange(option)}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        mode === option
                          ? 'bg-hive-yellow text-hive-dark'
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {option === 'daily' ? 'Daily' : 'Practice'}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'practice' && (
                <div className="flex items-center gap-2">
                  <select
                    value={difficulty}
                    onChange={(event) => onDifficultyChange(event.target.value as PuzzleDifficulty)}
                    className="bg-hive-graphite/70 border border-hive-graphite rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-hive-yellow/50"
                  >
                    {(['easy', 'medium', 'hard'] as PuzzleDifficulty[]).map((level) => (
                      <option key={level} value={level}>
                        {difficultyLabels[level]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      void onGeneratePractice()
                    }}
                    disabled={isGeneratingPractice}
                    className="px-2 py-1 rounded-lg bg-hive-yellow text-hive-dark text-xs font-medium disabled:opacity-60 hover:bg-hive-gold transition-colors"
                  >
                    New
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}

