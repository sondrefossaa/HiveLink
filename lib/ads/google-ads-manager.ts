/**
 * Google Ad Manager integration for rewarded video ads
 * Ad Manager supports rewarded video ads on web
 */

declare global {
  interface Window {
    googletag?: {
      cmd: Array<() => void>
      pubads?: () => {
        addEventListener: (event: string, callback: () => void) => void
        removeEventListener: (event: string, callback: () => void) => void
        refresh?: () => void
      }
      defineSlot?: (adUnitPath: string, size: number[], divId: string) => unknown
      enableServices?: () => void
      display?: (divId: string) => void
    }
  }
}

export interface GoogleAdManagerConfig {
  networkCode: string
  adUnitPath: string
  onRewarded: () => void
  onError?: (error: Error) => void
  onAdClosed?: () => void
}

/**
 * Load Google Ad Manager (GPT) script
 */
export function loadGoogleAdManagerScript(): void {
  if (typeof window === 'undefined') return

  // Check if already loaded
  if (window.googletag) return

  // Initialize googletag command queue
  if (!window.googletag) {
    window.googletag = { cmd: [] } as Window['googletag']
  }

  // Load the script
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://www.googletagservices.com/tag/js/gpt.js'
  script.onerror = () => {
    console.warn('Failed to load Google Ad Manager script')
  }
  document.head.appendChild(script)
}

/**
 * Create a rewarded video ad using Google Ad Manager
 * Note: This requires Ad Manager account setup and rewarded video ad units
 */
export function createGoogleAdManagerRewardedVideo(
  config: GoogleAdManagerConfig
): {
  load: () => Promise<void>
  show: () => Promise<boolean>
  isLoaded: () => boolean
  destroy: () => void
} {
  let loaded = false
  let adContainer: HTMLDivElement | null = null

  const loadFn = async () => {
      loadGoogleAdManagerScript()

      // Wait for googletag to be available
      await new Promise<void>((resolve) => {
        if (window.googletag && window.googletag.cmd) {
          window.googletag.cmd.push(() => {
            resolve()
          })
        } else {
          // Retry after script loads
          const checkInterval = setInterval(() => {
            if (window.googletag) {
              clearInterval(checkInterval)
              resolve()
            }
          }, 100)
        }
      })

      // Create ad container (hidden)
      adContainer = document.createElement('div')
      adContainer.id = `gpt-ad-${Date.now()}`
      adContainer.style.display = 'none'
      document.body.appendChild(adContainer)

      // Define and display ad
      if (window.googletag && window.googletag.defineSlot && window.googletag.enableServices && window.googletag.display && window.googletag.pubads) {
        window.googletag.cmd.push(() => {
          try {
            const slot = window.googletag!.defineSlot!(
              config.adUnitPath,
              [1, 1], // Size for rewarded video
              adContainer!.id
            )
            
            if (slot) {
              window.googletag!.enableServices!()
              window.googletag!.display!(adContainer!.id)
              
              // Listen for ad events
              const pubads = window.googletag!.pubads!()
              pubads.addEventListener('rewardedVideoComplete', () => {
                config.onRewarded()
                config.onAdClosed?.()
              })
              
              pubads.addEventListener('slotRenderEnded', () => {
                loaded = true
              })
            }
          } catch (error) {
            console.error('Error setting up Ad Manager ad:', error)
            config.onError?.(error instanceof Error ? error : new Error('Ad setup failed'))
          }
        })
      }
    }

  return {
    load: loadFn,
    show: async () => {
      if (!loaded) {
        await loadFn()
      }

      // Show the ad container
      if (adContainer) {
        adContainer.style.display = 'block'
        // Trigger ad display
        if (window.googletag && window.googletag.pubads) {
          window.googletag.cmd.push(() => {
            const pubads = window.googletag!.pubads!()
            if (pubads.refresh) {
              pubads.refresh()
            }
          })
        }
      }

      return true
    },
    isLoaded: () => loaded,
    destroy: () => {
      if (adContainer) {
        adContainer.remove()
        adContainer = null
      }
      loaded = false
    },
  }
}

