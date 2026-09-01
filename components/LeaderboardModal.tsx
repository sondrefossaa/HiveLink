'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getScores, getPlayerStats, type LocalScore } from '@/lib/player-id'

interface LeaderboardModalProps {
  isOpen: boolean
  onClose: () => void
  puzzleNumber?: number
  puzzleDate?: string
}

const formatTimeOfDay = (iso: string): string => {
  const date = new Date(iso)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateKey: string): string => {
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('nb-NO', {
    month: 'short',
    day: 'numeric',
  })
}

const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export default function LeaderboardModal({
  isOpen,
  onClose,
  puzzleNumber,
  puzzleDate,
}: LeaderboardModalProps) {
  const { scores, stats, bestWordsUsed } = useMemo(() => {
    if (!isOpen) return { scores: [] as LocalScore[], stats: null, bestWordsUsed: null }
    const savedScores = getScores()
    const playerStats = getPlayerStats()
    const best = savedScores.length > 0
      ? Math.min(...savedScores.map(score => score.wordsUsed))
      : null
    return { scores: savedScores, stats: playerStats, bestWordsUsed: best }
  }, [isOpen])

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
                  Din statistikk
                </h2>
                <p className="text-sm text-gray-400">
                  {puzzleNumber ? `Puzzle #${puzzleNumber}` : 'Daily puzzles'}
                  {puzzleDate ? ` · ${new Date(puzzleDate + 'T00:00:00').toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-lg bg-hive-graphite/70 hover:bg-hive-graphite text-gray-400 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Close stats"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Løst</p>
                  <p className="text-2xl font-semibold text-white">{stats?.gamesWon ?? 0}</p>
                </div>
                <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Rekke</p>
                  <p className="text-2xl font-semibold text-white">{stats?.currentStreak ?? 0}</p>
                  {stats && stats.maxStreak > 0 && (
                    <p className="text-xs text-gray-500 mt-1">Beste {stats.maxStreak}</p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Beste sti</p>
                  <p className="text-2xl font-semibold text-white">{bestWordsUsed ?? '—'}</p>
                </div>
                <div className="p-4 rounded-xl bg-hive-dark/40 border border-hive-graphite/40">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Gj.snitt ord</p>
                  <p className="text-2xl font-semibold text-white">
                    {stats && stats.gamesWon > 0 ? stats.averageWords.toFixed(1) : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
                    Løste puslespill
                  </h3>
                  <span className="text-xs text-gray-500">Lagret på denne enheten</span>
                </div>

                {scores.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-6">
                    Ingen løste puslespill ennå. Fullfør dagens puslespill for å starte historikken din!
                  </div>
                ) : (
                  <div className="rounded-xl border border-hive-graphite/40 overflow-hidden">
                    <table className="w-full text-sm text-gray-200">
                      <thead className="bg-hive-dark/60 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="text-left px-4 py-3">Dato</th>
                          <th className="text-left px-4 py-3">Ord</th>
                          <th className="text-left px-4 py-3">Lag</th>
                          <th className="text-left px-4 py-3">Stier</th>
                          <th className="text-left px-4 py-3">Tid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scores.map((score) => (
                          <tr
                            key={score.puzzleDate}
                            className={`border-t border-hive-graphite/30 ${
                              score.puzzleDate === puzzleDate ? 'bg-hive-yellow/10 text-hive-yellow' : 'bg-transparent'
                            }`}
                          >
                            <td className="px-4 py-3 font-medium">{formatDate(score.puzzleDate)}</td>
                            <td className="px-4 py-3">{score.wordsUsed}</td>
                            <td className="px-4 py-3">{score.layers}</td>
                            <td className="px-4 py-3">{score.pathsFound}</td>
                            <td className="px-4 py-3 text-gray-400">
                              {formatDuration(score.elapsedMs)}
                              <span className="text-xs text-gray-600 ml-2">
                                {formatTimeOfDay(score.finishedAt)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
