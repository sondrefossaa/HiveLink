import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { findAllConnections, parseCompoundWord } from '@/lib/compound-utils'
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

    // Get all parts from the source node
    const sourceParts = sourceNode.parts
    const goalParts = parseCompoundWord(goalWord)
    const goalPartsSet = new Set(goalParts.map(p => p.toLowerCase()))

    // Find compound words that share a part with source
    const candidateWords: Array<{
      word: string
      parts: string[]
      sharedPart: string
      extendsForward: boolean
      hasGoalPart: boolean
      sourceLayer: number
      confidence: 'high' | 'medium' | 'low'
      score: number
    }> = []
    
    for (const part of sourceParts) {
      try {
        // Find words that contain this part
        const words = await prisma.compoundWord.findMany({
          where: {
            parts: {
              has: part.toLowerCase(),
            },
          },
          take: 50,
        })

        for (const wordEntry of words) {
          const wordParts = wordEntry.parts
          const sharedPart = wordParts.find(p => p.toLowerCase() === part.toLowerCase())
          
          if (sharedPart && !(nodes as GraphNode[]).some(n => n.word.toLowerCase() === wordEntry.word.toLowerCase())) {
            // Check if this word can connect
            const connectionResult = findAllConnections(wordEntry.word, wordParts, nodes as GraphNode[])
            
            if (connectionResult.canConnect) {
              // Find the connection to the source node (must connect FROM source node)
              const sourceConnection = connectionResult.connections.find(
                conn => conn.node.id === sourceNode.id
              )
              
              // Only consider words that can connect from the source node
              if (!sourceConnection) continue
              
              // Check if this extends forward (shared part is the LAST part of source node)
              // This means the new word continues the chain toward the goal
              const sourcePartsList = sourceNode.parts
              const extendsForward = sourcePartsList.length > 0 && 
                sourcePartsList[sourcePartsList.length - 1].toLowerCase() === sharedPart.toLowerCase()
              
              // Check if word has parts in common with goal
              const hasGoalPart = wordParts.some(p => goalPartsSet.has(p.toLowerCase()))
              
              // Calculate score (higher is better)
              let score = 0
              if (extendsForward) score += 1000 // Highest priority
              if (hasGoalPart) score += 100
              score += sourceNode.layer * 10 // Prefer words from higher layers
              
              // Calculate confidence based on score
              let confidence: 'high' | 'medium' | 'low' = 'low'
              if (extendsForward && hasGoalPart) {
                confidence = 'high'
              } else if (extendsForward || hasGoalPart) {
                confidence = 'medium'
              }

              candidateWords.push({
                word: wordEntry.word,
                parts: wordParts,
                sharedPart,
                extendsForward,
                hasGoalPart,
                sourceLayer: sourceNode.layer,
                confidence,
                score,
              })
            }
          }
        }
      } catch (error) {
        console.warn('Error querying database for hints:', error)
      }
    }

    if (candidateWords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid hints found' },
        { status: 404 }
      )
    }

    // Sort by score (highest first) - prioritizes forward-extending words
    candidateWords.sort((a, b) => b.score - a.score)

    const bestHint = candidateWords[0]
    const parentNode = (nodes as GraphNode[]).find(n => 
      n.parts.some(p => p.toLowerCase() === bestHint.sharedPart.toLowerCase())
    )

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

