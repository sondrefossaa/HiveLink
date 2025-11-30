'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AverageStats, LeaderboardEntry, LeaderboardResponse } from '@/types'
import { getPlayerId } from '@/lib/player-id'

interface LeaderboardModalProps {
  isOpen: boolean
  onClose: () => void
  puzzleNumber?: number
  puzzleDate?: string
}

interface LeaderboardState {
  entries: LeaderboardEntry[]
  totalPlayers: number
  averageStats?: AverageStats
  playerRank?: number
  playerPercentile?: number
}

const formatTimeOfDay = (iso: string): string => {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

const formatAverageNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—'
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1)
}

export default function LeaderboardModal({
  isOpen,
  onClose,
  puzzleNumber,
  puzzleDate,
}: LeaderboardModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LeaderboardState | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const fetchLeaderboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const playerId = getPlayerId()
        const params = new URLSearchParams({ playerId })
        if (puzzleDate) {
          params.set('date', puzzleDate)
        }

        const response = await fetch(`/api/leaderboard/today?${params.toString()}`)
        const json = await response.json()

        if (!response.ok || !json.success) {
          throw new Error(json.error || 'Failed to fetch leaderboard')
        }

        if (!cancelled) {
          const { entries, totalPlayers, averageStats, playerRank, playerPercentile } =
            json.data as LeaderboardResponse
          setData({ entries, totalPlayers, averageStats, playerRank, playerPercentile })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchLeaderboard()

    return () => {
      cancelled = true
    }
  }, [isOpen, puzzleDate, reloadKey])

  const highlightedRank = useMemo(() => data?.playerRank ?? null, [data])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
          style={{ touchAction: 'pan-x pan-y' }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 250 }}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[85vh] bg-hive-charcoal rounded-2xl border border-hive-graphite shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between gap-4 border-b border-hive-graphite px-5 py-4 flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-hive-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 21h8m-6 0v-5.586a1 1 0 00-.293-.707L5.414 11a2 2 0 01-.586-1.414V5a2 2 0 012-2h10a2 2 0 012 2v4.586a2 2 0 01-.586 1.414l-3.293 3.293a1 1 0 00-.293.707V21" />
                  </svg>
                  Leaderboard
                </h2>
                <p className="text-sm text-gray-400">
                  {puzzleNumber ? `Puzzle #${puzzleNumber}` : 'Daily puzzle'}
                  {puzzleDate ? ` · ${new Date(puzzleDate + 'T00:00:00').toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReloadKey((key) => key + 1)}
                  disabled={loading}
                  className="w-9 h-9 rounded-lg bg-hive-graphite/70 hover:bg-hive-graphite text-gray-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                  aria-label="Refresh leaderboard"
                  title="Refresh"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-lg bg-hive-graphite/70 hover:bg-hive-graphite text-gray-400 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Close leaderboard"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {loading && (
                <div className="flex justify-center py-10">
                  <div className="w-10 h-10 border-4 border-hive-yellow/40 border-t-hive-yellow rounded-full animate-spin" />
                </div>
              )}

              {!loading && error && (
                <div className="text-center py-10">
                  <p className="text-gray-400 mb-4">{error}</p>
                  <button
                    onClick={() => {
                      setError(null)
                      setData(null)
                      setReloadKey((key) => key + 1)
                    }}
                    className="px-4 py-2 rounded-lg bg-hive-yellow text-hive-dark font-medium hover:bg-hive-gold transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {!loading && !error && data && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total players</p>
                      <p className="text-2xl font-semibold text-white">{data.totalPlayers}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Your rank</p>
                      <p className="text-2xl font-semibold text-white">
                        {highlightedRank ? `#${highlightedRank}` : 'Unranked'}
                      </p>
                      {data.playerPercentile && (
                        <p className="text-xs text-gray-500 mt-1">
                          Top {data.playerPercentile}%
                        </p>
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Average Path</p>
                      <p className="text-2xl font-semibold text-white">
                        {formatAverageNumber(data.averageStats?.avgWordsUsed)}
                      </p>
                    </div>
                  </div>

                  {data.averageStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm text-gray-300">
                      <div className="flex items-center justify-between rounded-lg bg-hive-dark/30 border border-hive-graphite/30 px-3 py-2">
                        <span>Shortest Path</span>
                        <span>{formatAverageNumber(data.averageStats.avgWordsUsed)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-hive-dark/30 border border-hive-graphite/30 px-3 py-2">
                        <span>Paths Found</span>
                        <span>{formatAverageNumber(data.averageStats.avgPathsFound)}</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                        Top players
                      </h3>
                      <span className="text-xs text-gray-500">Showing top {data.entries.length} of 100</span>
                    </div>

                    {data.entries.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-6">
                        No leaderboard entries yet. Be the first to finish!
                      </div>
                    ) : (
                      <div className="rounded-xl border border-hive-graphite/40 overflow-hidden">
                        <table className="w-full text-sm text-gray-200">
                          <thead className="bg-hive-dark/60 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                              <th className="text-left px-4 py-3">Rank</th>
                              <th className="text-left px-4 py-3">Player</th>
                              <th className="text-left px-4 py-3">Shortest path</th>
                              <th className="text-left px-4 py-3">Paths</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.entries.map((entry) => (
                              <tr
                                key={`${entry.rank}-${entry.playerId}`}
                                className={`border-t border-hive-graphite/30 ${
                                  highlightedRank === entry.rank ? 'bg-hive-yellow/10 text-hive-yellow' : 'bg-transparent'
                                }`}
                              >
                                <td className="px-4 py-3 font-semibold">#{entry.rank}</td>
                                <td className="px-4 py-3">
                                  {entry.playerName ? (
                                    <span className="font-medium">{entry.playerName}</span>
                                  ) : (
                                    <span className="text-gray-500 italic text-sm">
                                      Player {entry.playerId.slice(0, 6)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">{entry.wordsUsed}</td>
                                <td className="px-4 py-3">{entry.pathsFound}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {data.playerRank && data.playerRank > data.entries.length && (
                      <p className="text-xs text-gray-500 mt-3 text-center">
                        Your rank is currently outside the top {data.entries.length}. Keep playing to climb!
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
