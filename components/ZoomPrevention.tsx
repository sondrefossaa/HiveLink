'use client'

import { useEffect } from 'react'

/**
 * Prevents browser zoom via Ctrl+wheel or trackpad pinch on non-graph elements
 * while allowing zoom on the graph component
 */
export default function ZoomPrevention() {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Check if the event target is within the graph container
      const target = e.target as HTMLElement
      const graphContainer = target.closest('[data-graph-container]')
      
      // If not on graph and Ctrl/Cmd is pressed (zoom gesture), prevent zoom
      if (!graphContainer && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Use capture phase to catch events early, before they reach the graph
    document.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true } as any)
    }
  }, [])

  return null
}

