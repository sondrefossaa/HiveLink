import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isRewardActive, parseMetadata } from '@/lib/rewards'
import type { RewardType } from '@/lib/ads/rewarded-video'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')
    const rewardType = searchParams.get('rewardType') as RewardType | null

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      )
    }

    // Build query
    const where: {
      playerId: string
      rewardType?: RewardType
      OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>
    } = {
      playerId,
    }

    if (rewardType) {
      where.rewardType = rewardType
    }

    // Only get active rewards (not expired, not used for one-time rewards)
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ]

    const rewards = await prisma.adReward.findMany({
      where,
      orderBy: {
        unlockedAt: 'desc',
      },
    })

    // Filter out used one-time rewards and expired rewards
    const now = new Date()
    const activeRewards = rewards
      .filter(reward => {
        // One-time rewards (hints) can be used multiple times if metadata has count
        if (reward.rewardType === 'hint') {
          const metadata = parseMetadata(reward.metadata)
          return !reward.usedAt || (metadata.hintCount && metadata.hintCount > 0)
        }
        
        // Other rewards should not be used
        if (reward.usedAt) return false
        
        // Check expiration
        if (reward.expiresAt && reward.expiresAt < now) return false
        
        return true
      })
      .map(reward => ({
        id: reward.id,
        rewardType: reward.rewardType,
        unlockedAt: reward.unlockedAt.toISOString(),
        expiresAt: reward.expiresAt?.toISOString() || null,
        usedAt: reward.usedAt?.toISOString() || null,
        metadata: reward.metadata ? parseMetadata(reward.metadata) : {},
        isActive: isRewardActive({
          type: reward.rewardType,
          isUnlocked: true,
          expiresAt: reward.expiresAt,
          usedAt: reward.usedAt,
          metadata: reward.metadata ? parseMetadata(reward.metadata) : {},
        }),
      }))

    // Group by reward type
    const rewardsByType: Record<string, typeof activeRewards> = {}
    for (const reward of activeRewards) {
      if (!rewardsByType[reward.rewardType]) {
        rewardsByType[reward.rewardType] = []
      }
      rewardsByType[reward.rewardType].push(reward)
    }

    return NextResponse.json({
      success: true,
      data: {
        rewards: activeRewards,
        rewardsByType,
        hasHint: activeRewards.some(r => r.rewardType === 'hint' && r.isActive),
        hasPracticeUnlimited: activeRewards.some(r => r.rewardType === 'practice_unlimited' && r.isActive),
        hasStreakProtection: activeRewards.some(r => r.rewardType === 'streak_protection' && r.isActive),
        hasAdFree: activeRewards.some(r => r.rewardType === 'ad_free' && r.isActive),
      },
    })
  } catch (error) {
    console.error('Error fetching reward status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reward status' },
      { status: 500 }
    )
  }
}

