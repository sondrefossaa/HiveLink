'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { GraphNode, GraphEdge } from '@/types'

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-hive-yellow animate-pulse">Loading graph...</div>
    </div>
  ),
})

interface GraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  onNodeSelect: (nodeId: string) => void
  goalWord: string
  isComplete: boolean
}

interface ForceGraphNode extends GraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface ForceGraphLink {
  source: string | ForceGraphNode
  target: string | ForceGraphNode
  sharedPart: string
}

export default function Graph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  goalWord,
  isComplete,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({
          width: rect.width || 800,
          height: rect.height || 500,
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Transform data for force-graph
  const graphData = useMemo(() => {
    const graphNodes: ForceGraphNode[] = nodes.map(node => ({
      ...node,
      // Set fixed positions for start and goal nodes
      fx: node.isStart ? 80 : node.isGoal ? dimensions.width - 80 : undefined,
      fy: node.isStart || node.isGoal ? dimensions.height / 2 : undefined,
    }))

    const graphLinks: ForceGraphLink[] = edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      sharedPart: edge.sharedPart,
    }))

    return { nodes: graphNodes, links: graphLinks }
  }, [nodes, edges, dimensions])

  // Custom node rendering
  const drawNode = useCallback(
    (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const label = node.word
      const fontSize = Math.max(12 / globalScale, 10)
      const isSelected = node.id === selectedNodeId
      const isStartOrGoal = node.isStart || node.isGoal
      const isGoalCompleted = node.isGoal && node.isCompleted

      // Node size
      const baseSize = isStartOrGoal ? 35 : 25
      const size = baseSize / globalScale

      // Get position
      const x = node.x || 0
      const y = node.y || 0

      // Draw glow for selected/special nodes
      if (isSelected || isStartOrGoal || isGoalCompleted) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2)
        if (isGoalCompleted) {
          gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)')
          gradient.addColorStop(1, 'rgba(34, 197, 94, 0)')
        } else if (node.isGoal) {
          gradient.addColorStop(0, 'rgba(244, 180, 0, 0.3)')
          gradient.addColorStop(1, 'rgba(244, 180, 0, 0)')
        } else if (isSelected) {
          gradient.addColorStop(0, 'rgba(255, 184, 0, 0.5)')
          gradient.addColorStop(1, 'rgba(255, 184, 0, 0)')
        } else {
          gradient.addColorStop(0, 'rgba(244, 180, 0, 0.3)')
          gradient.addColorStop(1, 'rgba(244, 180, 0, 0)')
        }
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, size * 2, 0, 2 * Math.PI)
        ctx.fill()
      }

      // Draw hexagonal node
      ctx.beginPath()
      const sides = 6
      const angle = Math.PI / 6 // Start at flat top
      for (let i = 0; i < sides; i++) {
        const a = angle + (i * 2 * Math.PI) / sides
        const px = x + size * Math.cos(a)
        const py = y + size * Math.sin(a)
        if (i === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.closePath()

      // Fill color based on state
      if (isGoalCompleted) {
        ctx.fillStyle = '#22c55e' // Green for completed goal
      } else if (node.isGoal) {
        ctx.fillStyle = '#2A2A2A'
      } else if (node.isStart) {
        ctx.fillStyle = '#F4B400'
      } else if (isSelected) {
        ctx.fillStyle = '#FFB800'
      } else {
        ctx.fillStyle = '#3A3A3A'
      }
      ctx.fill()

      // Border
      ctx.strokeStyle = isSelected ? '#FFB800' : isStartOrGoal ? '#F4B400' : '#5A5A5A'
      ctx.lineWidth = isSelected ? 3 / globalScale : 2 / globalScale
      ctx.stroke()

      // Draw text
      ctx.font = `${isStartOrGoal ? 'bold' : 'normal'} ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // Text color
      if (node.isStart || isSelected) {
        ctx.fillStyle = '#0D0D0D'
      } else if (isGoalCompleted) {
        ctx.fillStyle = '#ffffff'
      } else {
        ctx.fillStyle = '#ffffff'
      }

      // Truncate long words
      const maxChars = 12
      const displayLabel = label.length > maxChars ? label.slice(0, maxChars - 2) + '...' : label
      ctx.fillText(displayLabel, x, y)

      // Draw parts below for selected node
      if (isSelected && node.parts.length > 1) {
        ctx.font = `${fontSize * 0.7}px Inter, system-ui, sans-serif`
        ctx.fillStyle = '#F4B400'
        const partsText = node.parts.join(' + ')
        ctx.fillText(partsText, x, y + size + fontSize * 0.8)
      }
    },
    [selectedNodeId]
  )

  // Custom link rendering
  const drawLink = useCallback(
    (link: ForceGraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sourceNode = link.source as ForceGraphNode
      const targetNode = link.target as ForceGraphNode

      if (!sourceNode.x || !sourceNode.y || !targetNode.x || !targetNode.y) return

      const isWinningEdge =
        isComplete &&
        ((targetNode.isGoal && targetNode.isCompleted) ||
          (sourceNode.isGoal && sourceNode.isCompleted))

      ctx.beginPath()

      // Calculate control point for curved line
      const midX = (sourceNode.x + targetNode.x) / 2
      const midY = (sourceNode.y + targetNode.y) / 2
      const dx = targetNode.x - sourceNode.x
      const dy = targetNode.y - sourceNode.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      // Curve amount based on distance
      const curveOffset = Math.min(dist * 0.15, 30)
      const perpX = -dy / dist
      const perpY = dx / dist
      const controlX = midX + perpX * curveOffset
      const controlY = midY + perpY * curveOffset

      ctx.moveTo(sourceNode.x, sourceNode.y)
      ctx.quadraticCurveTo(controlX, controlY, targetNode.x, targetNode.y)

      // Gradient stroke
      const gradient = ctx.createLinearGradient(
        sourceNode.x,
        sourceNode.y,
        targetNode.x,
        targetNode.y
      )

      if (isWinningEdge) {
        gradient.addColorStop(0, '#22c55e')
        gradient.addColorStop(1, '#16a34a')
      } else {
        gradient.addColorStop(0, 'rgba(244, 180, 0, 0.6)')
        gradient.addColorStop(1, 'rgba(255, 184, 0, 0.6)')
      }

      ctx.strokeStyle = gradient
      ctx.lineWidth = isWinningEdge ? 3 / globalScale : 2 / globalScale
      ctx.stroke()

      // Draw shared part label at midpoint
      if (link.sharedPart && globalScale > 0.5) {
        const labelX = controlX
        const labelY = controlY
        const fontSize = Math.max(9 / globalScale, 8)

        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Background
        const textWidth = ctx.measureText(link.sharedPart).width
        ctx.fillStyle = 'rgba(13, 13, 13, 0.8)'
        ctx.fillRect(
          labelX - textWidth / 2 - 4,
          labelY - fontSize / 2 - 2,
          textWidth + 8,
          fontSize + 4
        )

        // Text
        ctx.fillStyle = isWinningEdge ? '#22c55e' : '#F4B400'
        ctx.fillText(link.sharedPart, labelX, labelY)
      }
    },
    [isComplete]
  )

  // Handle node click
  const handleNodeClick = useCallback(
    (node: ForceGraphNode) => {
      if (!node.isGoal || node.isCompleted) {
        onNodeSelect(node.id)
      }
    },
    [onNodeSelect]
  )

  // Zoom to fit when nodes change
  useEffect(() => {
    if (graphRef.current && nodes.length > 2) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, 500)
    }
  }, [nodes.length])

  // Force simulation configuration
  const forceConfig = useMemo(
    () => ({
      // Push nodes horizontally based on layer
      forceX: {
        strength: 0.1,
        x: (node: ForceGraphNode) => {
          if (node.isStart) return 80
          if (node.isGoal) return dimensions.width - 80
          const layerWidth = (dimensions.width - 200) / Math.max(nodes.length, 3)
          return 120 + node.layer * layerWidth
        },
      },
      // Center vertically
      forceY: {
        strength: 0.1,
        y: dimensions.height / 2,
      },
      // Collision detection
      collide: {
        radius: 50,
        strength: 1,
      },
      // Link force
      link: {
        distance: 120,
        strength: 0.5,
      },
      // Charge (repulsion)
      charge: {
        strength: -200,
        distanceMax: 300,
      },
    }),
    [dimensions, nodes.length]
  )

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-transparent"
      style={{ minHeight: '400px' }}
    >
      {typeof window !== 'undefined' && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          nodeCanvasObject={drawNode}
          linkCanvasObject={drawLink}
          onNodeClick={handleNodeClick}
          nodePointerAreaPaint={(node: ForceGraphNode, color, ctx) => {
            const size = node.isStart || node.isGoal ? 35 : 25
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x || 0, node.y || 0, size, 0, 2 * Math.PI)
            ctx.fill()
          }}
          enablePanInteraction={true}
          enableZoomInteraction={true}
          minZoom={0.3}
          maxZoom={3}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          cooldownTicks={100}
          warmupTicks={50}
          d3Force="forceX"
          d3ForceConfig={forceConfig.forceX}
        />
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          onClick={() => graphRef.current?.zoom(1.5, 400)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 
                     text-hive-yellow flex items-center justify-center transition-colors
                     border border-hive-slate/50"
          aria-label="Zoom in"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M6 12h12" />
          </svg>
        </button>
        <button
          onClick={() => graphRef.current?.zoom(0.67, 400)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 
                     text-hive-yellow flex items-center justify-center transition-colors
                     border border-hive-slate/50"
          aria-label="Zoom out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h12" />
          </svg>
        </button>
        <button
          onClick={() => graphRef.current?.zoomToFit(400, 50)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 
                     text-hive-yellow flex items-center justify-center transition-colors
                     border border-hive-slate/50"
          aria-label="Fit to screen"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-hive-charcoal/80 backdrop-blur-sm rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-hive-yellow rounded-sm" />
          <span className="text-gray-300">Start</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 bg-hive-graphite border border-hive-yellow rounded-sm" />
          <span className="text-gray-300">Goal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
          <span className="text-gray-300">Completed</span>
        </div>
      </div>
    </div>
  )
}

