'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ForceGraphMethods } from 'react-force-graph-2d'
// D3 force imports removed - no forces needed since positions come from layout
import type { GraphEdge, GraphNode, GraphProps } from '@/types'
import { computeGraphLayout} from '@/lib/graph-layout'
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

// Force simulation constants removed - positions come from layout, no forces needed
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

function Graph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  goalWord,
  isComplete,
  winningPath,
  graphSpacing,
  layoutVersion = 0,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<any>(null)
  const animationFrameRef = useRef<number | null>(null)
  const draggedNodeRef = useRef<string | null>(null)
  const snapBackTimerRef = useRef<number | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 })
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  
  const pointerScaleRef = useRef(1)
  const pageVisibilityRef = useRef(true)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const nodesConnectedToGoalRef = useRef<Set<string>>(new Set())
  const isCompleteRef = useRef(isComplete)
  const startAnchorPositionRef = useRef<{ x: number; y: number } | null>(null)
  const orientationRef = useRef(orientation)

  // Keep refs in sync with props for stable callback dependencies
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
    isCompleteRef.current = isComplete
    orientationRef.current = orientation
  }, [selectedNodeId, isComplete, orientation])

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

  // Get graph dimatiuons
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(rect.width, 100)  // Minimum width
      const newHeight = Math.max(rect.height, 100) // Minimum height
      
      // Only update if dimensions actually changed (performance optimization)
      setDimensions(prev => {
        if (Math.abs(prev.width - newWidth) > 1 || Math.abs(prev.height - newHeight) > 1) {
          return { width: newWidth, height: newHeight }
        }
        return prev
      })
    }

    // Initial update
    updateDimensions()

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, []) // Empty dependency array - only run once

  // Compute layout with strict rules
  const layout = useMemo(
    () => computeGraphLayout(
      nodes, 
      edges, 
      orientation === 'horizontal' ? Math.max(dimensions.height, 480) : Math.max(dimensions.width, 350),
      orientation,
      graphSpacing
    ),
    [nodes, edges, dimensions.height, dimensions.width, orientation, graphSpacing, layoutVersion]
  )

  // Calculate dynamic max zoom based on graph size
  // Smaller graphs can zoom in more for better detail viewing
  const maxZoom = useMemo(() => {
    const nodeCount = nodes.length
    if (nodeCount <= 5) return 8      // Very small graphs: 8x zoom
    if (nodeCount <= 10) return 6      // Small graphs: 6x zoom
    if (nodeCount <= 20) return 5      // Medium-small graphs: 5x zoom
    if (nodeCount <= 30) return 4      // Medium graphs: 4x zoom
    return 3                           // Large graphs: 3x zoom (default)
  }, [nodes.length])


  // Calculate winning edge IDs for highlighting
  // Track edges on the winning path both before and after completion
  const winningEdgeIds = useMemo(() => {
    // If path is only start and end
    if (winningPath.length < 2) {
      return new Set<string>()
    }

    const wordToNode = new Map(nodes.map((node) => [node.word.toLowerCase(), node.id]))
    const chain = new Set<string>()

    for (let i = 0; i < winningPath.length - 1; i++) {
      const fromId = wordToNode.get(winningPath[i].toLowerCase())
      const toId = wordToNode.get(winningPath[i + 1].toLowerCase())
      if (!fromId || !toId) continue
      
      // Check both directions since edges can go either way
      const connectingEdge = edges.find(
        (edge) => {
          const sourceId = resolveId(edge.source)
          const targetId = resolveId(edge.target)
          return (sourceId === fromId && targetId === toId) || 
                 (sourceId === toId && targetId === fromId)
        }
      )
      if (connectingEdge) {
        chain.add(connectingEdge.id)
      }
    }

    return chain
  }, [edges, nodes, winningPath])

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
    
    // Update ref for stable callback dependencies
    nodesConnectedToGoalRef.current = connectedNodeIds
    
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

      // Set exact positions - no forces, positions are from layout
      base.x = node.targetX
      base.y = node.targetY
      base.fx = node.targetX
      base.fy = node.targetY
      base.vx = 0
      base.vy = 0

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
    // Optimized with pre-computed data structures to avoid O(n²) lookups
    const seenEdges = new Set<string>()
    const edgeSet = new Set<string>()
    const nodeById = new Map(graphNodes.map((n) => [n.id, n]))
    
    // Pre-build edge adjacency maps for faster lookups
    const sourceToTargets = new Map<string, Set<string>>()
    const targetToSources = new Map<string, Set<string>>()
    
    // First pass: collect all edges and build adjacency maps
    graphLinks.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source
      const targetId = typeof link.target === 'string' ? link.target : link.target
      const key = `${sourceId}->${targetId}`
      edgeSet.add(key)
      
      if (!sourceToTargets.has(sourceId)) sourceToTargets.set(sourceId, new Set())
      if (!targetToSources.has(targetId)) targetToSources.set(targetId, new Set())
      sourceToTargets.get(sourceId)!.add(targetId)
      targetToSources.get(targetId)!.add(sourceId)
    })
    
    // Pre-build nodes by layer position (rounded to nearest 50px) for same-layer checks
    const nodesByLayerPos = new Map<number, ForceLayoutNode[]>()
    graphNodes.forEach((node) => {
      const layerPos = Math.round(node.targetX / 50) * 50
      if (!nodesByLayerPos.has(layerPos)) {
        nodesByLayerPos.set(layerPos, [])
      }
      nodesByLayerPos.get(layerPos)!.push(node)
    })
    
    // Helper to check if path exists through intermediate node
    const hasPathThrough = (sourceId: string, targetId: string, intermediateId: string): boolean => {
      const sourceToIntermediate = sourceToTargets.get(sourceId)?.has(intermediateId) || 
                                    targetToSources.get(intermediateId)?.has(sourceId) ||
                                    edgeSet.has(`${sourceId}->${intermediateId}`) ||
                                    edgeSet.has(`${intermediateId}->${sourceId}`)
      const intermediateToTarget = sourceToTargets.get(intermediateId)?.has(targetId) ||
                                    targetToSources.get(targetId)?.has(intermediateId) ||
                                    edgeSet.has(`${intermediateId}->${targetId}`) ||
                                    edgeSet.has(`${targetId}->${intermediateId}`)
      return Boolean(sourceToIntermediate && intermediateToTarget)
    }
    
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
      
      if (!sourceNode || !targetNode) {
        seenEdges.add(key)
        return true
      }
      
      // Check if source and target are on the same layer (vertical edge)
      const sameLayer = Math.abs(sourceNode.targetX - targetNode.targetX) < 50
      
      if (sameLayer) {
        // Only check intermediate nodes on the same layer (pre-filtered)
        const layerPos = Math.round(sourceNode.targetX / 50) * 50
        const sameLayerNodes = nodesByLayerPos.get(layerPos) || []
        
        const minY = Math.min(sourceNode.targetY, targetNode.targetY)
        const maxY = Math.max(sourceNode.targetY, targetNode.targetY)
        
        // Check for intermediate node with optimized lookup
        const hasIntermediateNode = sameLayerNodes.some((node) => {
          if (node.id === sourceId || node.id === targetId) return false
          
          // Check if this node is vertically between source and target
          if (node.targetY <= minY || node.targetY >= maxY) return false
          
          // Check if edges exist through this intermediate node (optimized lookup)
          return hasPathThrough(sourceId, targetId, node.id)
        })
        
        if (hasIntermediateNode) {
          // This edge spans over an intermediate connected node - remove it
          return false
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



  // Track if initial centering has happened
  const hasInitializedRef = useRef(false)
  const hasInitialZoomRef = useRef(false)




  // Center on selected node only (not on frontier changes)
  useEffect(() => {
    if (!graphRef.current) return
    if (!hasInitializedRef.current) return // Skip initial load
    if (hasInitialZoomRef.current) {
      // After initial zoom to fit, allow subsequent centering
      hasInitialZoomRef.current = false
      return
    }
    if (!selectedNodeId) return // Only center when user clicks a node
    const anchorNode = layout.nodeMeta.get(selectedNodeId)
    if (!anchorNode) return
    graphRef.current.centerAt(anchorNode.targetX, anchorNode.targetY, 600)
  }, [selectedNodeId, layout.nodeMeta])

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
    
    if (orientationRef.current === 'horizontal') {
      // Lock X position - node cannot move horizontally
      node.fx = node.targetX
      node.x = node.targetX
      // Allow Y to move during drag
      node.fy = null
    } else {
      // Lock Y position - node cannot move vertically
      node.fy = node.targetY
      node.y = node.targetY
      // Allow X to move during drag
      node.fx = null
    }
    
    // No simulation to reheat - positions set directly
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
    
    // Immediately snap back to target position (no animation, no simulation)
    node.x = node.targetX
    node.y = node.targetY
    node.fx = node.targetX
    node.fy = node.targetY
    node.vx = 0
    node.vy = 0
    
    refreshGraph()
  }, [refreshGraph])

  const drawNode = useCallback(
    (nodeObj: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as ForceLayoutNode
      const x = node.x ?? node.targetX
      const y = node.y ?? node.targetY
      const isSelected = node.id === selectedNodeId // Direct prop, no ref
      const isGoalCompleted = node.isGoal && node.isCompleted
      const connectsToGoal = nodesConnectedToGoal.has(node.id) && node.id !== 'goal' // Direct value, no ref
      const size = getRenderedNodeSize(node, globalScale)
      
      // Simplified glow
      ctx.save()
      if (connectsToGoal) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'
        ctx.beginPath()
        ctx.arc(x, y, size * 1.2, 0, Math.PI * 2)
        ctx.fill()
      } else if (isSelected || node.isGoal) {
        ctx.fillStyle = 'rgba(244, 180, 0, 0.2)'
        ctx.beginPath()
        ctx.arc(x, y, size * 1.2, 0, Math.PI * 2)
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
        ? '#0A1F0A'
        : '#0F0D09'
      ctx.fill()

      // Draw border
      if (connectsToGoal) {
        ctx.lineWidth = 4 / globalScale
        ctx.strokeStyle = '#22c55e'
        ctx.stroke()
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

      // Text rendering
      const label = node.word.length > 14 ? `${node.word.slice(0, 12)}…` : node.word
      const fontSize = size * 0.4

      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(label, x, y)

      // Draw parts when selected
      if (isSelected && node.parts.length > 1) {
        ctx.save()
        const partsText = node.parts.join(' + ')
        const partFontSize = fontSize * 0.65
        ctx.font = `500 ${partFontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#F4B400'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.lineWidth = partFontSize * 0.2
        ctx.strokeText(partsText, x, y + size + partFontSize * 0.4)
        ctx.fillText(partsText, x, y + size + partFontSize * 0.4)
        ctx.restore()
      }
    },
    [selectedNodeId, nodesConnectedToGoal] // Add actual dependencies
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

      // Simplified: Skip viewport culling for edges - library handles it

      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1

      // Check if nodes are on the same layer
      const sourceTargetX = source.targetX ?? source.x
      const targetTargetX = target.targetX ?? target.x
      const sourceTargetY = source.targetY ?? source.y
      const targetTargetY = target.targetY ?? target.y
      
      const currentOrientation = orientationRef.current
      const sameLayer = currentOrientation === 'horizontal'
        ? Math.abs(sourceTargetX - targetTargetX) < SAME_LAYER_X_EPSILON
        : Math.abs(sourceTargetY - targetTargetY) < SAME_LAYER_X_EPSILON

      const mainAxisDrift = currentOrientation === 'horizontal' ? Math.abs(dx) : Math.abs(dy)
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

      if (isStapleEdge) {
        if (currentOrientation === 'horizontal') {
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

        // Offset start/end points using node radii so the line leaves from the hexagon edge
        startX = source.x + dirX * sourceRadius
        startY = source.y + dirY * sourceRadius
        endX = target.x - dirX * targetRadius
        endY = target.y - dirY * targetRadius

        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)

        controlX = (startX + endX) / 2
        controlY = (startY + endY) / 2
      } else {
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        controlX = (startX + endX) / 2
        controlY = (startY + endY) / 2
      }

      // Dash stapled edges (non-winning) so all vertical connections look consistent
      if (isStapleEdge && !link.isWinning) {
        ctx.setLineDash([12 / globalScale, 10 / globalScale])
      } else {
        ctx.setLineDash([])
      }

      // Simplified edge colors - no gradients for better performance
      if (link.isWinning && isCompleteRef.current) {
        ctx.strokeStyle = '#22c55e' // Solid green for winning path
      } else if (isSideLineageEdge || isStapleEdge) {
        ctx.strokeStyle = 'rgba(244, 180, 0, 0.5)' // Solid dimmer yellow
      } else {
        ctx.strokeStyle = '#F4B400' // Solid bright yellow
      }

      ctx.lineWidth = link.isWinning
        ? 4 / globalScale // Fixed width, no pulse animation
        : isSideLineageEdge || isStapleEdge
        ? 1.8 / globalScale
        : 2.8 / globalScale
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

    // Draw shared part label on edge
    if (link.sharedPart && globalScale > 0.5) {
      ctx.save()
      const inverseScale = 1 / Math.max(globalScale, 0.001)
      const zoomComp = getZoomCompensation({ isStart: false, isGoal: false } as ForceLayoutNode, globalScale)
      
      // Smaller font size for full zoom
      const fontSize = Math.max(8 * inverseScale * zoomComp * 0.35, 4)  // Reduced from 10/0.4 to 8/0.35
      
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // Calculate the actual midpoint on the quadratic Bezier curve at t=0.5
      // Formula: B(0.5) = 0.25*start + 0.5*control + 0.25*end
      const labelX = 0.25 * startX + 0.5 * controlX + 0.25 * endX
      const labelY = 0.25 * startY + 0.5 * controlY + 0.25 * endY
      const labelWidth = ctx.measureText(link.sharedPart).width

      // Tighter padding that scales with the smaller font size
      const horizontalPadding = fontSize * 0.4  // Reduced from ~0.5 equivalent
      const verticalPadding = fontSize * 0.2    // Reduced from ~0.25 equivalent
      
      ctx.fillStyle = 'rgba(7, 6, 4, 0.85)'
      ctx.fillRect(
        labelX - labelWidth / 2 - horizontalPadding,
        labelY - fontSize / 2 - verticalPadding,
        labelWidth + (horizontalPadding * 2),
        fontSize + (verticalPadding * 2)
      )

      ctx.fillStyle = (isSideLineageEdge || isStapleEdge) ? '#F6E0A0' : '#F4B400'
      ctx.fillText(link.sharedPart, labelX, labelY)
      ctx.restore()
    }
    },
    [] // Dependencies accessed via refs for stability
  )

  return (
    <div
      ref={containerRef}
      data-graph-container
      className="w-full h-full relative overflow-hidden bg-transparent touch-none"
      style={{ minHeight: '400px', touchAction: 'pan-x pan-y pinch-zoom' }}
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
            // Prevent dragging start/goal nodes by setting pointer area to 0
            if (node.isStart || (node.isGoal && !node.isCompleted)) {
              return // Don't draw pointer area, preventing drag interaction
            }
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
          maxZoom={maxZoom}
          d3VelocityDecay={0}
          d3AlphaDecay={1}
          cooldownTicks={0}
          warmupTicks={0}
        />
      )}

      {/* Legend removed and moved to HowToPlay */}
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders when props haven't changed
export default memo(Graph)
