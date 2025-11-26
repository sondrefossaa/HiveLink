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
}

export default function InputBar({
  onSubmit,
  isLoading,
  isDisabled,
  error,
  selectedNode,
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
            className={`relative flex items-center gap-2 p-2 rounded-2xl
                       bg-hive-charcoal/90 backdrop-blur-sm
                       border-2 transition-colors duration-200
                       ${isDisabled ? 'border-hive-graphite' : 'border-hive-graphite focus-within:border-hive-yellow'}
                       ${displayError ? 'border-red-500/50' : ''}`}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
              onKeyDown={handleKeyDown}
              placeholder={isDisabled ? 'Puzzle complete!' : 'Enter a compound word...'}
              disabled={isDisabled || isLoading}
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
              className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-200
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
                  <span>Link</span>
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

