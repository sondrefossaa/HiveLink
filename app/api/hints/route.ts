import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { findSuffixConnections, parseCompoundWord } from '@/lib/compound-utils'
import type { GraphNode } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerId, nodes, goalWord, selectedNodeId } = body

    // Validate input
    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Player ID is required' },
        { status: 400 }
      )
    }

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nodes are required' },
        { status: 400 }
      )
    }

    if (!goalWord || typeof goalWord !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Goal word is required' },
        { status: 400 }
      )
    }

    // Check if player has an active hint reward
    const hintReward = await prisma.adReward.findFirst({
      where: {
        playerId,
        rewardType: 'hint',
        usedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: {
        unlockedAt: 'desc',
      },
    })

    if (!hintReward) {
      return NextResponse.json(
        { success: false, error: 'No active hint reward. Watch an ad to unlock hints!' },
        { status: 403 }
      )
    }

    // Find the source node for the hint
    const selectedNode = selectedNodeId
      ? (nodes as GraphNode[]).find(n => n.id === selectedNodeId)
      : null
    
    const sourceNode = selectedNode || 
      (nodes as GraphNode[])
        .filter(n => !n.isGoal && !n.isStart)
        .sort((a, b) => b.layer - a.layer)[0] ||
      (nodes as GraphNode[]).find(n => n.isStart)

    if (!sourceNode) {
      return NextResponse.json(
        { success: false, error: 'No valid source node found' },
        { status: 400 }
      )
    }

    // Get the last part from the source node (for suffix chaining)
    const sourceParts = sourceNode.parts
    const sourceLastPart = sourceParts.length > 0
      ? sourceParts[sourceParts.length - 1].toLowerCase()
      : sourceNode.word.toLowerCase()
    
    const goalWordLower = goalWord.toLowerCase()
    const goalPartsSet = new Set([goalWordLower])

    // Find compound words that can extend from source node's last part
    // Rule: new word's FIRST part must match source node's LAST part
    const candidateWords: Array<{
      word: string
      parts: string[]
      sharedPart: string
      hasGoalPart: boolean
      sourceLayer: number
      confidence: 'high' | 'medium' | 'low'
      score: number
    }> = []
    
    try {
      // Find words that start with the source node's last part
      const words = await prisma.compoundWord.findMany({
        where: {
          parts: {
            has: sourceLastPart,
          },
        },
        take: 100,
      })

      for (const wordEntry of words) {
        const wordParts = wordEntry.parts
        
        // Check if this word's first part matches source's last part (suffix chaining rule)
        if (wordParts.length === 0 || wordParts[0].toLowerCase() !== sourceLastPart) {
          continue
        }
        
        // Skip if word is already used
        if ((nodes as GraphNode[]).some(n => n.word.toLowerCase() === wordEntry.word.toLowerCase())) {
          continue
        }
        
        // Check if this word can connect via suffix chaining
        const connectionResult = findSuffixConnections(wordEntry.word, wordParts, nodes as GraphNode[])
        
        if (connectionResult.canConnect) {
          // Verify it connects from the source node
          const sourceConnection = connectionResult.connections.find(
            conn => conn.node.id === sourceNode.id
          )
          
          if (!sourceConnection) continue
          
          // Check if word's last part matches goal word
          const wordLastPart = wordParts.length > 0
            ? wordParts[wordParts.length - 1].toLowerCase()
            : wordEntry.word.toLowerCase()
          const hasGoalPart = wordLastPart === goalWordLower
          
          // Calculate score (higher is better)
          let score = 0
          if (hasGoalPart) score += 1000 // Highest priority - word leads to goal
          score += sourceNode.layer * 10 // Prefer words from higher layers
          
          // Calculate confidence
          let confidence: 'high' | 'medium' | 'low' = 'medium'
          if (hasGoalPart) {
            confidence = 'high'
          } else {
            // Check if word's last part is a common compound part that might lead to goal
            confidence = 'medium'
          }

          candidateWords.push({
            word: wordEntry.word,
            parts: wordParts,
            sharedPart: sourceLastPart,
            hasGoalPart,
            sourceLayer: sourceNode.layer,
            confidence,
            score,
          })
        }
      }
    } catch (error) {
      console.warn('Error querying database for hints:', error)
    }

    if (candidateWords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid hints found' },
        { status: 404 }
      )
    }

    // Sort by score (highest first) - prioritizes words that lead to goal
    candidateWords.sort((a, b) => b.score - a.score)

    const bestHint = candidateWords[0]
    const parentNode = sourceNode // The source node is always the parent in suffix chaining

    // Mark hint as used (decrement count or mark used)
    const metadata = hintReward.metadata ? JSON.parse(hintReward.metadata) : { hintCount: 1 }
    if (metadata.hintCount && metadata.hintCount > 1) {
      // Decrement count
      metadata.hintCount--
      await prisma.adReward.update({
        where: { id: hintReward.id },
        data: {
          metadata: JSON.stringify(metadata),
        },
      })
    } else {
      // Mark as used
      await prisma.adReward.update({
        where: { id: hintReward.id },
        data: {
          usedAt: new Date(),
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        suggestedWord: bestHint.word,
        sharedPart: bestHint.sharedPart,
        parentWord: parentNode?.word || sourceNode.word,
        confidence: bestHint.confidence,
      },
    })
  } catch (error) {
    console.error('Error generating hint:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate hint' },
      { status: 500 }
    )
  }
}

