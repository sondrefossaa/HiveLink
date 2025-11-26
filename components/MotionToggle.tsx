'use client'

import { useMotionPreference } from '@/hooks/useMotionPreference'
import type { MotionPreference } from '@/hooks/useMotionPreference'

const preferenceLabel: Record<MotionPreference, string> = {
  auto: 'Motion: Auto',
  reduced: 'Motion: Off',
  motion: 'Motion: On',
}

export function MotionToggle() {
  const { userPreference, effectivePreference, togglePreference } = useMotionPreference()
  const isReduced = effectivePreference === 'reduced'

  return (
    <button
      type="button"
      onClick={togglePreference}
      aria-pressed={isReduced}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
        isReduced
          ? 'bg-hive-graphite/80 border-hive-graphite text-gray-200'
          : 'bg-hive-graphite/40 border-transparent text-gray-400 hover:text-gray-100'
      }`}
    >
      <span className="inline-flex" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path
            d="M3 12a9 9 0 0116.32-4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 12a9 9 0 01-16.32 4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {isReduced ? (
            <line x1="5" y1="5" x2="19" y2="19" strokeLinecap="round" />
          ) : (
            <circle cx="12" cy="12" r="2" />
          )}
        </svg>
      </span>
      <span className="hidden sm:inline">{preferenceLabel[userPreference]}</span>
      <span className="sm:hidden">{isReduced ? 'Motion Off' : 'Motion On'}</span>
    </button>
  )
}
