'use client'

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GraphNode } from '@/types'

interface InputBarProps {
  onSubmit: (word: string) => Promise<{ success: boolean; error?: string }>
  isLoading: boolean
  isDisabled: boolean
  error: string | null
  selectedNode: GraphNode | null
  graphSpacing: number
  onGraphSpacingChange: (spacing: number) => void
  onRefreshLayout?: () => void
}

export default function InputBar({
  onSubmit,
  isLoading,
  isDisabled,
  error,
  selectedNode,
  graphSpacing,
  onGraphSpacingChange,
  onRefreshLayout,
}: InputBarProps) {
  const [input, setInput] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !isDisabled) {
      inputRef.current.focus()
    }
  }, [isDisabled])

  // Clear local error after a delay
  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => setLocalError(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [localError])

  // Sync with external error
  useEffect(() => {
    if (error) {
      setLocalError(error)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }, [error])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const trimmed = input.trim().toLowerCase()

    if (!trimmed) {
      setLocalError('Please enter a word')
      inputRef.current?.focus()
      return
    }

    if (trimmed.length < 4) {
      setLocalError('Word must be at least 4 characters')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
      return
    }

    setLocalError(null)

    const result = await onSubmit(trimmed)

    if (result.success) {
      setInput('')
    } else {
      setLocalError(result.error || 'Invalid word')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }

    // Always refocus input after submission
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Allow only letters
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !/^[a-zA-Z]$/.test(e.key)
    ) {
      e.preventDefault()
    }
  }

  const displayError = localError || error

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-0 left-0 right-0 z-40"
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-hive-dark via-hive-dark/95 to-transparent pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-4 pb-6 pt-8">
        {/* Selected node indicator */}
        <AnimatePresence>
          {selectedNode && !selectedNode.isGoal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 text-center"
            >
              <span className="text-sm text-gray-400">
                Connect from:{' '}
                <span className="text-hive-yellow font-medium">{selectedNode.word}</span>
                <span className="text-gray-500 ml-2">
                  ({selectedNode.parts.join(' + ')})
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error message */}
        <AnimatePresence>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 text-center"
            >
              <span className="text-sm text-red-400 bg-red-500/10 px-3 py-1 rounded-full">
                {displayError}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="relative">
          <motion.div
            animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3"
          >
            {/* Main input container */}
            <div
              className={`relative flex items-center gap-2 p-2 rounded-2xl flex-1
                       bg-hive-charcoal/90 backdrop-blur-sm
                       border-2 transition-colors duration-200
                       ${isDisabled ? 'border-hive-graphite' : 'border-hive-graphite focus-within:border-hive-yellow'}
                       ${displayError ? 'border-red-500/50' : ''}`}
            >
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
                onKeyDown={handleKeyDown}
                placeholder={isDisabled ? 'Puzzle complete!' : 'Enter a compound word to continue...'}
                disabled={isDisabled}
                readOnly={isDisabled || isLoading}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-white text-lg px-4 py-2
                         placeholder:text-gray-500 focus:outline-none
                         disabled:text-gray-500 disabled:cursor-not-allowed"
                aria-label="Enter compound word"
              />

              <motion.button
                type="submit"
                disabled={isDisabled || isLoading || !input.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`px-3 sm:px-6 py-2.5 rounded-xl font-medium transition-all duration-200
                         flex items-center gap-2
                         ${
                           isDisabled || !input.trim()
                             ? 'bg-hive-graphite text-gray-500 cursor-not-allowed'
                             : 'bg-hive-yellow hover:bg-hive-gold text-hive-dark shadow-hive-glow'
                         }`}
                aria-label="Submit word"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-hive-dark border-t-transparent rounded-full"
                  />
                ) : (
                  <>
                    <span className="hidden sm:inline">Link</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </>
                )}
              </motion.button>
            </div>

            {/* Graph Spacing Slider */}
            <div className="hidden sm:flex flex-col items-center gap-1 px-3 py-2 rounded-2xl bg-hive-charcoal/90 backdrop-blur-sm border-2 border-hive-graphite">
              <label htmlFor="graph-spacing" className="text-xs text-hive-cream/50 whitespace-nowrap">
                Width
              </label>
              <input
                id="graph-spacing"
                type="range"
                min="50"
                max="300"
                value={graphSpacing}
                onChange={(e) => onGraphSpacingChange(Number(e.target.value))}
                className="w-20 h-1.5 bg-hive-graphite rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-hive-yellow
                         [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-hive-gold
                         [&::-webkit-slider-thumb]:transition-colors
                         [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
                         [&::-moz-range-thumb]:bg-hive-yellow [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <span className="text-xs text-hive-yellow/70 font-medium">{graphSpacing}%</span>
            </div>

            {/* Refresh Layout Button */}
            {onRefreshLayout && (
              <motion.button
                type="button"
                onClick={onRefreshLayout}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95, rotate: -180 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl
                         bg-hive-charcoal/90 backdrop-blur-sm border-2 border-hive-graphite
                         hover:border-hive-yellow/50 transition-colors group"
                aria-label="Rebalance graph layout"
                title="Rebalance graph layout"
              >
                <svg 
                  className="w-5 h-5 text-hive-yellow/70 group-hover:text-hive-yellow transition-colors" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </motion.button>
            )}
          </motion.div>

          {/* Hint text */}
          <p className="mt-3 text-center text-xs text-gray-500">
            Enter a compound word that shares one part with{' '}
            <span className="text-hive-yellow">
              {selectedNode ? selectedNode.word : 'the start word'}
            </span>
          </p>
        </form>
      </div>
    </motion.div>
  )
}

