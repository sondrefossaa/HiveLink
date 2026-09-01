'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface HowToPlayProps {
  isOpen: boolean
  onClose: () => void
}

export default function HowToPlay({ isOpen, onClose }: HowToPlayProps) {
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
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-hive-charcoal rounded-2xl 
                       border border-hive-graphite shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-hive-charcoal border-b border-hive-graphite p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Slik spiller du</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-hive-graphite hover:bg-hive-slate 
                          flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Goal */}
              <div>
                <h3 className="text-lg font-semibold text-hive-yellow mb-2">Mål</h3>
                <p className="text-gray-300">
                  Koble <span className="text-hive-yellow font-medium">START</span>-ordet til{' '}
                  <span className="text-green-400 font-medium">MÅL</span>-ordet ved å lenge sammensatte ord.
                </p>
              </div>

              {/* Rules */}
              <div>
                <h3 className="text-lg font-semibold text-hive-yellow mb-2">Regler</h3>
                <ul className="space-y-3 text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-hive-yellow/20 text-hive-yellow text-sm flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span><span className="text-hive-yellow font-medium">START</span> og <span className="text-green-400 font-medium">MÅL</span> er enkle ord (ikke sammensatte).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-hive-yellow/20 text-hive-yellow text-sm flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>Hvert ord du legger til må være et ekte <strong className="text-white">sammensatt ord</strong> (f.eks. fotball, ballongfly).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-hive-yellow/20 text-hive-yellow text-sm flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>Det <strong className="text-white">FØRSTE</strong> delen av det nye ordet må stemme overens med den <strong className="text-white">SISTE</strong> delen av forrige ord.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-hive-yellow/20 text-hive-yellow text-sm flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                    <span>Klikk på en node for å velge den, og skriv deretter inn et ord som kobler seg til den.</span>
                  </li>
                </ul>
              </div>

              {/* Example */}
              <div>
                <h3 className="text-lg font-semibold text-hive-yellow mb-2">Eksempelkjede</h3>
                <div className="bg-hive-dark/50 rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="px-2 py-1 rounded bg-hive-yellow text-hive-dark font-medium">fot</span>
                    <span className="text-hive-yellow">→</span>
                    <span className="px-2 py-1 rounded bg-hive-graphite text-gray-300">fotball</span>
                    <span className="text-hive-yellow">→</span>
                    <span className="px-2 py-1 rounded bg-hive-graphite text-gray-300">ballong</span>
                    <span className="text-hive-yellow">→</span>
                    <span className="px-2 py-1 rounded bg-hive-graphite text-gray-300">ballongfly</span>
                    <span className="text-hive-yellow">→</span>
                    <span className="px-2 py-1 rounded bg-green-400/20 text-green-400 font-medium border border-green-400">fly</span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    <span className="text-hive-yellow">fot</span> → fot<span className="text-hive-yellow">ball</span> → <span className="text-hive-yellow">ball</span>ong → ballong<span className="text-hive-yellow">fly</span> → <span className="text-hive-yellow">fly</span>
                  </p>
                  <p className="mt-2 text-xs text-gray-400 italic">
                    Merk: Siste del av hvert ord blir første del av det neste!
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div>
                <h3 className="text-lg font-semibold text-hive-yellow mb-2">Tips</h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-hive-yellow">•</span>
                    <span>Prøv å finne flere stier til målet</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-hive-yellow">•</span>
                    <span>Færre ord = bedre poengsum</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-hive-yellow">•</span>
                    <span>Et nytt daglig puslespill kommer ved midnatt i din tidssone</span>
                  </li>
                </ul>
              </div>

              {/* Map Legend */}
              <div>
                <h3 className="text-lg font-semibold text-hive-yellow mb-2">Forklaring</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300 bg-hive-dark/30 p-4 rounded-xl border border-hive-graphite/50">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 bg-hive-yellow rounded-sm shadow-lg shadow-hive-yellow/20" />
                    <span>Startnode</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-hive-yellow rounded-sm" />
                    <span>Målnode</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-0.5 bg-hive-yellow" />
                    <span>Tilkoblingskant</span>
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <div className="w-8 h-0.5 bg-green-500" />
                    <span>Fullført vinnersti</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Hook to show tutorial on first visit
export function useFirstVisitTutorial() {
  const [showTutorial, setShowTutorial] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasSeenTutorial = localStorage.getItem('hivelink_seen_tutorial')
    if (!hasSeenTutorial) {
      setShowTutorial(true)
      localStorage.setItem('hivelink_seen_tutorial', 'true')
    }
  }, [])

  return { showTutorial, setShowTutorial }
}

