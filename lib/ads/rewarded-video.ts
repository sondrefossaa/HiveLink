/**
 * Rewarded video ad manager
 * Google Ads only - supports both browser and mobile web
 */

import { createGoogleAdManagerRewardedVideo } from './google-ads-manager'

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
 * AdMob can work on both mobile web and desktop browsers with proper setup
 * Note: Requires AdMob SDK to be loaded separately
 */
export function createAdMobRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd | null {
  if (typeof window === 'undefined') {
    return null
  }

  // Check if AdMob SDK is available
  // AdMob requires the SDK to be loaded via script tag or npm package
  // For web, you can use AdMob with the Google Mobile Ads SDK for web
  const admobAppId = process.env.NEXT_PUBLIC_ADMOB_APP_ID
  const admobAdUnitId = process.env.NEXT_PUBLIC_ADMOB_AD_UNIT_ID || config.adUnitId

  if (!admobAppId) {
    return null
  }

  // In development, return mock if SDK not available
  if (process.env.NODE_ENV === 'development' && !(window as any).google?.ima) {
    return createMockRewardedVideoAd(config)
  }

  // For production, AdMob SDK would need to be loaded
  // This is a placeholder - full AdMob web integration requires additional SDK setup
  console.warn('AdMob web SDK integration requires additional setup. Consider using Google Ad Manager for web rewarded video ads.')
  return null
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
 * Google Ads only - works on both browser and mobile web
 * Priority: Google Ad Manager > Google AdMob > Mock (fallback)
 */
export function createRewardedVideoAd(
  config: RewardedVideoConfig
): RewardedVideoAd {
  // In development, use mock ads unless explicitly configured
  if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_USE_REAL_ADS) {
    return createMockRewardedVideoAd(config)
  }

  // Try Google Ad Manager first (best for web rewarded video, works on browser and mobile web)
  const adManagerAd = createGoogleAdManagerRewardedVideoAd(config)
  if (adManagerAd) {
    return adManagerAd
  }

  // Try AdMob (works on mobile web and can work on desktop browsers with proper setup)
  const admobAd = createAdMobRewardedVideoAd(config)
  if (admobAd) {
    return admobAd
  }

  // Fallback to mock if no Google ad provider configured
  if (process.env.NODE_ENV === 'production') {
    console.warn('No Google ad provider configured. Please set up Google Ad Manager or AdMob for rewarded video ads.')
  }
  return createMockRewardedVideoAd(config)
}

