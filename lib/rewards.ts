/**
 * Reward management logic
 * Handles reward types, expiration, and usage tracking
 */

import type { RewardType } from './ads/rewarded-video'

export type RewardStatus = {
  type: RewardType
  isUnlocked: boolean
  expiresAt: Date | null
  usedAt: Date | null
  metadata?: Record<string, unknown>
}

export interface RewardMetadata {
  hintCount?: number
  practicePuzzleCount?: number
  adFreeHours?: number
  streakProtectionDays?: number
}

/**
 * Default reward durations (in milliseconds)
 */
export const REWARD_DURATIONS: Record<RewardType, number> = {
  hint: 0, // Hints are one-time use, no expiration
  practice_unlimited: 24 * 60 * 60 * 1000, // 24 hours
  streak_protection: 7 * 24 * 60 * 60 * 1000, // 7 days
  ad_free: 2 * 60 * 60 * 1000, // 2 hours
}

/**
 * Check if a reward is currently active (unlocked and not expired)
 */
export function isRewardActive(reward: RewardStatus): boolean {
  if (!reward.isUnlocked) return false
  if (reward.usedAt) return false // One-time rewards are used
  if (reward.expiresAt) {
    return new Date() < reward.expiresAt
  }
  return true
}

/**
 * Check if a reward type allows multiple uses
 */
export function isRewardReusable(type: RewardType): boolean {
  return type === 'practice_unlimited' || type === 'ad_free' || type === 'streak_protection'
}

/**
 * Calculate expiration date for a reward
 */
export function calculateExpiration(type: RewardType): Date | null {
  const duration = REWARD_DURATIONS[type]
  if (duration === 0) return null // No expiration for one-time rewards
  
  return new Date(Date.now() + duration)
}

/**
 * Parse reward metadata from JSON string
 */
export function parseMetadata(metadata: string | null): RewardMetadata {
  if (!metadata) return {}
  
  try {
    return JSON.parse(metadata) as RewardMetadata
  } catch {
    return {}
  }
}

/**
 * Serialize reward metadata to JSON string
 */
export function serializeMetadata(metadata: RewardMetadata): string {
  return JSON.stringify(metadata)
}

/**
 * Get reward display name
 */
export function getRewardDisplayName(type: RewardType): string {
  switch (type) {
    case 'hint':
      return 'Hint'
    case 'practice_unlimited':
      return 'Unlimited Practice'
    case 'streak_protection':
      return 'Streak Protection'
    case 'ad_free':
      return 'Ad-Free Experience'
    default:
      return 'Reward'
  }
}

/**
 * Get reward description
 */
export function getRewardDescription(type: RewardType): string {
  switch (type) {
    case 'hint':
      return 'Get a hint for the next valid word'
    case 'practice_unlimited':
      return 'Unlimited practice puzzles for 24 hours'
    case 'streak_protection':
      return 'Protect your streak for 7 days'
    case 'ad_free':
      return 'Ad-free experience for 2 hours'
    default:
      return 'Unlock a reward'
  }
}

