/**
 * Rewarded video ad manager
 * Supports multiple ad providers with a unified interface
 */

import { createGoogleAdManagerRewardedVideo } from './google-ads-manager'
import { createUnityAdsRewardedVideo } from './unity-ads'

export type RewardType = 'hint' | 'practice_unlimited' | 'streak_protection' | 'ad_free'

export interface RewardedVideoAd {
  load: () => Promise<void>
  show: () => Promise<boolean>
  isLoaded: () => boolean
  destroy: () => void
}

export interface RewardedVideoConfig {
  adUnitId: string
  onRewarded: (rewardType: RewardType, amount?: number) => void
  onError?: (error: Error) => void
  onAdClosed?: () => void
}

/**
 * Create a mock rewarded video ad for development/testing
 */
export function createMockRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd {
  let loaded = false

  const loadFn = async () => {
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 500))
    loaded = true
  }

  return {
    load: loadFn,
    show: async () => {
      if (!loaded) {
        await loadFn()
      }
      
      // In development, simulate ad completion after a short delay
      return new Promise((resolve) => {
        setTimeout(() => {
          // Simulate successful ad completion
          config.onRewarded(config.adUnitId as RewardType, 1)
          config.onAdClosed?.()
          resolve(true)
        }, 2000)
      })
    },
    isLoaded: () => loaded,
    destroy: () => {
      loaded = false
    },
  }
}

/**
 * Create a Google AdMob rewarded video ad
 * Note: AdMob requires additional setup and is primarily for mobile apps
 * For web, you may want to use Google AdSense or other web ad networks
 */
export function createAdMobRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd | null {
  // AdMob is primarily for mobile apps, not web
  // For web, you'd typically use Google AdSense or other providers
  // This is a placeholder for future mobile app support
  
  if (typeof window === 'undefined') {
    return null
  }

  // Check if AdMob SDK is available (would need to be loaded separately)
  // For now, return mock in development
  if (process.env.NODE_ENV === 'development') {
    return createMockRewardedVideoAd(config)
  }

  // In production, you would integrate with actual AdMob SDK
  // This requires additional setup and is beyond the scope of this implementation
  console.warn('AdMob integration requires additional setup')
  return null
}

/**
 * Create a Unity Ads rewarded video ad
 * Unity Ads is a good option for web rewarded video ads
 */
export function createUnityAdsRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd | null {
  const gameId = process.env.NEXT_PUBLIC_UNITY_ADS_GAME_ID
  const zoneId = process.env.NEXT_PUBLIC_UNITY_ADS_ZONE_ID

  if (!gameId || !zoneId) {
    return null
  }

  return createUnityAdsRewardedVideo({
    gameId,
    zoneId,
    onRewarded: () => config.onRewarded(config.adUnitId as RewardType, 1),
    onError: config.onError,
    onAdClosed: config.onAdClosed,
  })
}

/**
 * Create a Google Ad Manager rewarded video ad
 */
export function createGoogleAdManagerRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd | null {
  const networkCode = process.env.NEXT_PUBLIC_GOOGLE_AD_MANAGER_NETWORK_CODE
  const adUnitPath = process.env.NEXT_PUBLIC_GOOGLE_AD_MANAGER_AD_UNIT_PATH

  if (!networkCode || !adUnitPath) {
    return null
  }

  return createGoogleAdManagerRewardedVideo({
    networkCode,
    adUnitPath,
    onRewarded: () => config.onRewarded(config.adUnitId as RewardType, 1),
    onError: config.onError,
    onAdClosed: config.onAdClosed,
  })
}

/**
 * Create a rewarded video ad instance
 * Automatically selects the appropriate provider based on environment and configuration
 */
export function createRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd {
  // In development, use mock ads unless explicitly configured
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_USE_REAL_ADS) {
    return createMockRewardedVideoAd(config)
  }

  // Try Unity Ads first (good web support)
  const unityAd = createUnityAdsRewardedVideoAd(config)
  if (unityAd) {
    return unityAd
  }

  // Try Google Ad Manager
  const adManagerAd = createGoogleAdManagerRewardedVideoAd(config)
  if (adManagerAd) {
    return adManagerAd
  }

  // Try AdMob (primarily for mobile, but can work with web)
  const admobAd = createAdMobRewardedVideoAd(config)
  if (admobAd) {
    return admobAd
  }

  // Fallback to mock if no provider available
  if (process.env.NODE_ENV === 'production') {
    console.warn('No ad provider configured. Please set up Unity Ads, Google Ad Manager, or AdMob.')
  }
  return createMockRewardedVideoAd(config)
}

