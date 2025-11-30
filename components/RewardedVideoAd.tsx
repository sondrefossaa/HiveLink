'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createRewardedVideoAd } from '@/lib/ads/rewarded-video'
import type { RewardType } from '@/lib/ads/rewarded-video'
import { getRewardDisplayName, getRewardDescription } from '@/lib/rewards'

interface RewardedVideoAdProps {
  rewardType: RewardType
  onRewardUnlocked: () => void
  onClose?: () => void
  isOpen: boolean
}

export default function RewardedVideoAd({
  rewardType,
  onRewardUnlocked,
  onClose,
  isOpen,
}: RewardedVideoAdProps) {
  const [loading, setLoading] = useState(false)
  const [showing, setShowing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adRef = useRef<ReturnType<typeof createRewardedVideoAd> | null>(null)

  useEffect(() => {
    if (isOpen && !adRef.current) {
      // Create ad instance
      adRef.current = createRewardedVideoAd({
        adUnitId: rewardType,
        onRewarded: async (type, amount) => {
          // Unlock reward via API
          try {
            const playerId = typeof window !== 'undefined' 
              ? (await import('@/lib/player-id')).getPlayerId()
              : ''
            
            const response = await fetch('/api/rewards/unlock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId, rewardType: type }),
            })

            const data = await response.json()
            if (data.success) {
              onRewardUnlocked()
              setShowing(false)
            } else {
              setError(data.error || 'Failed to unlock reward')
            }
          } catch (err) {
            console.error('Error unlocking reward:', err)
            setError('Failed to unlock reward')
          }
        },
        onError: (err) => {
          console.error('Ad error:', err)
          setError(err.message || 'Ad failed to load')
        },
        onAdClosed: () => {
          setShowing(false)
          onClose?.()
        },
      })

      // Load ad
      setLoading(true)
      adRef.current.load().then(() => {
        setLoading(false)
      }).catch((err) => {
        console.error('Error loading ad:', err)
        setError(err.message || 'Failed to load ad')
        setLoading(false)
      })
    }

    return () => {
      if (adRef.current) {
        adRef.current.destroy()
        adRef.current = null
      }
    }
  }, [isOpen, rewardType, onRewardUnlocked, onClose])

  const handleShowAd = useCallback(async () => {
    if (!adRef.current) return

    setError(null)
    setShowing(true)

    try {
      const success = await adRef.current.show()
      if (!success) {
        setError('Ad was not completed')
        setShowing(false)
      }
    } catch (err) {
      console.error('Error showing ad:', err)
      setError(err instanceof Error ? err.message : 'Failed to show ad')
      setShowing(false)
    }
  }, [])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-hive-charcoal rounded-2xl border border-hive-graphite p-6 max-w-md w-full"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          
          <div className="relative z-10">
            <h3 className="text-xl font-bold text-white mb-2">
              Watch Ad for {getRewardDisplayName(rewardType)}
            </h3>
            <p className="text-gray-400 mb-6">
              {getRewardDescription(rewardType)}
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {showing ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 border-4 border-hive-yellow border-t-transparent rounded-full animate-spin" />
                <p className="text-hive-yellow">Ad is playing...</p>
                <p className="text-sm text-gray-400 mt-2">
                  Please watch the ad to completion
                </p>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-hive-graphite hover:bg-hive-slate text-white font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShowAd}
                  disabled={loading || !adRef.current?.isLoaded()}
                  className="flex-1 py-3 rounded-xl bg-hive-yellow hover:bg-hive-gold text-hive-dark font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Loading...' : 'Watch Ad'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

