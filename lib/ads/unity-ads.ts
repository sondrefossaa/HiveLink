/**
 * Unity Ads integration for rewarded video ads
 * Unity Ads supports rewarded video on web
 */

declare global {
  interface Window {
    u3d?: {
      showRewardedAd: (
        zoneId: string,
        onRewarded: () => void,
        onError: (error: string) => void
      ) => void
      isReady: (zoneId: string) => boolean
    }
  }
}

export interface UnityAdsConfig {
  gameId: string
  zoneId: string
  onRewarded: () => void
  onError?: (error: Error) => void
  onAdClosed?: () => void
}

/**
 * Load Unity Ads script
 */
export function loadUnityAdsScript(gameId: string): void {
  if (typeof window === 'undefined') return

  // Check if already loaded
  if (window.u3d) return

  // Load Unity Ads script
  const script = document.createElement('script')
  script.async = true
  script.src = `https://unityads.unity3d.com/webgl/${gameId}/UnityAds.js`
  script.onerror = () => {
    console.warn('Failed to load Unity Ads script')
  }
  document.head.appendChild(script)
}

/**
 * Create a Unity Ads rewarded video
 */
export function createUnityAdsRewardedVideo(
  config: UnityAdsConfig
): {
  load: () => Promise<void>
  show: () => Promise<boolean>
  isLoaded: () => boolean
  destroy: () => void
} {
  let loaded = false

  return {
    load: async () => {
      loadUnityAdsScript(config.gameId)

      // Wait for Unity Ads to be available
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (window.u3d) {
            clearInterval(checkInterval)
            loaded = window.u3d.isReady(config.zoneId)
            resolve()
          }
        }, 100)

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval)
          if (!window.u3d) {
            config.onError?.(new Error('Unity Ads failed to load'))
          }
          resolve()
        }, 5000)
      })
    },
    show: async () => {
      if (!window.u3d) {
        await this.load()
      }

      if (!window.u3d) {
        config.onError?.(new Error('Unity Ads not available'))
        return false
      }

      return new Promise<boolean>((resolve) => {
        try {
          window.u3d.showRewardedAd(
            config.zoneId,
            () => {
              // Ad completed successfully
              config.onRewarded()
              config.onAdClosed?.()
              resolve(true)
            },
            (error) => {
              // Ad error
              config.onError?.(new Error(error))
              config.onAdClosed?.()
              resolve(false)
            }
          )
        } catch (error) {
          config.onError?.(error instanceof Error ? error : new Error('Failed to show ad'))
          resolve(false)
        }
      })
    },
    isLoaded: () => loaded && window.u3d?.isReady(config.zoneId) === true,
    destroy: () => {
      loaded = false
    },
  }
}

