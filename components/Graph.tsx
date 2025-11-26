'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide, forceX, forceY } from 'd3-force'
import type { GraphEdge, GraphNode, GraphProps } from '@/types'
import { computeGraphLayout, FIXED_HORIZONTAL_SPACING } from '@/lib/graph-layout'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-hive-yellow animate-pulse">Loading graph...</div>
    </div>
  ),
})

type BranchKind = 'origin' | 'forward' | 'side'

interface ForceLayoutNode extends GraphNode {
  targetX: number
  targetY: number
  absoluteY: number
  branchId: string
  branchType: BranchKind
  parentId?: string
  computedLayer: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface ForceLayoutLink extends GraphEdge {
  branchType: 'forward' | 'side'
  isWinning: boolean
  isPrimary: boolean
}

const SIMULATION_DURATION_MS = 1000
const CHARGE_STRENGTH = -520
const LINK_DISTANCE_FORWARD = 280
const LINK_DISTANCE_SIDE = 180
const LINK_STRENGTH_FORWARD = 0.9
const LINK_STRENGTH_SIDE = 0.25
const COLLIDE_RADIUS_DEFAULT = 60
const COLLIDE_RADIUS_ANCHORED = 85
const COLLIDE_STRENGTH = 0.75
const POINTER_RADIUS_DEFAULT = 65
const POINTER_RADIUS_ANCHORED = 90

const resolveId = (value: string | GraphNode | undefined): string | undefined => {
  if (!value) return undefined
  return typeof value === 'string' ? value : value.id
}

const getDynamicCollideRadius = (node: ForceLayoutNode): number =>
  node.isGoal || node.isStart ? COLLIDE_RADIUS_ANCHORED : COLLIDE_RADIUS_DEFAULT

const getPointerHitRadius = (node: ForceLayoutNode, globalScale: number): number => {
  const base = node.isGoal || node.isStart ? POINTER_RADIUS_ANCHORED : POINTER_RADIUS_DEFAULT
  return base / Math.max(globalScale, 0.001)
}

const getNodeVisualRadius = (node: ForceLayoutNode, globalScale: number): number => {
  const baseSize = node.isStart || node.isGoal ? 38 : 28
  const size = baseSize / Math.max(globalScale, 0.001)
  // Use the full size (circumradius) to ensure edges don't overlap with hexagon
  // The hexagon vertices are at distance 'size' from center
  // Adding a small buffer to account for stroke width
  const strokeWidth = 2.5 / Math.max(globalScale, 0.001)
  return size + strokeWidth / 2
}

export default function Graph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  goalWord,
  isComplete,
  winningPath,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<any>(null)
  const settleTimerRef = useRef<number | null>(null)
  const winningPulseRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const draggedNodeRef = useRef<string | null>(null)
  const snapBackTimerRef = useRef<number | null>(null)
  const pointerScaleRef = useRef(1)

  const [dimensions, setDimensions] = useState({ width: 800, height: 520 })

