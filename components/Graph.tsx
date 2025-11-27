'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import { forceCollide, forceManyBody, forceX, forceY } from 'd3-force'
import type { GraphEdge, GraphNode, GraphProps } from '@/types'
import { computeGraphLayout, FIXED_HORIZONTAL_SPACING } from '@/lib/graph-layout'
import { useMotionPreference } from '@/hooks/useMotionPreference'

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

const SIMULATION_DURATION_MS = 1100
const CHARGE_STRENGTH = -520
const LINK_DISTANCE_FORWARD = FIXED_HORIZONTAL_SPACING - 20
const LINK_DISTANCE_SIDE = Math.round(FIXED_HORIZONTAL_SPACING * 0.65)
const LINK_STRENGTH_FORWARD = 0.95
const LINK_STRENGTH_SIDE = 0.35
const COLLIDE_RADIUS_DEFAULT = 80
const COLLIDE_RADIUS_ANCHORED = 95
const COLLIDE_STRENGTH = 0.8
// Reduced pointer radius to prevent overlap (40px radius = 80px diameter on screen)
const POINTER_RADIUS_DEFAULT = 40
const POINTER_RADIUS_ANCHORED = 60
const SAME_LAYER_X_EPSILON = 10
const NEAR_VERTICAL_HORIZONTAL_DRIFT = 14
const START_HEIGHT_TOLERANCE = 1.5

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

const MIN_VISUAL_SCALE = 0.2

const getZoomCompensation = (node: ForceLayoutNode, globalScale: number): number => {
  if (node.isStart || node.isGoal) return 1
  if (globalScale >= 1) return 1
  const normalized = Math.max(Math.min(globalScale, 1), MIN_VISUAL_SCALE)
  return normalized * normalized
}

const getRenderedNodeSize = (node: ForceLayoutNode, globalScale: number): number => {
  const baseSize = node.isStart || node.isGoal ? 38 : 28
  const inverseScale = 1 / Math.max(globalScale, 0.001)
  return baseSize * inverseScale * getZoomCompensation(node, globalScale)
}

const getNodeVisualRadius = (node: ForceLayoutNode, globalScale: number): number => {
  const size = getRenderedNodeSize(node, globalScale)
  // Use the full size (circumradius) to ensure edges don't overlap with hexagon
  // The hexagon vertices are at distance 'size' from center
  // Adding a small buffer to account for stroke width
  const strokeWidth = 2.5 / Math.max(globalScale, 0.001)
  return size + strokeWidth / 2
}

