'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphProps } from '@/types'
import {
  computeGraphLayout,
  computeVisibleEdges,
  getAnimationManager,
  resolveEdgeEndpoint,
} from '@/lib/graph-layout'
import { GraphController } from './graph/controller'

const MIN_ZOOM = 0.05

// Dynamic max zoom based on graph size - smaller graphs can zoom in more
const maxZoomFor = (nodeCount: number): number => {
  if (nodeCount <= 5) return 8
  if (nodeCount <= 10) return 6
  if (nodeCount <= 20) return 5
  if (nodeCount <= 30) return 4
  return 3
}

function Graph({
  nodes,
  edges,
  selectedNodeId,
  onNodeSelect,
  isComplete,
  winningPath,
  winningPathNodeIds = [],
  layoutVersion = 0,
}: GraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<GraphController | null>(null)
  const onNodeSelectRef = useRef(onNodeSelect)
  const prevNodeIdsRef = useRef<Set<string> | null>(null)
  const prevWordIdsRef = useRef<Set<string> | null>(null)
  const prevOrientationRef = useRef<'horizontal' | 'vertical'>('horizontal')
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')

  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect
  })

  // Track orientation from the container width
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const rect = container.getBoundingClientRect()
      setOrientation(rect.width < 768 ? 'vertical' : 'horizontal')
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Compute the layout and feed the animation manager (runs once per layout change)
  const layout = useMemo(() => {
    const result = computeGraphLayout(nodes, edges, orientation)
    getAnimationManager().updateTargets(
      result.nodes.map((node) => ({
        id: node.id,
        targetX: node.targetX,
        targetY: node.targetY,
        parentId: node.parentId,
      }))
    )
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, orientation, layoutVersion])

  const maxZoom = useMemo(() => maxZoomFor(nodes.length), [nodes.length])

  // Winning edge IDs (edges on the winning path, before and after completion)
  const winningEdgeIds = useMemo(() => {
    const chain = new Set<string>()
    if (winningPathNodeIds.length >= 2) {
      for (let i = 0; i < winningPathNodeIds.length - 1; i++) {
        const fromId = winningPathNodeIds[i]
        const toId = winningPathNodeIds[i + 1]
        const connectingEdge = edges.find((edge) => {
          const sourceId = resolveEdgeEndpoint(edge.source)
          const targetId = resolveEdgeEndpoint(edge.target)
          return sourceId === fromId && targetId === toId
        })
        if (connectingEdge) chain.add(connectingEdge.id)
      }
      return chain
    }

    if (winningPath.length < 2) return chain

    for (let i = 0; i < winningPath.length - 1; i++) {
      const connectingEdge = edges.find((edge) => {
        const source = nodes.find((node) => node.id === resolveEdgeEndpoint(edge.source))
        const target = nodes.find((node) => node.id === resolveEdgeEndpoint(edge.target))
        return source?.word === winningPath[i] && target?.word === winningPath[i + 1]
      })
      if (connectingEdge) chain.add(connectingEdge.id)
    }
    return chain
  }, [edges, nodes, winningPath, winningPathNodeIds])

  // Nodes directly connected to any completed goal occurrence.
  const goalNeighbors = useMemo(() => {
    const set = new Set<string>()
    const goalIds = new Set(nodes.filter((node) => node.isGoal && node.parentId).map((node) => node.id))
    edges.forEach((edge) => {
      const sourceId = resolveEdgeEndpoint(edge.source)
      const targetId = resolveEdgeEndpoint(edge.target)
      if (goalIds.has(sourceId)) set.add(targetId)
      else if (goalIds.has(targetId)) set.add(sourceId)
    })
    return set
  }, [nodes, edges])

  const visibleEdges = useMemo(() => {
    return computeVisibleEdges(edges, layout.nodeMeta, orientation)
  }, [edges, layout, orientation])

  // Create the controller once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const controller = new GraphController(container, (id) => onNodeSelectRef.current(id))
    controllerRef.current = controller
    prevNodeIdsRef.current = null // ensure a fresh fit on (re)mount
    prevWordIdsRef.current = null
    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [])

  // Sync props into the controller on every render
  useEffect(() => {
    controllerRef.current?.sync({
      layout,
      edges: visibleEdges,
      selectedNodeId,
      isComplete,
      winningEdgeIds,
      goalNeighbors,
      orientation,
      minZoom: MIN_ZOOM,
      maxZoom,
    })
  })

  // Camera: fit on launch/orientation change/puzzle switch, hybrid reveal on graph growth
  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    const ids = new Set(nodes.map((node) => node.id))
    const wordIds = new Set(
      nodes.filter((node) => !node.isStart && !node.isGoal).map((node) => node.id)
    )
    const prev = prevNodeIdsRef.current
    const prevWords = prevWordIdsRef.current
    const orientationChanged = prevOrientationRef.current !== orientation

    // Puzzle switch/reset: the previous word set shares nothing with the new one
    let isReplacement = false
    if (prevWords && prevWords.size > 0) {
      let overlap = false
      wordIds.forEach((id) => {
        if (prevWords.has(id)) overlap = true
      })
      isReplacement = !overlap
    }

    if (!prev) {
      controller.fitAll(false)
    } else if (isReplacement || orientationChanged) {
      controller.fitAll(true)
    } else {
      const added: string[] = []
      ids.forEach((id) => {
        if (!prev.has(id)) added.push(id)
      })
      if (added.length > 0) controller.reveal(added)
    }

    prevNodeIdsRef.current = ids
    prevWordIdsRef.current = wordIds
    prevOrientationRef.current = orientation
  }, [layout, nodes, orientation])

  return (
    <div
      ref={containerRef}
      data-graph-container
      className="w-full h-full relative overflow-hidden bg-transparent"
      style={{ minHeight: '400px' }}
    />
  )
}

export default memo(Graph)
