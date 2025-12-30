'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { GraphEdge, GraphNode, GraphProps } from '@/types'
import { computeGraphLayout, getAnimationManager } from '@/lib/graph-layout egen'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-hive-yellow animate-pulse">Loading graph...</div>
    </div>
  ),
})

interface ForceLayoutNode extends GraphNode {
  targetX: number
  targetY: number
  absoluteY: number
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

// getDynamicCollideRadius removed - no collision forces needed

const getPointerHitRadius = (node: ForceLayoutNode, globalScale: number): number => {
  const base = node.isGoal || node.isStart ? POINTER_RADIUS_ANCHORED : POINTER_RADIUS_DEFAULT
  return base / Math.max(globalScale, 0.001)
}

const MIN_VISUAL_SCALE = 0.2

const getZoomCompensation = (node: ForceLayoutNode, globalScale: number): number => {
  if (node.isStart || node.isGoal) return 1
  if (globalScale >= 1) return 1
  // When zoomed out, maintain larger node size by using a less aggressive reduction
  // Use square root instead of square to reduce less, keeping nodes bigger
  const normalized = Math.max(Math.min(globalScale, 1), MIN_VISUAL_SCALE)
  return Math.sqrt(normalized) // Less aggressive reduction = bigger nodes when zoomed out
}

const getRenderedNodeSize = (node: ForceLayoutNode, globalScale: number): number => {
  const baseSize = node.isStart || node.isGoal ? 48 : 36
  const inverseScale = 1 / Math.max(globalScale, 0.001)
  const compensatedSize = baseSize * inverseScale * getZoomCompensation(node, globalScale)
  // Ensure minimum size when zoomed out (at least 60% of base size)
  const minSize = baseSize * 0.6
  return Math.max(compensatedSize, minSize)
}

const getNodeVisualRadius = (node: ForceLayoutNode, globalScale: number): number => {
  const size = getRenderedNodeSize(node, globalScale)
  // Use the full size (circumradius) to ensure edges don't overlap with hexagon
  // The hexagon vertices are at distance 'size' from center
  // Adding a small buffer to account for stroke width
  const strokeWidth = 2.5 / Math.max(globalScale, 0.001)
  return size + strokeWidth / 2
}


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
  const animationManagerRef = useRef(getAnimationManager())
  const [animationFrame, setAnimationFrame] = useState(0) // Force re-render for animation

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