const isSideBranchLineage = (node?: { branchId?: string }): boolean =>
  !!node?.branchId && node.branchId.includes('-side-')

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
  const pageVisibilityRef = useRef(true)
  const { effectivePreference } = useMotionPreference()

  const [dimensions, setDimensions] = useState({ width: 800, height: 520 })
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')

  const refreshGraph = useCallback(() => {
    const api = graphRef.current as (ForceGraphMethods & { refresh?: () => void }) | null
    api?.refresh?.()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibility = () => {
      pageVisibilityRef.current = !document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setDimensions({
        width: rect.width || 800,
        height: rect.height || 520,
      })
      setOrientation(rect.width < 768 ? 'vertical' : 'horizontal')
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Compute layout with strict rules
  const layout = useMemo(
    () => computeGraphLayout(
      nodes, 
      edges, 
      orientation === 'horizontal' ? Math.max(dimensions.height, 480) : Math.max(dimensions.width, 350),
      orientation
    ),
    [nodes, edges, dimensions.height, dimensions.width, orientation]
  )

  const startAnchor = useMemo(() => {
    if (!layout.startNodeId) return null
    return layout.nodeMeta.get(layout.startNodeId) ?? null
  }, [layout])

  const startAnchorPosition = useMemo(() => {
    if (!startAnchor) return null
    return { x: startAnchor.targetX, y: startAnchor.targetY }
  }, [startAnchor])

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

  // Identify nodes that connect to the goal (but aren't the goal itself)
  const nodesConnectedToGoal = useMemo(() => {
    const connectedNodeIds = new Set<string>()
    
    // Find the original goal node (id='goal')
    const goalNodeId = nodes.find(n => n.id === 'goal')?.id
    
    edges.forEach((edge) => {
      const sourceId = resolveId(edge.source)
      const targetId = resolveId(edge.target)
      // If target is goal, source connects to goal
      if (targetId === 'goal' && sourceId && sourceId !== 'goal') {
        connectedNodeIds.add(sourceId)
      }
      // If source is goal, target connects to goal (bidirectional check)
      if (sourceId === 'goal' && targetId && targetId !== 'goal') {
        connectedNodeIds.add(targetId)
      }
    })
    
    // Also include nodes that are marked as goal but aren't the original goal node
    // These are winning word nodes that connect to the goal
    nodes.forEach((node) => {
      if (node.isGoal && node.id !== 'goal') {
        connectedNodeIds.add(node.id)
      }
    })
    
    return connectedNodeIds
  }, [edges, nodes])

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

      // CRITICAL: Pin both axis positions so forces only smooth transitions
      base.fx = node.targetX
      base.fy = node.targetY

      if (base.fx === null) base.fx = node.targetX
      if (base.fy === null) base.fy = node.targetY

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

    // Remove duplicate edges and edges that span over other connected nodes on the same layer
    // (e.g., if A→B→C exist on same layer, remove A→C as it overlaps visually)
    const seenEdges = new Set<string>()
    const edgeSet = new Set<string>()
    
    // First pass: collect all edges
    graphLinks.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source
      const targetId = typeof link.target === 'string' ? link.target : link.target
      edgeSet.add(`${sourceId}->${targetId}`)
    })
    
    // Build adjacency for same-layer nodes
    const nodeById = new Map(graphNodes.map((n) => [n.id, n]))
    
    const uniqueLinks = graphLinks.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source
      const targetId = typeof link.target === 'string' ? link.target : link.target
      const key = `${sourceId}->${targetId}`
      const reverseKey = `${targetId}->${sourceId}`
      
      // Skip exact duplicates
      if (seenEdges.has(key) || seenEdges.has(reverseKey)) {
        return false
      }
      
      const sourceNode = nodeById.get(sourceId)
      const targetNode = nodeById.get(targetId)
      
      // Check if source and target are on the same layer (vertical edge)
      if (sourceNode && targetNode) {
        const sameLayer = Math.abs(sourceNode.targetX - targetNode.targetX) < 50
        
        if (sameLayer) {
          // Check if there's an intermediate node that both connect to
          // If A→B and B→C exist, then A→C should be removed
          const hasIntermediateNode = graphNodes.some((node) => {
            if (node.id === sourceId || node.id === targetId) return false
            
            // Check if this node is on the same layer
            if (Math.abs(node.targetX - sourceNode.targetX) > 50) return false
            
            // Check if this node is vertically between source and target
            const minY = Math.min(sourceNode.targetY, targetNode.targetY)
            const maxY = Math.max(sourceNode.targetY, targetNode.targetY)
            if (node.targetY <= minY || node.targetY >= maxY) return false
            
            // Check if edges exist through this intermediate node
            const hasPathThrough = 
              (edgeSet.has(`${sourceId}->${node.id}`) || edgeSet.has(`${node.id}->${sourceId}`)) &&
              (edgeSet.has(`${node.id}->${targetId}`) || edgeSet.has(`${targetId}->${node.id}`))
            
            return hasPathThrough
          })
          
          if (hasIntermediateNode) {
            // This edge spans over an intermediate connected node - remove it
            return false
          }
        }
      }
      
      seenEdges.add(key)
      return true
    })

    return {
      nodes: graphNodes as any, // Type assertion needed for react-force-graph compatibility
      links: uniqueLinks,
    }
  }, [layout, edges, winningEdgeIds])

  // Configure strict simulation so forces only smooth jitter, never pick layout
  const configureForces = useCallback(() => {
    const fg = graphRef.current as (ForceGraphMethods & {
      d3AlphaTarget?: (alpha: number) => ForceGraphMethods
      d3ReheatSimulation?: () => void
      graphData?: () => { nodes: ForceLayoutNode[] }
      d3Force?: (forceName: string, force?: unknown) => any
    }) | null

    if (!fg) return

    const linkForce = fg.d3Force?.('link')
    if (linkForce) {
      linkForce
        .distance((link: ForceLayoutLink) =>
          link.branchType === 'side' ? LINK_DISTANCE_SIDE : LINK_DISTANCE_FORWARD
        )
        .strength((link: ForceLayoutLink) =>
          link.branchType === 'side' ? LINK_STRENGTH_SIDE : LINK_STRENGTH_FORWARD
        )
    }

    fg.d3Force?.(
      'charge',
      forceManyBody<ForceLayoutNode>()
        .strength(CHARGE_STRENGTH)
        .distanceMin(80)
        .distanceMax(1400)
    )

    fg.d3Force?.(
      'x',
      forceX<ForceLayoutNode>((node) => node.targetX).strength(orientation === 'horizontal' ? 1.2 : 0.9)
    )

    fg.d3Force?.(
      'y',
      forceY<ForceLayoutNode>((node) => node.targetY).strength(orientation === 'horizontal' ? 0.9 : 1.2)
    )

    fg.d3Force?.(
      'collide',
      forceCollide<ForceLayoutNode>((node) => getDynamicCollideRadius(node)).strength(
        COLLIDE_STRENGTH
      )
    )

    fg.d3Force?.('center', null)

    if ('d3AlphaTarget' in fg) {
      ;(fg as any).d3AlphaTarget(0.95)
      ;(fg as any).d3ReheatSimulation?.()

      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
      }

      settleTimerRef.current = window.setTimeout(() => {
        if ('d3AlphaTarget' in fg) {
          ;(fg as any).d3AlphaTarget(0)
        }
        const data = fg.graphData?.()
        if (data?.nodes) {
          data.nodes.forEach((node) => {
            node.fx = node.targetX
            node.fy = node.targetY
          })
        }
      }, SIMULATION_DURATION_MS)
    }
  }, [orientation])

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

    if (!isComplete || effectivePreference === 'reduced') {
      winningPulseRef.current = 0
      refreshGraph()
      return
    }

    const animate = () => {
      if (!pageVisibilityRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      winningPulseRef.current = (performance.now() % 2000) / 2000 // 2 second cycle
      refreshGraph()
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [effectivePreference, isComplete, refreshGraph])

  // Track if initial centering has happened
  const hasInitializedRef = useRef(false)

  // Handle initial graph render - zoom to fit after first frame
  const handleRenderFrame = useCallback(() => {
    if (hasInitializedRef.current) return
    if (!graphRef.current) return
    
    // Mark as initialized and zoom to fit
    hasInitializedRef.current = true
    graphRef.current.zoomToFit(400, 80)
  }, [])

  // Auto-zoom to fit graph (skip on initial load - handled by onRenderFramePost)
  useEffect(() => {
    if (!graphRef.current || nodes.length < 2) return
    if (!hasInitializedRef.current) return // Skip initial load
    graphRef.current.zoomToFit(500, 60)
  }, [dimensions.width, dimensions.height, layout.maxLayer, nodes.length])

  // Center on selected node or frontier (skip on initial load)
  useEffect(() => {
    if (!graphRef.current) return
    if (!hasInitializedRef.current) return // Skip initial load
    const anchorId = selectedNodeId ?? layout.farthestNodeId ?? layout.startNodeId
    if (!anchorId) return
    const anchorNode = layout.nodeMeta.get(anchorId)
    if (!anchorNode) return
    graphRef.current.centerAt(anchorNode.targetX, anchorNode.targetY, 600)
  }, [selectedNodeId, layout.farthestNodeId, layout.startNodeId, layout.goalLayer, layout.nodeMeta])

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
    
    if (orientation === 'horizontal') {
      // CRITICAL: Lock X position - node cannot move horizontally
      node.fx = node.targetX
      if (typeof node.x === 'number') node.x = node.targetX
      // Allow Y to move freely during drag
      node.fy = null
    } else {
      // CRITICAL: Lock Y position - node cannot move vertically
      node.fy = node.targetY
      if (typeof node.y === 'number') node.y = node.targetY
      // Allow X to move freely during drag
      node.fx = null
    }
    
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
      const connectsToGoal = nodesConnectedToGoal.has(node.id) && node.id !== 'goal'
      const size = getRenderedNodeSize(node, globalScale)

      // Draw glow/halo - enhanced for nodes connected to goal
      ctx.save()
      ctx.beginPath()
      if (connectsToGoal) {
        // Double glow effect for nodes connected to goal - outer ring
        const gradient = ctx.createRadialGradient(x, y, size * 0.55, x, y, size * 0.9)
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.4)')
        gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.25)')
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)')
        ctx.fillStyle = gradient
        ctx.arc(x, y, size * 0.9, 0, Math.PI * 2)
        ctx.fill()
        // Inner brighter glow
        ctx.fillStyle = 'rgba(34, 197, 94, 0.3)'
        ctx.arc(x, y, size * 0.7, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = isSelected
          ? 'rgba(244, 180, 0, 0.4)'
          : node.isGoal
          ? 'rgba(244, 180, 0, 0.25)'
          : 'rgba(244, 180, 0, 0.15)'
        ctx.arc(x, y, size * 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
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
        : connectsToGoal
        ? '#0A1F0A' // Very dark green background for nodes connected to goal
        : '#0F0D09'
      ctx.shadowColor = connectsToGoal 
        ? 'rgba(34, 197, 94, 0.8)' // Green shadow for nodes connected to goal
        : isSelected 
        ? 'rgba(255, 196, 0, 0.9)' 
        : 'rgba(244, 180, 0, 0.45)'
      ctx.shadowBlur = connectsToGoal ? 20 : isSelected ? 25 : 12
      ctx.fill()

      // Draw border - thicker and double for nodes connected to goal
      if (connectsToGoal) {
        // Outer border - bright green
        ctx.lineWidth = 4 / globalScale
        ctx.strokeStyle = '#22c55e'
        ctx.stroke()
        // Inner border - lighter green
        ctx.lineWidth = 2 / globalScale
        ctx.strokeStyle = '#4ade80'
        ctx.stroke()
      } else {
        ctx.lineWidth = 2.5 / globalScale
        ctx.strokeStyle = node.isGoal
          ? '#F4B400'
          : node.isStart
          ? '#1A1406'
          : isSelected
          ? '#FFD369'
          : '#3C3223'
        ctx.stroke()
      }
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
    [selectedNodeId, nodesConnectedToGoal]
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

      // Check if nodes are on the same layer
      const sourceTargetX = source.targetX ?? source.x
      const targetTargetX = target.targetX ?? target.x
      const sourceTargetY = source.targetY ?? source.y
      const targetTargetY = target.targetY ?? target.y
      
      const sameLayer = orientation === 'horizontal'
        ? Math.abs(sourceTargetX - targetTargetX) < SAME_LAYER_X_EPSILON
        : Math.abs(sourceTargetY - targetTargetY) < SAME_LAYER_X_EPSILON

      const mainAxisDrift = orientation === 'horizontal' ? Math.abs(dx) : Math.abs(dy)
      const nearlyPerpendicular = sameLayer || mainAxisDrift < NEAR_VERTICAL_HORIZONTAL_DRIFT
      const shouldRenderStaple = nearlyPerpendicular
      
      const isSideLineageEdge =
        link.branchType === 'side' ||
        (isSideBranchLineage(source) && isSideBranchLineage(target))
      const isStapleEdge = shouldRenderStaple

      const needsPaddedEndpoints = isSideLineageEdge || isStapleEdge
      let sourceRadius = 0
      let targetRadius = 0
      if (needsPaddedEndpoints) {
        sourceRadius = getNodeVisualRadius(source, globalScale)
        targetRadius = getNodeVisualRadius(target, globalScale)
      }

      let startX = source.x
      let startY = source.y
      let endX = target.x
      let endY = target.y
      let controlX = (startX + endX) / 2
      let controlY = (startY + endY) / 2

      ctx.save()
      ctx.beginPath()

      const computeCurveStrength = (baseStrength: number) => {
        if (!startAnchorPosition) return baseStrength
        const anchorPos = orientation === 'horizontal' ? startAnchorPosition.x : startAnchorPosition.y
        const sourcePos = orientation === 'horizontal' ? (source.targetX ?? source.x ?? anchorPos) : (source.targetY ?? source.y ?? anchorPos)
        const distanceFromStart = Math.abs(sourcePos - anchorPos)
        const normalized = Math.min(distanceFromStart / (FIXED_HORIZONTAL_SPACING * 6), 1)
        const attenuation = Math.max(0.3, 1 - normalized * 0.7)
        return baseStrength * attenuation
      }

      const getCurveMode = () => {
        if (!startAnchorPosition) return { direction: 1, isFlat: false }
        const anchorCross = orientation === 'horizontal' ? startAnchorPosition.y : startAnchorPosition.x
        const sourceCross = orientation === 'horizontal' ? (source.targetY ?? source.y ?? anchorCross) : (source.targetX ?? source.x ?? anchorCross)
        const delta = sourceCross - anchorCross
        if (Math.abs(delta) <= START_HEIGHT_TOLERANCE) {
          return { direction: 0, isFlat: true }
        }
        return { direction: delta < 0 ? -1 : 1, isFlat: false }
      }
      const { direction: curveDirection, isFlat: isFlatToStart } = getCurveMode()

      if (isStapleEdge) {
        if (orientation === 'horizontal') {
          const verticalDir = dy >= 0 ? 1 : -1
          startY = source.y + verticalDir * sourceRadius
          endY = target.y - verticalDir * targetRadius
        } else {
          const horizontalDir = dx >= 0 ? 1 : -1
          startX = source.x + horizontalDir * sourceRadius
          endX = target.x - horizontalDir * targetRadius
        }

        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)

        controlX = (startX + endX) / 2
        controlY = (startY + endY) / 2
      } else if (isSideLineageEdge) {
        // Calculate direction vector (normalized)
        const dirX = dx / distance
        const dirY = dy / distance

        // Offset start/end points using node radii so the curve leaves from the hexagon edge
        startX = source.x + dirX * sourceRadius
        startY = source.y + dirY * sourceRadius
        endX = target.x - dirX * targetRadius
        endY = target.y - dirY * targetRadius

        ctx.moveTo(startX, startY)

        // Curved bezier path for nodes on different layers
        const paddedDx = endX - startX
        const paddedDy = endY - startY
        const paddedDistance = Math.sqrt(paddedDx * paddedDx + paddedDy * paddedDy) || 1
        const paddedDirX = paddedDx / paddedDistance
        const paddedDirY = paddedDy / paddedDistance

        if (isFlatToStart) {
          controlX = (startX + endX) / 2
          controlY = (startY + endY) / 2
          ctx.quadraticCurveTo(controlX, controlY, endX, endY)
        } else {
          const curveStrength = computeCurveStrength(0.4)
          const perpX = -paddedDirY * curveDirection
          const perpY = paddedDirX * curveDirection
          const horizontalOffset = perpX * paddedDistance * curveStrength
          const verticalOffset = perpY * paddedDistance * curveStrength
          controlX = (startX + endX) / 2 + horizontalOffset
          controlY = (startY + endY) / 2 + verticalOffset
          ctx.quadraticCurveTo(controlX, controlY, endX, endY)
        }
      } else {
        ctx.moveTo(startX, startY)

        if (sameLayer) {
          ctx.lineTo(endX, endY)
          controlX = (startX + endX) / 2
          controlY = (startY + endY) / 2
        } else {
          if (isFlatToStart) {
            controlX = (source.x + target.x) / 2
            controlY = (source.y + target.y) / 2
            ctx.quadraticCurveTo(controlX, controlY, endX, endY)
          } else {
            const curveStrength = computeCurveStrength(0.15)
            const perpX = (-dy / distance) * curveDirection
            const perpY = (dx / distance) * curveDirection
            const horizontalOffset = perpX * distance * curveStrength
            const verticalOffset = perpY * distance * curveStrength
            controlX = (source.x + target.x) / 2 + horizontalOffset
            controlY = (source.y + target.y) / 2 + verticalOffset
            ctx.quadraticCurveTo(controlX, controlY, endX, endY)
          }
        }
      }

      // Dash stapled edges (non-winning) so all vertical connections look consistent
      if ((isSideLineageEdge || isStapleEdge) && !link.isWinning) {
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
      } else if (isSideLineageEdge || isStapleEdge) {
        // Side or stapled branch: dimmer
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
        : isSideLineageEdge || isStapleEdge
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
        
        // Calculate the actual midpoint on the quadratic Bezier curve at t=0.5
        // Formula: B(0.5) = 0.25*start + 0.5*control + 0.25*end
        const labelX = 0.25 * startX + 0.5 * controlX + 0.25 * endX
        const labelY = 0.25 * startY + 0.5 * controlY + 0.25 * endY
        const labelWidth = ctx.measureText(link.sharedPart).width

        ctx.fillStyle = 'rgba(7, 6, 4, 0.85)'
        ctx.fillRect(
          labelX - labelWidth / 2 - 6,
          labelY - fontSize / 2 - 3,
          labelWidth + 12,
          fontSize + 6
        )

        ctx.fillStyle = (isSideLineageEdge || isStapleEdge) ? '#F6E0A0' : '#F4B400'
        ctx.fillText(link.sharedPart, labelX, labelY)
        ctx.restore()
      }
    },
    [isComplete, startAnchorPosition, orientation]
  )

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-transparent touch-none"
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
          onRenderFramePost={handleRenderFrame}
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

      <div className="hidden lg:block absolute top-4 left-4 bg-hive-charcoal/80 backdrop-blur-sm rounded-lg p-3 text-xs space-y-2 border border-hive-slate/40">
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
