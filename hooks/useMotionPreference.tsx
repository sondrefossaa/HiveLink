"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type MotionPreference = 'auto' | 'reduced' | 'motion'

interface MotionPreferenceContextValue {
  userPreference: MotionPreference
  systemPrefersReduced: boolean
  effectivePreference: 'reduced' | 'full'
  setPreference: (preference: MotionPreference) => void
  togglePreference: () => void
}

const MotionPreferenceContext = createContext<MotionPreferenceContextValue | null>(null)
const STORAGE_KEY = 'hivelink-motion-preference'

const isBrowser = () => typeof window !== 'undefined'

export function MotionPreferenceProvider({
  children,
}: {
  children: ReactNode
}) {
  const [userPreference, setUserPreference] = useState<MotionPreference>('auto')
  const [systemPrefersReduced, setSystemPrefersReduced] = useState(false)

  useEffect(() => {
    if (!isBrowser()) return

    const stored = window.localStorage.getItem(STORAGE_KEY) as MotionPreference | null
    if (stored === 'auto' || stored === 'reduced' || stored === 'motion') {
      setUserPreference(stored)
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystemPrefersReduced(mediaQuery.matches)

    const listener = (event: MediaQueryListEvent) => {
      setSystemPrefersReduced(event.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
  }, [])

  const effectivePreference: 'reduced' | 'full' = useMemo(() => {
    if (userPreference === 'reduced') return 'reduced'
    if (userPreference === 'motion') return 'full'
    return systemPrefersReduced ? 'reduced' : 'full'
  }, [systemPrefersReduced, userPreference])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.motion = effectivePreference
  }, [effectivePreference])

  const persistPreference = useCallback((preference: MotionPreference) => {
    if (!isBrowser()) return
    if (preference === 'auto') {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, preference)
  }, [])

  const setPreference = useCallback(
    (preference: MotionPreference) => {
      setUserPreference(preference)
      persistPreference(preference)
    },
    [persistPreference]
  )

  const togglePreference = useCallback(() => {
    setUserPreference((current) => {
      const next: MotionPreference = current === 'auto' ? 'reduced' : current === 'reduced' ? 'motion' : 'auto'
      persistPreference(next)
      return next
    })
  }, [persistPreference])

  const value = useMemo<MotionPreferenceContextValue>(
    () => ({
      userPreference,
      systemPrefersReduced,
      effectivePreference,
      setPreference,
      togglePreference,
    }),
    [userPreference, systemPrefersReduced, effectivePreference, setPreference, togglePreference]
  )

  return (
    <MotionPreferenceContext.Provider value={value}>
      {children}
    </MotionPreferenceContext.Provider>
  )
}

export function useMotionPreference() {
  const context = useContext(MotionPreferenceContext)
  if (!context) {
    throw new Error('useMotionPreference must be used within a MotionPreferenceProvider')
  }
  return context
}
