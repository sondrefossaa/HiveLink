'use client'

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GraphNode, PuzzleDifficulty } from '@/types'
import { normalizeNo, sanitizeNorwegianWordInput } from '@/lib/norwegian-dictionary'
import HintButton from './HintButton'

interface InputBarProps {
  onSubmit: (word: string) => Promise<{
    success: boolean
    error?: string
    parentId?: string
    parentWord?: string
    reused?: boolean
  }>
  isLoading: boolean
  isDisabled: boolean
  error: string | null
  selectedNode: GraphNode | null
  onHintReceived?: (hint: { suggestedWord: string; sharedPart: string; parentWord: string; confidence: 'high' | 'medium' | 'low'; stepsToGoal?: number }) => void
  goalWord?: string
  nodes?: GraphNode[]
  difficulty?: PuzzleDifficulty
  externalValue?: string | null
  onExternalValueSet?: () => void
}

export default function InputBar({
  onSubmit,
  isLoading,
  isDisabled,
  error,
  selectedNode,
  onHintReceived,
  goalWord,
  nodes,
  difficulty,
  externalValue,
  onExternalValueSet,
}: InputBarProps) {
  const [input, setInput] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [hintMessage, setHintMessage] = useState<string | null>(null)
  const [placementNotice, setPlacementNotice] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external value to input (for hints)
  useEffect(() => {
    if (externalValue !== undefined && externalValue !== null) {
      const normalizedValue = sanitizeNorwegianWordInput(externalValue)
      if (normalizedValue !== input) {
        setInput(normalizedValue)
        // Focus the input when external value is set
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus()
          }
        }, 0)
        // Notify parent that value was set (after a small delay to avoid conflicts)
        setTimeout(() => {
          onExternalValueSet?.()
        }, 100)
      }
    }
  }, [externalValue, input, onExternalValueSet])

  // Keep desktop keyboard flow fast without forcing open the mobile keyboard.
  useEffect(() => {
    if (inputRef.current && !isDisabled && window.matchMedia('(pointer: fine)').matches) {
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

  // Clear hint message after a delay (same timing as errors)
  useEffect(() => {
    if (hintMessage) {
      const timer = setTimeout(() => setHintMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [hintMessage])

  useEffect(() => {
    if (!placementNotice) return
    const timer = setTimeout(() => setPlacementNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [placementNotice])

  // Sync with external error
  useEffect(() => {
    if (error) {
      setLocalError(error)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }, [error])

  const handleHintReceived = (hint: { suggestedWord: string; sharedPart: string; parentWord: string; confidence: 'high' | 'medium' | 'low'; stepsToGoal?: number }) => {
    setHintMessage(null)
    onHintReceived?.(hint)
  }

  const handleHintEmpty = () => {
    setHintMessage('Ingen gode ord funnet')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const trimmed = normalizeNo(input)

    if (!trimmed) {
      setLocalError('Skriv inn et ord')
      inputRef.current?.focus()
      return
    }

    if (trimmed.length < 4) {
      setLocalError('Ordet må være minst 4 bokstaver')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      inputRef.current?.focus()
      return
    }

    setLocalError(null)
    setHintMessage(null)

    const result = await onSubmit(trimmed)

    if (result.success) {
      setInput('')
      if (result.parentWord && result.parentId !== selectedNode?.id) {
        setPlacementNotice(`Koblet automatisk fra «${result.parentWord}»`)
      } else if (result.reused) {
        setPlacementNotice('Ordet ble gjenbrukt i en ny gren')
      }
    } else {
      setLocalError(result.error || 'Ugyldig ord')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }

    if (window.matchMedia('(pointer: fine)').matches) {
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return

    // Prevent Enter key from bubbling to other elements (like hint button)
    if (e.key === 'Enter') {
      e.stopPropagation()
      return
    }
    
    // Allow only letters
    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !/^[a-zæøå]$/iu.test(e.key)
    ) {
      e.preventDefault()
    }
  }

  const displayError = localError || error

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
      style={{ touchAction: 'pan-x pan-y' }}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-hive-dark via-hive-dark/95 to-transparent pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-4 pb-6 pt-8 pointer-events-none">
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
                Foretrukket gren:{' '}
                <span className="text-hive-yellow font-medium">{selectedNode.word}</span>
                <span className="text-gray-500 ml-2">
                  ({selectedNode.parts.join(' + ')})
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {placementNotice && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-3 text-center text-sm text-hive-yellow"
              role="status"
            >
              {placementNotice}
            </motion.p>
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
              <span id="compound-word-error" role="alert" className="text-sm text-red-400 bg-red-500/10 px-3 py-1 rounded-full">
                {displayError}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hint message - same pill shape/placement as the error, but yellow */}
        <AnimatePresence>
          {hintMessage && !displayError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-3 text-center"
            >
              <span id="compound-word-hint" role="status" className="text-sm text-yellow-300 bg-yellow-500/10 px-3 py-1 rounded-full">
                {hintMessage}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="relative pointer-events-auto"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
        >
          <motion.div
            animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex items-center"
          >
            {/* Main input container */}
            <div
              className={`relative flex items-center gap-2 p-2 rounded-2xl w-full
                       bg-hive-charcoal/90 backdrop-blur-sm
                       border-2 transition-colors duration-200
                        ${isDisabled ? 'border-hive-graphite' : 'border-hive-graphite focus-within:border-hive-yellow'}
                        ${displayError ? 'border-red-500/50' : ''}
                        ${!displayError && hintMessage ? 'border-yellow-500/50' : ''}`}
            >
              {/* Hint button - only show when not disabled and hint handler is available */}
              {!isDisabled && onHintReceived && (
                <HintButton
                  onHintReceived={handleHintReceived}
                  onHintEmpty={handleHintEmpty}
                  className="flex-shrink-0"
                  nodes={nodes}
                  goalWord={goalWord}
                  selectedNodeId={selectedNode?.id || null}
                  difficulty={difficulty}
                />
              )}
              <input
                ref={inputRef}
                id="compound-word"
                name="compound-word"
                type="text"
                value={input}
                onChange={(e) => {
                  if ((e.nativeEvent as InputEvent).isComposing) {
                    setInput(e.target.value)
                    return
                  }
                  setInput(sanitizeNorwegianWordInput(e.target.value))
                }}
                onCompositionEnd={(e) => {
                  setInput(sanitizeNorwegianWordInput(e.currentTarget.value))
                }}
                onKeyDown={handleKeyDown}
                placeholder={isDisabled ? 'Puslespill fullført!' : 'Skriv inn et sammensatt ord for å fortsette...'}
                disabled={isDisabled}
                readOnly={isDisabled || isLoading}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="go"
                maxLength={30}
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                className="flex-1 min-w-0 bg-transparent text-white text-lg px-2 sm:px-4 py-2
                         placeholder:text-gray-500 focus:outline-none
                         disabled:text-gray-500 disabled:cursor-not-allowed"
                aria-label="Skriv inn sammensatt ord"
                aria-invalid={Boolean(displayError || hintMessage)}
                aria-describedby={displayError ? 'compound-word-error' : hintMessage ? 'compound-word-hint' : 'compound-word-help'}
              />

              <motion.button
                type="submit"
                disabled={isDisabled || isLoading || !input.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`px-3 sm:px-6 py-2.5 rounded-xl font-medium transition-all duration-200 flex-shrink-0
                         flex items-center gap-1.5 sm:gap-2
                         ${
                           isDisabled || !input.trim()
                             ? 'bg-hive-graphite text-gray-500 cursor-not-allowed'
                             : 'bg-hive-yellow hover:bg-hive-gold text-hive-dark shadow-hive-glow'
                         }`}
                aria-label="Send inn ord"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-hive-dark border-t-transparent rounded-full"
                  />
                ) : (
                  <>
                    <span className="text-sm sm:text-base">Koble</span>
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          </motion.div>

          {/* Hint text */}
          <p id="compound-word-help" className="mt-3 text-center text-xs text-gray-400">
            {selectedNode && !selectedNode.isGoal ? (
              <>Ordet kobles fra <span className="text-hive-yellow">{selectedNode.word}</span> når det passer, ellers velges korteste gren.</>
            ) : (
              <>HiveLink velger automatisk den korteste grenen som passer.</>
            )}
          </p>
        </form>
      </div>
    </motion.div>
  )
}
