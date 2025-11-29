'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import ShareButton from './ShareButton'
import type { GameStats, PuzzleDifficulty, AverageStats } from '@/types'
import { useMotionPreference } from '@/hooks/useMotionPreference'
import { getPlayerId } from '@/lib/player-id'

interface VictoryModalProps {
  isOpen: boolean
  stats: GameStats
  puzzleNumber?: number
  puzzleDate?: string
  onClose: () => void
  onContinue: () => void
  onTryAgain: () => void
  allPaths: string[][]
  isDaily: boolean
  parValue?: number
  // Sharing props
  startWord: string
  goalWord: string
  difficulty?: PuzzleDifficulty
}

// Helper to generate OG image URL
function generateOgImageUrl(
  status: 'won' | 'gave-up' | 'playing',
  startWord: string,
  goalWord: string,
  wordsUsed: number,
  layers: number,
  timeElapsed: number,
  isDaily: boolean,
  puzzleNumber?: number,
  difficulty?: PuzzleDifficulty
) {
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const baseUrl = '/api/og'
  const params = new URLSearchParams()
  
  params.set('status', status)
  params.set('start', startWord)
  params.set('goal', goalWord)
  params.set('words', wordsUsed.toString())
  params.set('layers', layers.toString())
  params.set('time', formatTime(timeElapsed))
  
  if (isDaily && puzzleNumber) {
    params.set('puzzle', puzzleNumber.toString())
  } else if (difficulty) {
    params.set('difficulty', difficulty)
  }
  
  return `${baseUrl}?${params.toString()}`
}

