'use client'

import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import ShareButton from './ShareButton'
import type { GameStats, PuzzleDifficulty } from '@/types'
import { useMotionPreference } from '@/hooks/useMotionPreference'

interface VictoryModalProps {
  isOpen: boolean
  stats: GameStats
  puzzleNumber?: number
  onClose: () => void
  onContinue: () => void
  onTryAgain: () => void
  path: string[]
  pathsFound: number
  isDaily: boolean
  parValue?: number
  // Sharing props
  startWord: string
  goalWord: string
  difficulty?: PuzzleDifficulty
}

export default function VictoryModal({
  isOpen,
  stats,
  puzzleNumber,
  onClose,
  onContinue,
  onTryAgain,
  path,
  pathsFound,
  isDaily,
  parValue,
  startWord,
  goalWord,
  difficulty,
}: VictoryModalProps) {
  const [showDetails, setShowDetails] = useState(false)
  const { effectivePreference } = useMotionPreference()

  // Trigger confetti on open
  useEffect(() => {
    if (!isOpen || effectivePreference === 'reduced') {
      return
    }

    const duration = 3000
    const animationEnd = Date.now() + duration

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        window.clearInterval(interval)
        return
      }

      if (typeof document !== 'undefined' && document.hidden) {
        return
      }

      const particleCount = 50 * (timeLeft / duration)

      const sharedConfig = {
        startVelocity: 30,
        spread: 60,
        colors: ['#F4B400', '#FFB800', '#E6A100', '#22c55e', '#ffffff'],
        shapes: ['circle', 'square'] as ('circle' | 'square')[],
        ticks: 200,
      }

      confetti({
        particleCount: Math.floor(particleCount / 2),
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        ...sharedConfig,
      })

      confetti({
        particleCount: Math.floor(particleCount / 2),
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        ...sharedConfig,
      })
    }, 250)

    return () => window.clearInterval(interval)
  }, [effectivePreference, isOpen])

  // Format time
  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`
  }, [])

  // Calculate performance rating
  const getPerformanceRating = useCallback(() => {
    const optimal = stats.optimalSteps || stats.wordsUsed
    const ratio = stats.wordsUsed / optimal

    if (ratio <= 1) return { emoji: '🏆', text: 'Perfect!', color: 'text-yellow-400' }
    if (ratio <= 1.2) return { emoji: '⭐', text: 'Excellent!', color: 'text-green-400' }
    if (ratio <= 1.5) return { emoji: '👍', text: 'Great!', color: 'text-blue-400' }
    if (ratio <= 2) return { emoji: '✓', text: 'Good', color: 'text-gray-400' }
    return { emoji: '📚', text: 'Completed', color: 'text-gray-500' }
  }, [stats])

  const rating = getPerformanceRating()

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md max-h-[90vh] bg-hive-charcoal rounded-2xl 
                       border border-hive-graphite shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header glow */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-hive-yellow/10 to-transparent pointer-events-none z-0" />

            {/* Content - scrollable */}
            <div className="relative p-6 pb-0 overflow-y-auto flex-1 min-h-0">
              {/* Trophy icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', delay: 0.2, damping: 15 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full 
                          bg-gradient-to-br from-hive-yellow to-hive-amber
                          flex items-center justify-center shadow-hive-glow-lg"
              >
                <span className="text-4xl">{rating.emoji}</span>
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-center text-white mb-1"
              >
                Puzzle Solved!
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className={`text-center font-medium ${rating.color} mb-2`}
              >
                {rating.text}
              </motion.p>

              {!isDaily && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="mb-4 px-3 py-2 rounded-xl bg-hive-yellow/10 text-hive-yellow text-sm text-center"
                >
                  Practice game · Does not count toward streak or stats
                </motion.div>
              )}

              {parValue && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-center text-sm text-gray-300 mb-2"
                >
                  Par: {parValue} words
                </motion.p>
              )}

              {/* Multiple paths indicator */}
              {pathsFound > 1 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  className="text-center text-sm text-gray-400 mb-6"
                >
                  {pathsFound} paths found! Keep exploring to find more.
                </motion.p>
              )}

              {/* Stats grid */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-3 gap-4 mb-6"
              >
                <div className="text-center p-3 rounded-xl bg-hive-dark/50">
                  <div className="text-2xl font-bold text-hive-yellow">
                    {stats.wordsUsed}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Words
                  </div>
                </div>
                <div className="text-center p-3 rounded-xl bg-hive-dark/50">
                  <div className="text-2xl font-bold text-hive-yellow">
                    {stats.layersExplored}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Layers
                  </div>
                </div>
                <div className="text-center p-3 rounded-xl bg-hive-dark/50">
                  <div className="text-2xl font-bold text-hive-yellow">
                    {formatTime(stats.timeElapsed)}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Time
                  </div>
                </div>
              </motion.div>

              {/* Optimal comparison */}
              {stats.optimalSteps && stats.wordsUsed > stats.optimalSteps && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-center text-sm text-gray-400 mb-6"
                >
                  Optimal solution: {stats.optimalSteps} words
                </motion.p>
              )}

              {/* Path toggle */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                onClick={() => setShowDetails(!showDetails)}
                className="w-full py-2 text-sm text-gray-400 hover:text-white
                          flex items-center justify-center gap-2 transition-colors"
              >
                <span>{showDetails ? 'Hide' : 'Show'} your path</span>
                <motion.svg
                  animate={{ rotate: showDetails ? 180 : 0 }}
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </motion.svg>
              </motion.button>

              {/* Path display */}
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="py-4 flex flex-wrap items-center justify-center gap-2">
                      {path.map((word, index) => (
                        <span key={index} className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-sm
                                       ${index === 0 ? 'bg-hive-yellow text-hive-dark font-medium' : ''}
                                       ${index === path.length - 1 ? 'bg-green-500 text-white font-medium' : ''}
                                       ${index > 0 && index < path.length - 1 ? 'bg-hive-graphite text-gray-300' : ''}`}
                          >
                            {word}
                          </span>
                          {index < path.length - 1 && (
                            <span className="text-hive-yellow">→</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* Actions - fixed at bottom */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="relative z-10 p-6 pt-4 border-t border-hive-graphite/50 bg-hive-charcoal"
            >
              <div className="flex gap-3 mb-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-hive-graphite hover:bg-hive-slate
                            text-white font-medium transition-colors"
                >
                  Close
                </button>
                <ShareButton
                  puzzleNumber={puzzleNumber}
                  wordsUsed={stats.wordsUsed}
                  layers={stats.layersExplored}
                  status="won"
                  timeElapsed={stats.timeElapsed}
                  startWord={startWord}
                  goalWord={goalWord}
                  isDaily={isDaily}
                  difficulty={difficulty}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onContinue}
                  className="flex-1 py-3 rounded-xl bg-hive-yellow hover:bg-hive-gold
                            text-hive-dark font-medium transition-colors shadow-hive-glow
                            flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Continue Playing
                </button>
                <button
                  onClick={onTryAgain}
                  className="flex-1 py-3 rounded-xl bg-hive-yellow/10 hover:bg-hive-yellow/20
                            text-hive-yellow font-medium transition-colors border border-hive-yellow/30
                            flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

