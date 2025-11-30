'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAdRewards } from '@/hooks/useAdRewards'
import RewardedVideoAd from './RewardedVideoAd'
import { getRewardDisplayName, getRewardDescription } from '@/lib/rewards'
import type { RewardType } from '@/lib/ads/rewarded-video'

interface AdRewardModalProps {
  isOpen: boolean
  onClose: () => void
}

const REWARD_TYPES: RewardType[] = ['hint', 'practice_unlimited', 'streak_protection', 'ad_free']

export default function AdRewardModal({ isOpen, onClose }: AdRewardModalProps) {
  const { rewards, unlockReward } = useAdRewards()
  const [selectedReward, setSelectedReward] = useState<RewardType | null>(null)

  const handleSelectReward = (rewardType: RewardType) => {
    setSelectedReward(rewardType)
  }

  const handleRewardUnlocked = () => {
    setSelectedReward(null)
    // Modal will close automatically via RewardedVideoAd
  }

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
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-hive-charcoal rounded-2xl border border-hive-graphite p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Unlock Rewards</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-gray-400 mb-6">
            Watch ads to unlock premium features and enhance your gameplay!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {REWARD_TYPES.map((rewardType) => {
              const isUnlocked = rewards?.rewardsByType[rewardType]?.some(r => r.isActive) ?? false
              
              return (
                <motion.button
                  key={rewardType}
                  onClick={() => handleSelectReward(rewardType)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`p-4 rounded-xl border-2 transition-colors text-left ${
                    isUnlocked
                      ? 'bg-hive-yellow/10 border-hive-yellow/50'
                      : 'bg-hive-dark/50 border-hive-graphite hover:border-hive-yellow/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-white">
                      {getRewardDisplayName(rewardType)}
                    </h3>
                    {isUnlocked && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-3">
                    {getRewardDescription(rewardType)}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    {isUnlocked ? (
                      <span className="text-green-400">✓ Unlocked</span>
                    ) : (
                      <>
                        <svg className="w-4 h-4 text-hive-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-hive-yellow">Watch Ad</span>
                      </>
                    )}
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {selectedReward && (
          <RewardedVideoAd
            rewardType={selectedReward}
            isOpen={true}
            onRewardUnlocked={handleRewardUnlocked}
            onClose={() => {
              setSelectedReward(null)
              onClose()
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}