export default function VictoryModal({
  isOpen,
  stats,
  puzzleNumber,
  onClose,
  onContinue,
  onTryAgain,
  allPaths,
  isDaily,
  parValue,
  startWord,
  goalWord,
  difficulty,
  puzzleDate,
}: VictoryModalProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'copied' | 'downloaded' | 'error'>('idle')
  const { effectivePreference } = useMotionPreference()
  
  // Cached average stats - only fetch once per puzzle
  const [averageStats, setAverageStats] = useState<AverageStats | null>(null)
  const [loadingAverages, setLoadingAverages] = useState(false)
  const fetchedPuzzleRef = useRef<string | null>(null)

  // Get the first/best path for sharing
  const path = allPaths[0] || []
  const pathsFound = allPaths.length

  // Get the OG image URL
  const ogImageUrl = generateOgImageUrl(
    'won',
    startWord,
    goalWord,
    stats.wordsUsed,
    stats.layersExplored,
    stats.timeElapsed,
    isDaily,
    puzzleNumber,
    difficulty
  )

  // Copy image to clipboard
  const handleCopyImage = useCallback(async () => {
    setImageStatus('loading')
    try {
      const response = await fetch(ogImageUrl)
      if (!response.ok) throw new Error('Failed to fetch image')
      const blob = await response.blob()
      const pngBlob = blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' })
      
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        const clipboardItem = new ClipboardItem({
          'image/png': Promise.resolve(pngBlob),
        })
        await navigator.clipboard.write([clipboardItem])
        setImageStatus('copied')
        setTimeout(() => setImageStatus('idle'), 2000)
      } else {
        throw new Error('Clipboard API not supported')
      }
    } catch (err) {
      console.error('Failed to copy image:', err)
      setImageStatus('error')
      setTimeout(() => setImageStatus('idle'), 2000)
    }
  }, [ogImageUrl])

  // Download image
  const handleDownloadImage = useCallback(async () => {
    setImageStatus('loading')
    try {
      const response = await fetch(ogImageUrl)
      if (!response.ok) throw new Error('Failed to fetch image')
      const blob = await response.blob()
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hivelink-${isDaily ? `puzzle-${puzzleNumber}` : 'practice'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setImageStatus('downloaded')
      setTimeout(() => setImageStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to download image:', err)
      setImageStatus('error')
      setTimeout(() => setImageStatus('idle'), 2000)
    }
  }, [ogImageUrl, isDaily, puzzleNumber])

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

  // Fetch community averages when modal opens (cached per puzzle)
  useEffect(() => {
    if (!isOpen || !isDaily) return
    if (!puzzleDate) return
    if (fetchedPuzzleRef.current === puzzleDate) return // Already fetched for this puzzle
    
    const fetchAverages = async () => {
      setLoadingAverages(true)
      try {
        const playerId = getPlayerId()
        const params = new URLSearchParams({ playerId })
        params.set('date', puzzleDate)

        const response = await fetch(`/api/leaderboard/today?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data.averageStats) {
            setAverageStats(data.data.averageStats)
            fetchedPuzzleRef.current = puzzleDate
          }
        }
      } catch (error) {
        console.error('Failed to fetch averages:', error)
      } finally {
        setLoadingAverages(false)
      }
    }
    
    fetchAverages()
  }, [isOpen, isDaily, puzzleDate])

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

  if (ratio <= 1) return { emoji: '👑', text: 'Hive Queen!', color: 'text-yellow-400' }
  if (ratio <= 1.2) return { emoji: '🐝', text: 'Forager Bee', color: 'text-green-400' }
  if (ratio <= 1.5) return { emoji: '🍯', text: 'Courting Drone', color: 'text-blue-400' }
  if (ratio <= 2) return { emoji: '🌸', text: 'Nectar Scout', color: 'text-purple-400' }
  return { emoji: '🐛', text: 'Hive Helper', color: 'text-gray-500' }
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
                  <div className="text-xl font-bold text-hive-yellow">
                    {formatTime(stats.timeElapsed)}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Time
                  </div>
                </div>
              </motion.div>

              {/* Community comparison */}
              {isDaily && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="mb-6 p-4 rounded-xl bg-hive-dark/30 border border-hive-graphite/50"
                >
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-3 text-center">
                    Community Average
                  </div>
                  {loadingAverages ? (
                    <div className="flex justify-center">
                      <div className="w-5 h-5 border-2 border-hive-yellow/30 border-t-hive-yellow rounded-full animate-spin" />
                    </div>
                  ) : averageStats ? (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-lg font-semibold text-gray-300">
                            {averageStats.avgWordsUsed.toFixed(1)}
                          </span>
                          {stats.wordsUsed < averageStats.avgWordsUsed ? (
                            <span className="text-green-400 text-sm">↓</span>
                          ) : stats.wordsUsed > averageStats.avgWordsUsed ? (
                            <span className="text-red-400 text-sm">↑</span>
                          ) : (
                            <span className="text-gray-400 text-sm"></span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">Words</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-lg font-semibold text-gray-300">
                            {averageStats.avgLayers.toFixed(1)}
                          </span>
                          {stats.layersExplored < averageStats.avgLayers ? (
                            <span className="text-green-400 text-sm">↓</span>
                          ) : stats.layersExplored > averageStats.avgLayers ? (
                            <span className="text-red-400 text-sm">↑</span>
                          ) : (
                            <span className="text-gray-400 text-sm">=</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">Layers</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-lg font-semibold text-gray-300">
                            {averageStats.avgTimeElapsed 
                              ? formatTime(averageStats.avgTimeElapsed) 
                              : '—'}
                          </span>
                          {averageStats.avgTimeElapsed && stats.timeElapsed < averageStats.avgTimeElapsed ? (
                            <span className="text-green-400 text-sm">↓</span>
                          ) : averageStats.avgTimeElapsed && stats.timeElapsed > averageStats.avgTimeElapsed ? (
                            <span className="text-red-400 text-sm">↑</span>
                          ) : averageStats.avgTimeElapsed ? (
                            <span className="text-gray-400 text-sm">=</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-500">Time</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-gray-500">
                      Be the first to complete today&apos;s puzzle!
                    </div>
                  )}
                  {averageStats && averageStats.totalPlayers > 0 && (
                    <div className="text-xs text-gray-500 text-center mt-2">
                      {averageStats.totalPlayers} player{averageStats.totalPlayers !== 1 ? 's' : ''} today
                    </div>
                  )}
                </motion.div>
              )}

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
                    <div className="py-4 space-y-4">
                      {allPaths.map((singlePath, pathIndex) => (
                        <div key={pathIndex} className="space-y-2">
                          {allPaths.length > 1 && (
                            <div className="text-xs text-gray-500 uppercase tracking-wide text-center">
                              Path {pathIndex + 1} ({singlePath.length - 1} steps)
                            </div>
                          )}
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {singlePath.map((word, index) => (
                              <span key={index} className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-1 rounded text-sm
                                             ${index === 0 ? 'bg-hive-yellow text-hive-dark font-medium' : ''}
                                             ${index === singlePath.length - 1 ? 'bg-green-500 text-white font-medium' : ''}
                                             ${index > 0 && index < singlePath.length - 1 ? 'bg-hive-graphite text-gray-300' : ''}`}
                                >
                                  {word}
                                </span>
                                {index < singlePath.length - 1 && (
                                  <span className="text-hive-yellow">→</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {allPaths.length > 0 && (
                        <div className="text-center text-sm text-gray-400 pt-2">
                          {allPaths.length === 1 
                            ? 'Keep exploring to find more paths!' 
                            : `${allPaths.length} unique paths discovered!`}
                        </div>
                      )}
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
                  onClick={handleDownloadImage}
                  disabled={imageStatus === 'loading'}
                  className="flex-1 py-3 rounded-xl bg-hive-graphite hover:bg-hive-slate
                            text-white font-medium transition-colors flex items-center justify-center gap-2
                            disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {imageStatus === 'loading' ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : imageStatus === 'downloaded' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  {imageStatus === 'downloaded' ? 'Downloaded!' : 'Download'}
                </button>
                <button
                  onClick={handleCopyImage}
                  disabled={imageStatus === 'loading'}
                  className="flex-1 py-3 rounded-xl bg-hive-graphite hover:bg-hive-slate
                            text-white font-medium transition-colors flex items-center justify-center gap-2
                            disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {imageStatus === 'loading' ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : imageStatus === 'copied' ? (
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                  {imageStatus === 'copied' ? 'Copied!' : 'Copy Image'}
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
                  onClick={() => { onClose(); onContinue(); }}
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