  useEffect(() => {
    let resizeTimer: number | null = null
    
    const updateDimensions = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setDimensions({
        width: rect.width || 800,
        height: rect.height || 520,
      })
      setOrientation(rect.width < 768 ? 'vertical' : 'horizontal')
    }

    const throttledUpdateDimensions = () => {
      // Throttle resize events to avoid excessive layout recalculations
      if (resizeTimer) {
        cancelAnimationFrame(resizeTimer)
      }
      resizeTimer = requestAnimationFrame(() => {
        updateDimensions()
        resizeTimer = null
      })
    }

    updateDimensions() // Initial update
    window.addEventListener('resize', throttledUpdateDimensions)
    return () => {
      window.removeEventListener('resize', throttledUpdateDimensions)
      if (resizeTimer) {
        cancelAnimationFrame(resizeTimer)
      }
    }
  }, [])


  // Compute layout with strict rules
  const layout = useMemo(() => {
    return computeGraphLayout(
      nodes, 
      edges, 
      orientation === 'horizontal' ? Math.max(dimensions.height, 480) : Math.max(dimensions.width, 350),
      orientation,
      graphSpacing
    )
  }, [nodes, edges, dimensions.height, dimensions.width, orientation, graphSpacing, layoutVersion])

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

  const startAnchor = useMemo(() => {
    if (!layout.startNodeId) return null
    return layout.nodeMeta.get(layout.startNodeId) ?? null
  }, [layout])

  const startAnchorPosition = useMemo(() => {
    if (!startAnchor) {
      startAnchorPositionRef.current = null
      return null
    }
    const pos = { x: startAnchor.targetX, y: startAnchor.targetY }
    startAnchorPositionRef.current = pos
    return pos
  }, [startAnchor])

  // Calculate winning edge IDs for highlighting
  // Track edges on the winning path both before and after completion
  const winningEdgeIds = useMemo(() => {
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


  // Animation loop - continuously update positions while animations are active
  useEffect(() => {
    let rafId: number | null = null
    let isRunning = true

    const animate = () => {
      if (!isRunning) return

      const manager = animationManagerRef.current
      if (manager.hasActiveAnimations()) {
        // Force re-render by updating animation frame counter
        setAnimationFrame((prev) => prev + 1)
        // Continue animation loop
        rafId = requestAnimationFrame(animate)
      } else {
        // No active animations - stop loop
        rafId = null
      }
    }

    // Start animation loop immediately
    // It will run continuously checking for active animations
    rafId = requestAnimationFrame(() => {
      const manager = animationManagerRef.current
      if (manager.hasActiveAnimations()) {
        rafId = requestAnimationFrame(animate)
      }
      // If no animations yet, check periodically until layout updates complete
      else {
        let checkCount = 0
        const maxChecks = 10 // Check for 10 frames (~166ms) before giving up
        const checkLoop = () => {
          if (!isRunning || checkCount >= maxChecks) return
          checkCount++
          if (manager.hasActiveAnimations()) {
            rafId = requestAnimationFrame(animate)
          } else {
            rafId = requestAnimationFrame(checkLoop)
          }
        }
        rafId = requestAnimationFrame(checkLoop)
      }
    })

    return () => {
      isRunning = false
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [layout.nodes.length, layoutVersion])

  // Prepare graph data with layout positions
  const graphData = useMemo(() => {
    const manager = animationManagerRef.current
    const currentTime = performance.now()
    const currentPositions = manager.getCurrentPositions(currentTime)

    const graphNodes: ForceLayoutNode[] = layout.nodes.map((node) => {
      // Get current animated position, fallback to target
      const currentPos = currentPositions.get(node.id)
      const currentX = currentPos?.x ?? node.targetX
      const currentY = currentPos?.y ?? node.targetY

      const base: ForceLayoutNode = {
        ...node,
        x: currentX,
        y: currentY,
        targetX: node.targetX,
        targetY: node.targetY,
        absoluteY: node.absoluteY,
        computedLayer: node.computedLayer,
        parentId: node.parentId,
      }

      // Pin positions at current animated position - no force simulation
      base.fx = currentX
      base.fy = currentY
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
    // Include selectedNodeId to trigger recomputation and redraw when selection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, edges, winningEdgeIds, animationFrame, selectedNodeId])


  // Pin nodes once when graph data changes - nodes are already pinned in graphData useMemo
  // No need for continuous interval since nodes are pinned at initialization and simulation settles quickly

  // Cleanup timers
  useEffect(() => {
    return () => {
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

  // Winning pulse animation removed - was causing constant redraws on mobile

  // Auto-center and auto-zoom to fit entire graph whenever layout changes
  // Centers on the start node (which is at or near 0,0 after layout centering)
  useEffect(() => {
    if (!graphRef.current) return
    if (nodes.length === 0) return
    
    // Wait for graph to be fully initialized and rendered
    const timeoutId = setTimeout(() => {
      if (!graphRef.current) return
      
      const { boundingBox } = layout
      
      // Get start node - the layout centers the graph around 0,0, so start node should be near center
      const startNode = layout.startNodeId ? layout.nodeMeta.get(layout.startNodeId) : null
      
      // Always center on the start node position (which is near 0,0 after layout centering)
      // This ensures nodes start at center of screen on both desktop and mobile
      let centerX: number
      let centerY: number
      
      if (startNode) {
        // Center on start node - this ensures it's at the center of the screen
        centerX = startNode.targetX
        centerY = startNode.targetY
      } else {
        // Fallback to 0,0 (layout center) or bounding box center
        centerX = boundingBox.centerX
        centerY = boundingBox.centerY
      }
      
      // Calculate zoom level to fit entire graph
      const viewportWidth = dimensions.width
      const viewportHeight = dimensions.height
      
      // For single node or very small graphs, use a reasonable minimum view size
      // This prevents excessive zoom when there's only one node
      // Use a percentage of viewport size to ensure reasonable zoom
      const MIN_VIEW_WIDTH = viewportWidth * 0.5
      const MIN_VIEW_HEIGHT = viewportHeight * 0.5
      
      // Use actual bounding box dimensions, but ensure minimums for zoom calculation
      // This ensures we don't zoom in too much on a single node
      const effectiveWidth = Math.max(boundingBox.width, MIN_VIEW_WIDTH)
      const effectiveHeight = Math.max(boundingBox.height, MIN_VIEW_HEIGHT)
      
      // Add padding (15% margin) around the bounding box
      const padding = 0.15
      const paddedWidth = effectiveWidth * (1 + padding * 2)
      const paddedHeight = effectiveHeight * (1 + padding * 2)
      
      // For horizontal orientation: X is main axis, Y is cross axis
      // For vertical orientation: Y is main axis, X is cross axis
      let zoomX: number
      let zoomY: number
      
      if (orientation === 'horizontal') {
        zoomX = paddedWidth > 0 ? (viewportWidth / paddedWidth) * 0.9 : 1
        zoomY = paddedHeight > 0 ? (viewportHeight / paddedHeight) * 0.9 : 1
      } else {
        // Vertical orientation: swap axes
        zoomX = paddedHeight > 0 ? (viewportWidth / paddedHeight) * 0.9 : 1
        zoomY = paddedWidth > 0 ? (viewportHeight / paddedWidth) * 0.9 : 1
      }
      
      // Use the smaller zoom to ensure entire graph fits
      let calculatedZoom = Math.min(zoomX, zoomY)
      
      // Handle edge case: if zoom calculation fails, use default
      if (!isFinite(calculatedZoom) || calculatedZoom <= 0) {
        calculatedZoom = 1
      }
      
      // Respect min/max zoom limits
      const MIN_ZOOM = 0.25
      calculatedZoom = Math.max(MIN_ZOOM, Math.min(calculatedZoom, maxZoom))
      
      // Ensure center coordinates are valid
      const finalCenterX = isFinite(centerX) ? centerX : 0
      const finalCenterY = isFinite(centerY) ? centerY : 0
      
      // Center on start node and zoom to fit entire graph
      // Apply immediately first to ensure mobile sees centered view right away
      setTimeout(() => {
        if (!graphRef.current) return
        
        // Apply both zoom and center immediately (no animation) to establish the view
        // This ensures mobile devices see the centered view immediately
        graphRef.current.zoom(calculatedZoom, 0)
        graphRef.current.centerAt(finalCenterX, finalCenterY, 0)
        
        // Then optionally animate smoothly to the same position (for consistency)
        // This is a no-op but ensures the view is stable
        setTimeout(() => {
          if (graphRef.current) {
            // Re-apply to ensure it's centered (some mobile browsers need this)
            graphRef.current.zoom(calculatedZoom, 0)
            graphRef.current.centerAt(finalCenterX, finalCenterY, 0)
          }
        }, 50)
      }, 200) // Delay to ensure graph is fully initialized
    }, 100) // Initial delay to ensure graph is ready
    
    return () => clearTimeout(timeoutId)
  }, [layout, dimensions.width, dimensions.height, orientation, maxZoom, nodes.length])

  // Handle initial graph render
  const handleRenderFrame = useCallback(() => {
    // Just track pointer scale, don't manipulate camera here
    if (!graphRef.current) return
    const ctx = (graphRef.current as any).canvas?.().getContext('2d')
    if (ctx) {
      const transform = ctx.getTransform()
      pointerScaleRef.current = transform.a
    }
  }, [])

  // Prevent browser zoom when graph is at zoom limits
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const MIN_ZOOM = 0.25
    const MAX_ZOOM = maxZoom
    const ZOOM_TOLERANCE = 0.01 // Small tolerance to account for floating point precision

    const handleWheel = (e: WheelEvent) => {
      const currentZoom = pointerScaleRef.current
      const isZoomingIn = e.deltaY < 0
      const isZoomingOut = e.deltaY > 0

      // Prevent browser zoom if graph is at limits
      if (
        (isZoomingIn && currentZoom >= MAX_ZOOM - ZOOM_TOLERANCE) ||
        (isZoomingOut && currentZoom <= MIN_ZOOM + ZOOM_TOLERANCE)
      ) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      // Only prevent if we have two touches (pinch gesture)
      if (e.touches.length === 2) {
        const currentZoom = pointerScaleRef.current
        // Store initial touches to determine zoom direction
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const initialDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        
        // Store for use in touchmove
        ;(container as any).__initialPinchDistance = initialDistance
        ;(container as any).__initialZoom = currentZoom
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const currentZoom = (container as any).__initialZoom ?? pointerScaleRef.current
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        const initialDistance = (container as any).__initialPinchDistance ?? currentDistance
        
        // Determine if zooming in or out
        const isZoomingIn = currentDistance > initialDistance
        const isZoomingOut = currentDistance < initialDistance

        // Prevent browser zoom if graph is at limits
        if (
          (isZoomingIn && currentZoom >= MAX_ZOOM - ZOOM_TOLERANCE) ||
          (isZoomingOut && currentZoom <= MIN_ZOOM + ZOOM_TOLERANCE)
        ) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
    }
  }, [maxZoom])

  // Center on selected node when user clicks (will be overridden by auto-center on layout changes)
  useEffect(() => {
    if (!graphRef.current) return
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

  // Force graph redraw when selectedNodeId changes to update visual styling
  useEffect(() => {
    if (!graphRef.current) return
    
    // Use requestAnimationFrame to ensure the refresh happens after React has updated
    requestAnimationFrame(() => {
      if (graphRef.current) {
        // Refresh the graph to update visual selection
        refreshGraph()
        // Also trigger a re-render by accessing the canvas
        const api = graphRef.current as any
        if (api?.canvas && typeof api.canvas === 'function') {
          const canvas = api.canvas()
          if (canvas) {
            // Force canvas redraw by accessing it
            canvas.getContext('2d')
          }
        }
      }
    })
  }, [selectedNodeId, refreshGraph])

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

  // Custom node rendering with hexagon shape
  const drawNode = useCallback(
    (nodeObj: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = nodeObj as ForceLayoutNode
      pointerScaleRef.current = globalScale
      const x = node.x ?? node.targetX
      const y = node.y ?? node.targetY
      // Use selectedNodeId directly for immediate visual updates
      const isSelected = node.id === selectedNodeId
      const isGoalCompleted = node.isGoal && node.isCompleted
      const connectsToGoal = nodesConnectedToGoalRef.current.has(node.id) && node.id !== 'goal'
      const size = getRenderedNodeSize(node, globalScale)
      
      // Simplified: Skip viewport culling - it was adding overhead
      // react-force-graph handles culling internally

      // Simplified glow - removed expensive gradients for better mobile performance
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
        ? '#0A1F0A' // Very dark green background for nodes connected to goal
        : '#0F0D09'
      // Removed expensive shadow effects for mobile performance
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

      // Simplified text rendering for better performance
      const label = node.word.length > 14 ? `${node.word.slice(0, 12)}…` : node.word
      const fontSize = size * 0.4

      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#FFFFFF'
      // Simplified: Single text fill without expensive stroke for performance
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
    [selectedNodeId] // Include selectedNodeId to update visual selection immediately
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
      
      const isStapleEdge = shouldRenderStaple

      const needsPaddedEndpoints = isStapleEdge
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

      const getCurveMode = () => {
        const anchorPos = startAnchorPositionRef.current
        if (!anchorPos) return { direction: 1, isFlat: false }
        const anchorCross = currentOrientation === 'horizontal' ? anchorPos.y : anchorPos.x
        const sourceCross = currentOrientation === 'horizontal' ? (source.targetY ?? source.y ?? anchorCross) : (source.targetX ?? source.x ?? anchorCross)
        const delta = sourceCross - anchorCross
        if (Math.abs(delta) <= START_HEIGHT_TOLERANCE) {
          return { direction: 0, isFlat: true }
        }
        return { direction: delta < 0 ? -1 : 1, isFlat: false }
      }
      const { direction: curveDirection, isFlat: isFlatToStart } = getCurveMode()

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

      // Simplified edge colors - all edges are identical (honey-yellow)
      if (link.isWinning && isCompleteRef.current) {
        ctx.strokeStyle = '#22c55e' // Solid green for winning path
      } else if (isStapleEdge) {
        ctx.strokeStyle = 'rgba(244, 180, 0, 0.5)' // Solid dimmer yellow for stapled edges
      } else {
        ctx.strokeStyle = '#F4B400' // Solid bright yellow
      }

      ctx.lineWidth = link.isWinning
        ? 4 / globalScale // Fixed width, no pulse animation
        : isStapleEdge
        ? 1.8 / globalScale
        : 2.8 / globalScale
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // Draw shared part label on edge
      if (link.sharedPart && globalScale > 0.5) {
        // Calculate the actual midpoint on the quadratic Bezier curve at t=0.5
        // Formula: B(0.5) = 0.25*start + 0.5*control + 0.25*end
        const labelX = 0.25 * startX + 0.5 * controlX + 0.25 * endX
        const labelY = 0.25 * startY + 0.5 * controlY + 0.25 * endY
        
        ctx.save()
        
        // Get current canvas transformation matrix
        const transform = ctx.getTransform()
        
        // Reset transform to identity to draw text at fixed screen size
        // This prevents text from being scaled by zoom transformations
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        
        // Convert graph coordinates to screen coordinates using the transform
        // transform matrix: [a c e] = [scaleX skewY translateX]
        //                  [b d f]   [skewX scaleY translateY]
        const screenX = transform.a * labelX + transform.c * labelY + transform.e
        const screenY = transform.b * labelX + transform.d * labelY + transform.f
        
        // Fixed font size in screen pixels (doesn't scale with zoom)
        const fontSize = 24
        
        ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        const labelWidth = ctx.measureText(link.sharedPart).width
        const padding = 4
        const backgroundWidth = labelWidth + padding * 2
        const backgroundHeight = fontSize + padding * 2

        ctx.fillStyle = 'rgba(7, 6, 4, 0.85)'
        ctx.fillRect(
          screenX - backgroundWidth / 2,
          screenY - backgroundHeight / 2,
          backgroundWidth,
          backgroundHeight
        )

        ctx.fillStyle = isStapleEdge ? '#F6E0A0' : '#F4B400'
        ctx.fillText(link.sharedPart, screenX, screenY)
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
          onRenderFramePost={handleRenderFrame}
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