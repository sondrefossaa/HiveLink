'use client'

import { useEffect, useRef } from 'react'
import { loadAdSenseScript, pushAd, isAdSenseAvailable } from '@/lib/ads/google-adsense'

interface AdBannerProps {
  adSlot: string
  adFormat?: 'auto' | 'rectangle' | 'vertical' | 'horizontal'
  style?: React.CSSProperties
  className?: string
}

export default function AdBanner({
  adSlot,
  adFormat = 'auto',
  style,
  className,
}: AdBannerProps) {
  const adRef = useRef<HTMLDivElement>(null)
  const adLoadedRef = useRef(false)

  useEffect(() => {
    const publisherId = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID
    if (!publisherId) {
      console.warn('AdSense publisher ID not configured')
      return
    }

    // Load AdSense script
    loadAdSenseScript(publisherId)

    // Wait for script to load and push ad
    const loadAd = () => {
      if (adLoadedRef.current || !adRef.current) return
      if (!isAdSenseAvailable()) {
        // Retry after a short delay
        setTimeout(loadAd, 500)
        return
      }

      pushAd(adRef.current)
      adLoadedRef.current = true
    }

    // Initial load attempt
    loadAd()

    // Also try after a delay
    const timeout = setTimeout(loadAd, 1000)

    return () => {
      clearTimeout(timeout)
    }
  }, [])

  if (!process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID) {
    return null
  }

  return (
    <div
      ref={adRef}
      className={className}
      style={style}
    >
      <ins
        className="adsbygoogle"
        style={{
          display: 'block',
          ...style,
        }}
        data-ad-client={process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_ID}
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  )
}

