'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPlayerId } from '@/lib/player-id'
import type { RewardType } from '@/lib/ads/rewarded-video'

export interface RewardStatus {
  id: number
  rewardType: RewardType
  unlockedAt: string
  expiresAt: string | null
  usedAt: string | null
  metadata: Record<string, unknown>
  isActive: boolean
}

export interface RewardsData {
  rewards: RewardStatus[]
  rewardsByType: Record<string, RewardStatus[]>
  hasHint: boolean
  hasPracticeUnlimited: boolean
  hasStreakProtection: boolean
  hasAdFree: boolean
}

export function useAdRewards() {
  const [rewards, setRewards] = useState<RewardsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRewards = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const playerId = getPlayerId()
      const response = await fetch(`/api/rewards/status?playerId=${encodeURIComponent(playerId)}`)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch rewards')
      }

      setRewards(data.data)
    } catch (err) {
      console.error('Error fetching rewards:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch rewards')
    } finally {
      setLoading(false)
    }
  }, [])

  const unlockReward = useCallback(async (rewardType: RewardType): Promise<boolean> => {
    try {
      const playerId = getPlayerId()
      const response = await fetch('/api/rewards/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, rewardType }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to unlock reward')
      }

      // Refresh rewards
      await fetchRewards()
      return true
    } catch (err) {
      console.error('Error unlocking reward:', err)
      setError(err instanceof Error ? err.message : 'Failed to unlock reward')
      return false
    }
  }, [fetchRewards])

  useEffect(() => {
    fetchRewards()
  }, [fetchRewards])

  return {
    rewards,
    loading,
    error,
    refetch: fetchRewards,
    unlockReward,
  }
}

