import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { calculateExpiration, serializeMetadata, type RewardMetadata } from '@/lib/rewards'
import type { RewardType } from '@/lib/ads/rewarded-video'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerId, rewardType } = body

    // Validate input
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      )
    }

    if (!rewardType || !['hint', 'practice_unlimited', 'streak_protection', 'ad_free'].includes(rewardType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid reward type' },
        { status: 400 }
      )
    }

    const expiresAt = calculateExpiration(rewardType as RewardType)
    
    // For hints, track usage count in metadata
    const metadata: RewardMetadata = {}
    if (rewardType === 'hint') {
      // Check if player already has an unused hint
      const existingHint = await prisma.adReward.findFirst({
        where: {
          playerId,
          rewardType: 'hint',
          usedAt: null,
        },
        orderBy: {
          unlockedAt: 'desc',
        },
      })

      if (existingHint) {
        // Increment hint count in metadata
        const existingMetadata = existingHint.metadata 
          ? JSON.parse(existingHint.metadata) as RewardMetadata
          : {}
        metadata.hintCount = (existingMetadata.hintCount || 0) + 1
        
        // Update existing reward
        const updated = await prisma.adReward.update({
          where: { id: existingHint.id },
          data: {
            metadata: serializeMetadata(metadata),
            unlockedAt: new Date(), // Refresh unlock time
          },
        })

        return NextResponse.json({
          success: true,
          data: {
            id: updated.id,
            rewardType: updated.rewardType as RewardType,
            expiresAt: updated.expiresAt?.toISOString() || null,
            metadata: metadata as Record<string, unknown>,
          },
        })
      }
    }

    // Create new reward
    const reward = await prisma.adReward.create({
      data: {
        playerId,
        rewardType: rewardType as RewardType,
        expiresAt,
        metadata: rewardType === 'hint' ? serializeMetadata({ hintCount: 1 }) : null,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: reward.id,
        rewardType: reward.rewardType as RewardType,
        expiresAt: reward.expiresAt?.toISOString() || null,
        metadata: reward.metadata ? (JSON.parse(reward.metadata) as Record<string, unknown>) : {},
      },
    })
  } catch (error) {
    console.error('Error unlocking reward:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to unlock reward' },
      { status: 500 }
    )
  }
}

