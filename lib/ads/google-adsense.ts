/**
 * Google AdSense integration
 * Handles loading and displaying AdSense ads
 */

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

const ADSENSE_SCRIPT_ID = 'adsense-script'

/**
 * Load Google AdSense script
 */
export function loadAdSenseScript(publisherId: string): void {
  if (typeof window === 'undefined') return

  // Check if script already exists
  if (document.getElementById(ADSENSE_SCRIPT_ID)) {
    return
  }

  // Initialize adsbygoogle array
  if (!window.adsbygoogle) {
    window.adsbygoogle = []
  }

  // Create and inject script
  const script = document.createElement('script')
  script.id = ADSENSE_SCRIPT_ID
  script.async = true
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`
  script.crossOrigin = 'anonymous'
  script.onerror = () => {
    console.warn('Failed to load AdSense script')
  }
  document.head.appendChild(script)
}

/**
 * Push ad to adsbygoogle array (required for AdSense)
 */
export function pushAd(adElement: HTMLElement): void {
  if (typeof window === 'undefined' || !window.adsbygoogle) {
    return
  }

  try {
    window.adsbygoogle.push({})
  } catch (error) {
    console.warn('Error pushing ad to AdSense:', error)
  }
}

/**
 * Check if AdSense is available
 */
export function isAdSenseAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.adsbygoogle !== 'undefined'
}

