'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { GraphNode, GraphEdge } from '@/types'

interface MiniMapProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
}

export default function MiniMap({
  nodes,
  edges,
  selectedNodeId,
  onNodeClick,
}: MiniMapProps) {
  // Calculate positions for mini-map
  const { positions, bounds } = useMemo(() => {
    const layers: Record<number, GraphNode[]> = {}

    // Group nodes by layer
    nodes.forEach((node) => {
      const layer = node.isGoal ? 999 : node.layer
      if (!layers[layer]) layers[layer] = []
      layers[layer].push(node)
    })

    const layerKeys = Object.keys(layers)
      .map(Number)
      .sort((a, b) => a - b)

    const positions: Record<string, { x: number; y: number }> = {}
    const padding = 10
    const nodeSize = 8
    const layerGap = 30
    const nodeGap = 15

    let maxX = 0
    let maxY = 0

    layerKeys.forEach((layer, layerIndex) => {
      const nodesInLayer = layers[layer]
      const x = padding + layerIndex * layerGap

      nodesInLayer.forEach((node, nodeIndex) => {
        const y = padding + nodeIndex * nodeGap
        positions[node.id] = { x, y }
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      })
    })

    return {
      positions,
      bounds: {
        width: maxX + padding + nodeSize,
        height: maxY + padding + nodeSize,
      },
    }
  }, [nodes])

  if (nodes.length <= 3) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute top-20 right-4 bg-hive-charcoal/90 backdrop-blur-sm
                 rounded-lg border border-hive-graphite p-2 shadow-lg"
    >
      <svg
        width={Math.min(bounds.width, 150)}
        height={Math.min(bounds.height, 100)}
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        className="overflow-visible"
      >
        {/* Edges */}
        {edges.map((edge) => {
          const sourcePos = positions[edge.source]
          const targetPos = positions[edge.target]
          if (!sourcePos || !targetPos) return null

          return (
            <line
              key={edge.id}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
              stroke="rgba(244, 180, 0, 0.3)"
              strokeWidth={1}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = positions[node.id]
          if (!pos) return null

          const isSelected = node.id === selectedNodeId
          const isSpecial = node.isStart || node.isGoal
          const isCompleted = node.isGoal && node.isCompleted

          return (
            <g
              key={node.id}
              onClick={() => !node.isGoal && onNodeClick(node.id)}
              style={{ cursor: node.isGoal ? 'default' : 'pointer' }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSpecial ? 5 : 3}
                fill={
                  isCompleted
                    ? '#22c55e'
                    : node.isStart
                    ? '#F4B400'
                    : isSelected
                    ? '#FFB800'
                    : '#5A5A5A'
                }
                stroke={isSelected ? '#FFB800' : 'transparent'}
                strokeWidth={2}
              />
            </g>
          )
        })}
      </svg>

      <div className="mt-1 text-center text-[10px] text-gray-500">
        {nodes.length - 2} words
      </div>
    </motion.div>
  )
}

