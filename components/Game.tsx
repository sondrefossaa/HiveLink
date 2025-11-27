'use client'

import { useState, useCallback, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { usePuzzle } from '@/hooks/usePuzzle'
import { useGameState } from '@/hooks/useGameState'
import TopBar from './TopBar'
import InputBar from './InputBar'
import VictoryModal from './VictoryModal'
import MiniMap from './MiniMap'
import HowToPlay, { useFirstVisitTutorial } from './HowToPlay'
import type { GameStats } from '@/types'

// Dynamically import Graph to avoid SSR issues with canvas
const Graph = dynamic(() => import('./Graph'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-hive-yellow"
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-2 border-hive-yellow border-t-transparent rounded-full"
          />
          <span>Loading game...</span>
        </div>
      </motion.div>
    </div>
  ),
})

export default function Game() {
  const {
    puzzle,
    isLoading: puzzleLoading,
    error: puzzleError,
    mode,
    setMode,
    difficulty,
    setDifficulty,
    generatePracticePuzzle,
    isGeneratingPractice,
  } = usePuzzle()
  const gameState = useGameState(puzzle)
  const [showVictory, setShowVictory] = useState(false)
  const [showGiveUp, setShowGiveUp] = useState(false)
  const { showTutorial, setShowTutorial } = useFirstVisitTutorial()

  // Show victory modal when game is complete (only for fresh victories, not restored games)
  const handleVictory = useCallback(() => {
    setShowVictory(true)
  }, [])

  // Check for victory - only auto-show for fresh victories
  useMemo(() => {
    if (gameState.isComplete && !showVictory && !gameState.allowExploration && !gameState.wasRestoredComplete) {
      // Small delay for the animation to show
      setTimeout(handleVictory, 500)
    }
  }, [gameState.isComplete, showVictory, handleVictory, gameState.allowExploration, gameState.wasRestoredComplete])

  // Get selected node
  const selectedNode = useMemo(() => {
    return gameState.nodes.find((n) => n.id === gameState.selectedNodeId) || null
  }, [gameState.nodes, gameState.selectedNodeId])

  // Calculate game stats
  const gameStats: GameStats = useMemo(() => ({
    wordsUsed: gameState.wordsUsed,
    layersExplored: gameState.maxLayer,
    timeElapsed: Date.now() - gameState.startTime,
    optimalSteps: puzzle?.optimalSteps || undefined,
  }), [gameState.wordsUsed, gameState.maxLayer, gameState.startTime, puzzle?.optimalSteps])

  // Handle give up
  const handleGiveUp = useCallback(() => {
    setShowGiveUp(true)
  }, [])

  const confirmGiveUp = useCallback(() => {
    gameState.reset()
    setShowGiveUp(false)
  }, [gameState])

  const pathsFound = gameState.winningPath.length > 0 ? 1 : 0

  // Loading state
  if (puzzleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 mx-auto mb-4 border-4 border-hive-yellow border-t-transparent rounded-full"
          />
          <p className="text-hive-yellow text-lg">
            {mode === 'daily' ? "Loading today's puzzle..." : "Loading puzzle..."}
          </p>
        </motion.div>
      </div>
    )
  }

  // Error state
  if (puzzleError && !puzzle) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Failed to load puzzle</h2>
          <p className="text-gray-400 mb-4">{puzzleError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-xl bg-hive-yellow hover:bg-hive-gold text-hive-dark font-medium transition-colors"
          >
            Try Again
          </button>
        </motion.div>
      </div>
    )
  }

  if (!puzzle) return null

  const isDailyPuzzle = puzzle.isDaily

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <TopBar
        puzzleNumber={puzzle.puzzleNumber}
        date={puzzle.date}
        wordsUsed={gameState.wordsUsed}
        layersExplored={gameState.maxLayer}
        onGiveUp={handleGiveUp}
        pathsFound={pathsFound}
        mode={mode}
        onModeChange={setMode}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        onGeneratePractice={generatePracticePuzzle}
        isGeneratingPractice={isGeneratingPractice}
        isDaily={isDailyPuzzle}
        parValue={puzzle.optimalSteps}
        startWord={puzzle.startWord}
        goalWord={puzzle.goalWord}
        startTime={gameState.startTime}
        isComplete={gameState.isComplete}
      />

      {/* Main game area */}
      <main className="flex-1 pt-16 pb-32 relative">
        {/* Graph container */}
        <div className="absolute inset-0 pt-16 pb-32">
          <Graph
            nodes={gameState.nodes}
            edges={gameState.edges}
            selectedNodeId={gameState.selectedNodeId}
            onNodeSelect={gameState.selectNode}
            goalWord={puzzle.goalWord}
            isComplete={gameState.isComplete}
            winningPath={gameState.winningPath}
          />
        </div>

        {/* Mini map for large graphs */}
        {gameState.nodes.length > 5 && (
          <MiniMap
            nodes={gameState.nodes}
            edges={gameState.edges}
            selectedNodeId={gameState.selectedNodeId}
            onNodeClick={gameState.selectNode}
          />
        )}

        {/* Start/Goal labels */}
        <div className="absolute top-1/2 -translate-y-1/2 left-4 z-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-hive-charcoal/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-hive-yellow/30"
          >
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Start</div>
            <div className="text-lg font-bold text-hive-yellow">{puzzle.startWord}</div>
          </motion.div>
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`bg-hive-charcoal/80 backdrop-blur-sm rounded-lg px-3 py-2 border 
                       ${gameState.isComplete ? 'border-green-500/50' : 'border-hive-graphite'}`}
          >
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Goal</div>
            <div className={`text-lg font-bold ${gameState.isComplete ? 'text-green-400' : 'text-white'}`}>
              {puzzle.goalWord}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-hive-dark via-hive-dark/95 to-transparent backdrop-blur-sm z-30">
        <InputBar
          onSubmit={gameState.addWord}
          isLoading={gameState.isLoading}
          isDisabled={gameState.isComplete && !gameState.allowExploration}
          error={gameState.error}
          selectedNode={selectedNode}
        />
      </div>

      {/* Victory modal */}
      <VictoryModal
        isOpen={showVictory}
        stats={gameStats}
        puzzleNumber={puzzle.puzzleNumber}
        onClose={() => {
          gameState.enableExploration()
          setShowVictory(false)
        }}
        onContinue={() => {
          gameState.enableExploration()
          setShowVictory(false)
        }}
        onTryAgain={() => {
          gameState.reset()
          setShowVictory(false)
        }}
        path={gameState.winningPath}
        pathsFound={pathsFound}
        isDaily={isDailyPuzzle}
        parValue={puzzle.optimalSteps}
        startWord={puzzle.startWord}
        goalWord={puzzle.goalWord}
        difficulty={difficulty}
      />

      {/* How to play tutorial */}
      <HowToPlay isOpen={showTutorial} onClose={() => setShowTutorial(false)} />

      {/* View Solution button - shown when game is complete */}
      {gameState.isComplete && (
        <button
          onClick={() => setShowVictory(true)}
          className="fixed bottom-32 left-4 z-30 w-10 h-10 rounded-full
                     bg-hive-yellow/90 hover:bg-hive-gold backdrop-blur-sm
                     text-hive-dark flex items-center justify-center transition-colors
                     border border-hive-gold/50 shadow-hive-glow"
          aria-label="View solution"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </button>
      )}

      {/* Help button */}
      <button
        onClick={() => setShowTutorial(true)}
        className="fixed bottom-20 left-4 z-30 w-10 h-10 rounded-full
                   bg-hive-graphite/80 hover:bg-hive-slate/80 backdrop-blur-sm
                   text-hive-yellow flex items-center justify-center transition-colors
                   border border-hive-slate/50"
        aria-label="How to play"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Give up confirmation */}
      <AnimatePresence>
        {showGiveUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowGiveUp(false)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-hive-charcoal rounded-2xl border border-hive-graphite p-6 max-w-sm w-full"
            >
              <h3 className="text-xl font-bold text-white mb-2">Give up?</h3>
              <p className="text-gray-400 mb-6">
                This will reset your progress for today&apos;s puzzle. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGiveUp(false)}
                  className="flex-1 py-2.5 rounded-xl bg-hive-graphite hover:bg-hive-slate text-white font-medium transition-colors"
                >
                  Keep Playing
                </button>
                <button
                  onClick={confirmGiveUp}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium transition-colors"
                >
                  Give Up
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

