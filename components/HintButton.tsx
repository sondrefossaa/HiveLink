'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAdRewards } from '@/hooks/useAdRewards'
import RewardedVideoAd from './RewardedVideoAd'
import { requireAds } from '@/config/game'

interface HintButtonProps {
  onHintReceived: (hint: { suggestedWord: string; sharedPart: string; parentWord: string; confidence: 'high' | 'medium' | 'low' }) => void
  disabled?: boolean
  className?: string
  nodes?: Array<{ id: string; word: string; parts: string[] }>
  goalWord?: string
  selectedNodeId?: string | null
}

export default function HintButton({ onHintReceived, disabled, className, nodes, goalWord, selectedNodeId }: HintButtonProps) {
  const { rewards, unlockReward } = useAdRewards()
  const [showAdModal, setShowAdModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const hasHint = rewards?.hasHint ?? false

  const handleGetHint = async () => {
    if (hasHint) {
      // Use existing hint
      await requestHint()
      return
    }
   if (!requireAds){
      await unlockReward('hint')
    } 
    else {
      // Show ad modal to unlock hint
      setShowAdModal(true)
    }
  }

  const requestHint = async () => {
    setLoading(true)
    try {
      const playerId = typeof window !== 'undefined' 
        ? (await import('@/lib/player-id')).getPlayerId()
        : ''

      // Get game state from sessionStorage or pass as props
      // For now, we'll need to get this from the parent component
      // This isd10a977065d84fe8dfc5960a864f735131c537cf a placeholder - the actual implementation should pass nodes/goalWord/selectedNodeId
      const response = await fetch('/api/hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          nodes: nodes || [],
          goalWord: goalWord || '',
          selectedNodeId: selectedNodeId || null,
        }),
      })

      const data = await response.json()
      if (data.success && data.data) {
        onHintReceived(data.data)
      } else {
        console.error('Failed to get hint:', data.error)
      }
    } catch (error) {
      console.error('Error requesting hint:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRewardUnlocked = async () => {
    setShowAdModal(false)
    // Refresh rewards and get hint
    await requestHint()
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={handleGetHint}
        disabled={disabled || loading}
        whileHover={{ scale: hasHint ? 1.05 : 1 }}
        whileTap={{ scale: 0.95 }}
        onKeyDown={(e) => {
          // Prevent Enter key from triggering the button
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
        className={`px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 ${
          hasHint
            ? 'bg-hive-yellow hover:bg-hive-gold text-hive-dark'
            : 'bg-hive-graphite hover:bg-hive-slate text-gray-400'
        } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title={hasHint ? 'Get a hint' : 'Watch ad to unlock hints'}
      >
        {loading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
          />
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span className="text-sm">{hasHint ? 'Hint' : 'Unlock Hint'}</span>
          </>
        )}
      </motion.button>

      <RewardedVideoAd
        rewardType="hint"
        isOpen={showAdModal}
        onRewardUnlocked={handleRewardUnlocked}
        onClose={() => setShowAdModal(false)}
      />
    </>
  )
}