  const refreshGraph = useCallback(() => {
    const api = graphRef.current as (ForceGraphMethods & { refresh?: () => void }) | null
    api?.refresh?.()
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setDimensions({
        width: rect.width || 800,
        height: rect.height || 520,
      })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Compute layout with strict rules
  const layout = useMemo(
    () => computeGraphLayout(nodes, edges, Math.max(dimensions.height, 480)),
    [nodes, edges, dimensions.height]
  )

  // Calculate winning edge IDs for highlighting
  const winningEdgeIds = useMemo(() => {
    if (!isComplete || winningPath.length < 2) {
      return new Set<string>()
    }

    const wordToNode = new Map(nodes.map((node) => [node.word.toLowerCase(), node.id]))
    const chain = new Set<string>()

    for (let i = 0; i < winningPath.length - 1; i++) {
      const fromId = wordToNode.get(winningPath[i].toLowerCase())
      const toId = wordToNode.get(winningPath[i + 1].toLowerCase())
      if (!fromId || !toId) continue
      const connectingEdge = edges.find(
        (edge) => resolveId(edge.source) === fromId && resolveId(edge.target) === toId
      )
      if (connectingEdge) {
        chain.add(connectingEdge.id)
      }
    }

    return chain
  }, [edges, nodes, winningPath, isComplete])

  // Prepare graph data with layout positions
  const graphData = useMemo(() => {
    const graphNodes: ForceLayoutNode[] = layout.nodes.map((node) => {
      const base: ForceLayoutNode = {
        ...node,
        x: node.x ?? node.targetX,
        y: node.y ?? node.targetY,
        targetX: node.targetX,
        targetY: node.targetY,
        absoluteY: node.absoluteY,
        branchType: node.branchType,
        computedLayer: node.computedLayer,
        branchId: node.branchId,
        parentId: node.parentId,
      }

      // CRITICAL: Pin X position - never let forces override it
      base.fx = node.targetX
      
      // Pin goal and start nodes completely
      if (node.isGoal || node.isStart) {
        base.fy = node.targetY
      }

      // Ensure fx/fy are not null (TypeScript compatibility)
      if (base.fx === null) base.fx = node.targetX
      if (base.fy === null && (node.isGoal || node.isStart)) base.fy = node.targetY

      return base
    })

    const graphLinks: ForceLayoutLink[] = edges.map((edge) => {
      const targetId = resolveId(edge.target)
      const sourceId = resolveId(edge.source)
      const targetMeta = targetId ? layout.nodeMeta.get(targetId) : undefined

      return {
        ...edge,
        source: sourceId ?? edge.source,
        target: targetId ?? edge.target,
        branchType: targetMeta?.branchType === 'side' ? 'side' : 'forward',
        isWinning: winningEdgeIds.has(edge.id),
        isPrimary: targetMeta?.parentId === sourceId,
      }
    })

    return { 
      nodes: graphNodes as any, // Type assertion needed for react-force-graph compatibility
      links: graphLinks 
    }
  }, [layout, edges, winningEdgeIds])

  // Configure forces - X positions are SACRED, forces only fine-tune Y
  const configureForces = useCallback(() => {
    if (!graphRef.current) return
    const fg = graphRef.current

    // Link force - stronger for forward links, weaker for side branches
    const linkForce = fg.d3Force('link')
    if (linkForce) {
      linkForce
        .distance((link: unknown) => {
          const l = link as ForceLayoutLink
          return l.branchType === 'side' ? LINK_DISTANCE_SIDE : LINK_DISTANCE_FORWARD
        })
        .strength((link: unknown) => {
          const l = link as ForceLayoutLink
          return l.branchType === 'side' ? LINK_STRENGTH_SIDE : LINK_STRENGTH_FORWARD
        })
    }

    // Charge force - mild repulsion to prevent overlaps
    const chargeForce = fg.d3Force('charge')
    if (chargeForce) {
      chargeForce.strength(CHARGE_STRENGTH).distanceMin(80).distanceMax(1400)
    }

    // CRITICAL: ForceX pushes nodes to their CORRECT layer position (never changes it)
    fg.d3Force(
      'x',
      forceX((node: any) => {
        const n = node as ForceLayoutNode
        return n.targetX ?? 0
      }).strength(1.0) // Maximum strength - X is immutable
    )
    
    // ForceY pulls nodes toward their ideal Y position (allows slight fine-tuning)
    fg.d3Force(
      'y',
      forceY((node: any) => {
        const n = node as ForceLayoutNode
        return n.targetY ?? 0
      }).strength(0.45) // Allow more breathing room vertically
    )
    
    // Collision force - last resort, only if needed
    fg.d3Force(
      'collide',
      forceCollide((node: any) => getDynamicCollideRadius(node as ForceLayoutNode)).strength(
        COLLIDE_STRENGTH
      )
    )
    
    // Disable center force - we control positions
    fg.d3Force('center', null)

    // Start simulation with high alpha
    if ('d3AlphaTarget' in fg) {
      (fg as any).d3AlphaTarget(0.9)
      ;(fg as any).d3ReheatSimulation()

      // Settle after simulation duration
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = window.setTimeout(() => {
        if (fg && 'd3AlphaTarget' in fg) {
          ;(fg as any).d3AlphaTarget(0)
          // Re-pin X positions after settling
          if ('graphData' in fg) {
            const data = (fg as any).graphData()
            if (data && data.nodes) {
              data.nodes.forEach((node: any) => {
                const n = node as ForceLayoutNode
                if (n) {
                  n.fx = n.targetX
                }
              })
            }
          }
        }
      }, SIMULATION_DURATION_MS)
    }
  }, [])

  // Reconfigure forces when graph data changes
  useEffect(() => {
    const timer = setTimeout(configureForces, 100)
    return () => clearTimeout(timer)
  }, [configureForces, graphData.nodes.length, graphData.links.length])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (snapBackTimerRef.current) {
        clearTimeout(snapBackTimerRef.current)
        snapBackTimerRef.current = null
      }
    }
  }, [])

  // Animate winning path pulse
  useEffect(() => {
    if (!graphRef.current) return
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (!isComplete) {
      refreshGraph()
      return
    }

    const animate = () => {
      winningPulseRef.current = (performance.now() % 2000) / 2000 // 2 second cycle
      refreshGraph()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [isComplete, refreshGraph])

  // Auto-zoom to fit graph
  useEffect(() => {
    if (!graphRef.current || nodes.length < 2) return
    graphRef.current.zoomToFit(500, 60)
  }, [dimensions.width, dimensions.height, layout.maxLayer, nodes.length])

  // Center on selected node or frontier
  useEffect(() => {
    if (!graphRef.current) return
    const anchorId = selectedNodeId ?? layout.farthestNodeId ?? layout.startNodeId
    if (!anchorId) return
    const anchorNode = layout.nodeMeta.get(anchorId)
    if (!anchorNode) return
    graphRef.current.centerAt(anchorNode.targetX, anchorNode.targetY, 600)
  }, [selectedNodeId, layout.farthestNodeId, layout.startNodeId, layout.goalLayer])

  const handleNodeClick = useCallback(
    (nodeObj: object) => {
      const node = nodeObj as ForceLayoutNode
      if (node.isGoal && !node.isCompleted) return
      onNodeSelect(node.id)
    },
    [onNodeSelect]
  )

  // Handle node dragging - enforce X constraint and allow Y movement
  const handleNodeDrag = useCallback((nodeObj: any) => {
    const node = nodeObj as ForceLayoutNode
    if (!node) return
    
    // Don't allow dragging start/goal nodes
    if (node.isStart || (node.isGoal && !node.isCompleted)) {
      // Re-pin immediately
      node.fx = node.targetX
      node.fy = node.targetY
      return
    }
    
    // Track that we're dragging this node
    if (!draggedNodeRef.current) {
      draggedNodeRef.current = node.id
    }
    
    // CRITICAL: Lock X position - node cannot move horizontally
    node.fx = node.targetX
    if (typeof node.x === 'number') {
      node.x = node.targetX
    }
    
    // Allow Y to move freely during drag
    node.fy = null
    
    // Reheat simulation for smooth dragging
    if (graphRef.current && 'd3ReheatSimulation' in graphRef.current) {
      ;(graphRef.current as any).d3ReheatSimulation()
    }
  }, [])

  // Handle node drag end - snap back to target position
  const handleNodeDragEnd = useCallback((nodeObj: any) => {
    const node = nodeObj as ForceLayoutNode
    if (!node) return
    
    const wasDragging = draggedNodeRef.current === node.id
    draggedNodeRef.current = null
    
    if (!wasDragging) return
    
    // Clear any existing snap-back timer
    if (snapBackTimerRef.current) {
      clearTimeout(snapBackTimerRef.current)
      snapBackTimerRef.current = null
    }
    
    // Re-enable forces to snap back smoothly
    node.fx = node.targetX // Re-pin X
    node.fy = node.targetY // Re-pin Y to snap back
    
    // Reheat simulation to animate the snap-back
    if (graphRef.current && 'd3ReheatSimulation' in graphRef.current) {
      ;(graphRef.current as any).d3AlphaTarget(0.3)
      ;(graphRef.current as any).d3ReheatSimulation()
    }
    
    // After snap-back animation, ensure position is locked
    snapBackTimerRef.current = window.setTimeout(() => {
      if (node) {
        node.fx = node.targetX
        node.fy = node.targetY
      }
      
      if (graphRef.current && 'd3AlphaTarget' in graphRef.current) {
        ;(graphRef.current as any).d3AlphaTarget(0)
      }
      
      snapBackTimerRef.current = null
      refreshGraph()
    }, 600) // Snap-back duration
  }, [refreshGraph])

  // Custom node rendering with hexagon shape
  const drawNode = useCallback(
    (nodeObj: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as ForceLayoutNode
      pointerScaleRef.current = globalScale
      const x = node.x ?? node.targetX
      const y = node.y ?? node.targetY
      const isSelected = node.id === selectedNodeId
      const isGoalCompleted = node.isGoal && node.isCompleted
      const baseSize = node.isStart || node.isGoal ? 38 : 28
      const size = baseSize / globalScale

      // Draw glow/halo
      ctx.save()
      ctx.beginPath()
      ctx.fillStyle = isSelected
        ? 'rgba(244, 180, 0, 0.4)'
        : node.isGoal
        ? 'rgba(244, 180, 0, 0.25)'
        : 'rgba(244, 180, 0, 0.15)'
      ctx.arc(x, y, size * 1.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Draw hexagon
      ctx.save()
      ctx.beginPath()
      const sides = 6
      const angle = Math.PI / 6
      for (let i = 0; i < sides; i++) {
        const a = angle + (i * 2 * Math.PI) / sides
        const px = x + size * Math.cos(a)
        const py = y + size * Math.sin(a)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()

      ctx.fillStyle = node.isGoal
        ? '#1C170F'
        : node.isStart
        ? '#F4B400'
        : isGoalCompleted
        ? '#22c55e'
        : '#0F0D09'
      ctx.shadowColor = isSelected ? 'rgba(255, 196, 0, 0.9)' : 'rgba(244, 180, 0, 0.45)'
      ctx.shadowBlur = isSelected ? 25 : 12
      ctx.fill()

      ctx.lineWidth = 2.5 / globalScale
      ctx.strokeStyle = node.isGoal
        ? '#F4B400'
        : node.isStart
        ? '#1A1406'
        : isSelected
        ? '#FFD369'
        : '#3C3223'
      ctx.stroke()
      ctx.restore()

      // Draw text with perfect readability
      const label = node.word.length > 14 ? `${node.word.slice(0, 12)}…` : node.word
      const fontSize = Math.max(16 / globalScale, 12)

      ctx.save()
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // Text shadow/outline for readability
      ctx.lineWidth = 4 / globalScale
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)'
      ctx.strokeText(label, x, y)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(label, x, y)
      ctx.restore()

      // Draw parts when selected
      if (isSelected && node.parts.length > 1) {
        ctx.save()
        const partsText = node.parts.join(' + ')
        const partFontSize = Math.max(fontSize * 0.65, 10)
        ctx.font = `500 ${partFontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#F4B400'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.lineWidth = 3 / globalScale
        ctx.strokeText(partsText, x, y + size + partFontSize * 0.4)
        ctx.fillText(partsText, x, y + size + partFontSize * 0.4)
        ctx.restore()
      }
    },
    [selectedNodeId]
  )

  // Custom link rendering with curved bezier edges
  const drawLink = useCallback(
    (linkObj: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = linkObj as ForceLayoutLink & {
        source: ForceLayoutNode
        target: ForceLayoutNode
      }
      const source = link.source
      const target = link.target
      if (
        !source ||
        !target ||
        typeof source.x !== 'number' ||
        typeof source.y !== 'number' ||
        typeof target.x !== 'number' ||
        typeof target.y !== 'number'
      ) {
        return
      }

      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
      
      // Check if nodes are on the same layer (same X position)
      // Use targetX to determine layer since it's calculated from layer * FIXED_HORIZONTAL_SPACING
      // Use a threshold to account for floating point precision and small force adjustments
      const sourceTargetX = source.targetX ?? source.x
      const targetTargetX = target.targetX ?? target.x
      const sameLayer = Math.abs(sourceTargetX - targetTargetX) < 10
      
      // For side branches, calculate padded start/end points at node boundaries
      let startX = source.x
      let startY = source.y
      let endX = target.x
      let endY = target.y
      let controlX: number
      let controlY: number
      
      if (link.branchType === 'side') {
        // Calculate direction vector (normalized)
        const dirX = dx / distance
        const dirY = dy / distance
        
        // Get node radii
        const sourceRadius = getNodeVisualRadius(source, globalScale)
        const targetRadius = getNodeVisualRadius(target, globalScale)
        
        // Offset start point: move from source center by source radius along direction
        startX = source.x + dirX * sourceRadius
        startY = source.y + dirY * sourceRadius
        
        // Offset end point: move from target center by target radius along reverse direction
        endX = target.x - dirX * targetRadius
        endY = target.y - dirY * targetRadius
        
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        
        if (sameLayer) {
          // Straight line for nodes on the same layer
          ctx.lineTo(endX, endY)
          // Control point for label positioning (midpoint)
          controlX = (startX + endX) / 2
          controlY = (startY + endY) / 2
        } else {
          // Curved bezier path for nodes on different layers
          // Recalculate distance and direction for padded points
          const paddedDx = endX - startX
          const paddedDy = endY - startY
          const paddedDistance = Math.sqrt(paddedDx * paddedDx + paddedDy * paddedDy) || 1
          
          // Update for curve calculation
          const paddedDirX = paddedDx / paddedDistance
          const paddedDirY = paddedDy / paddedDistance
          
          // Curved bezier path - more curve for side branches
          const curveStrength = 0.4
          const perpX = -paddedDirY
          const perpY = paddedDirX
          controlX = (startX + endX) / 2 + perpX * paddedDistance * curveStrength
          controlY = (startY + endY) / 2 + perpY * paddedDistance * curveStrength
          ctx.quadraticCurveTo(controlX, controlY, endX, endY)
        }
      } else {
        // Forward branches: use node centers (no padding)
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        
        if (sameLayer) {
          // Straight line for nodes on the same layer
          ctx.lineTo(endX, endY)
          // Control point for label positioning (midpoint)
          controlX = (startX + endX) / 2
          controlY = (startY + endY) / 2
        } else {
          // Curved bezier path for nodes on different layers
          const curveStrength = 0.15
          const perpX = -dy / distance
          const perpY = dx / distance
          controlX = (source.x + target.x) / 2 + perpX * distance * curveStrength
          controlY = (source.y + target.y) / 2 + perpY * distance * curveStrength
          ctx.quadraticCurveTo(controlX, controlY, endX, endY)
        }
      }

      // Dash side branches (non-winning)
      if (link.branchType === 'side' && !link.isWinning) {
        ctx.setLineDash([12 / globalScale, 10 / globalScale])
      } else {
        ctx.setLineDash([])
      }

      // Create gradient for edge color (use padded points for side branches)
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY)
      
      if (link.isWinning && isComplete) {
        // Winning path: animated golden glow
        const pulse = 0.7 + 0.3 * Math.sin(winningPulseRef.current * Math.PI * 2)
        gradient.addColorStop(0, `rgba(255, 215, 130, ${pulse})`)
        gradient.addColorStop(1, `rgba(244, 201, 89, ${pulse})`)
      } else if (link.branchType === 'side') {
        // Side branch: dimmer
        gradient.addColorStop(0, 'rgba(244, 180, 0, 0.45)')
        gradient.addColorStop(1, 'rgba(255, 220, 120, 0.25)')
      } else {
        // Forward branch: bright honey-yellow
        gradient.addColorStop(0, '#F4B400')
        gradient.addColorStop(1, '#FFD369')
      }

      ctx.strokeStyle = gradient
      ctx.lineWidth = link.isWinning
        ? (5 + 2 * Math.sin(winningPulseRef.current * Math.PI * 2)) / globalScale
        : link.branchType === 'side'
        ? 1.8 / globalScale
        : 2.8 / globalScale
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Draw shared part label on edge
      if (link.sharedPart && globalScale > 0.5) {
        ctx.save()
        const fontSize = Math.max(10 / globalScale, 8)
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const labelX = controlX
        const labelY = controlY
        const labelWidth = ctx.measureText(link.sharedPart).width

        ctx.fillStyle = 'rgba(7, 6, 4, 0.85)'
        ctx.fillRect(
          labelX - labelWidth / 2 - 6,
          labelY - fontSize / 2 - 3,
          labelWidth + 12,
          fontSize + 6
        )

        ctx.fillStyle = link.branchType === 'side' ? '#F6E0A0' : '#F4B400'
        ctx.fillText(link.sharedPart, labelX, labelY)
        ctx.restore()
      }
    },
    [isComplete]
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
          onNodeDrag={handleNodeDrag}
          onNodeDragEnd={handleNodeDragEnd}
          nodePointerAreaPaint={(nodeObj, color, ctx) => {
            const node = nodeObj as ForceLayoutNode
            const globalScale = pointerScaleRef.current || 1
            const radius = getPointerHitRadius(node, globalScale)
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x ?? node.targetX, node.y ?? node.targetY, radius, 0, Math.PI * 2)
            ctx.fill()
          }}
          enablePanInteraction
          enableZoomInteraction
          minZoom={0.25}
          maxZoom={3}
          d3VelocityDecay={0.5}
          d3AlphaDecay={0.02}
          cooldownTicks={0}
          warmupTicks={0}
        />
      )}

      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          onClick={() => graphRef.current?.zoom(1.4, 400)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 text-hive-yellow flex items-center justify-center border border-hive-slate/50 transition"
          aria-label="Zoom in"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M6 12h12" />
          </svg>
        </button>
        <button
          onClick={() => graphRef.current?.zoom(0.7, 400)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 text-hive-yellow flex items-center justify-center border border-hive-slate/50 transition"
          aria-label="Zoom out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h12" />
          </svg>
        </button>
        <button
          onClick={() => graphRef.current?.zoomToFit(500, 80)}
          className="w-10 h-10 rounded-lg bg-hive-graphite/80 hover:bg-hive-slate/80 text-hive-yellow flex items-center justify-center border border-hive-slate/50 transition"
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

      <div className="absolute top-4 left-4 bg-hive-charcoal/80 backdrop-blur-sm rounded-lg p-3 text-xs space-y-2 border border-hive-slate/40">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-hive-yellow rounded-sm" />
          <span className="text-gray-300">Start / Main highway</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border border-hive-yellow rounded-sm" />
          <span className="text-gray-300">Goal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-hive-yellow" />
          <span className="text-gray-300">Forward branch</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 border-t border-dashed border-hive-yellow" />
          <span className="text-gray-300">Side branches</span>
        </div>
        {isComplete && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gradient-to-r from-yellow-300 to-yellow-500" />
            <span className="text-gray-300">Winning chain</span>
          </div>
        )}
        <div className="text-[10px] text-gray-400 pt-1 border-t border-white/10">
          Goal anchor: {goalWord}
        </div>
      </div>
    </div>
  )
}
