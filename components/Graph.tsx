'use client'

import { memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, forwardRef, type MutableRefObject } from 'react'
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

export interface GraphHandle {
  fitAll: () => void
  zoomIn: () => void
  zoomOut: () => void
}

const ZOOM_STEP = 1.4

const Graph = forwardRef<GraphHandle, GraphProps & { controlRef?: MutableRefObject<GraphHandle | null> }>(function Graph(
  {
    nodes,
    edges,
    selectedNodeId,
    onNodeSelect,
    isComplete,
    winningPath,
    winningPathNodeIds = [],
    controlRef,
  }: GraphProps & { controlRef?: MutableRefObject<GraphHandle | null> },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<GraphController | null>(null)
  const onNodeSelectRef = useRef(onNodeSelect)
  const prevNodeIdsRef = useRef<Set<string> | null>(null)
  const prevWordIdsRef = useRef<Set<string> | null>(null)
  const prevOrientationRef = useRef<'horizontal' | 'vertical'>('horizontal')
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical' | null>(null)

  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect
  })

  // Measure container width once before first paint to avoid horizontal-first flash
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setOrientation(rect.width < 768 ? 'vertical' : 'horizontal')
  }, [])

  // Compute the layout (pure — no side effects)
  const layout = useMemo(() => {
    if (!orientation) return null
    return computeGraphLayout(nodes, edges, orientation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, orientation])

  // Feed the animation manager after layout commits (not inside useMemo)
  useLayoutEffect(() => {
    if (!layout) return
    getAnimationManager().updateTargets(
      layout.nodes.map((node) => ({
        id: node.id,
        targetX: node.targetX,
        targetY: node.targetY,
        parentId: node.parentId,
      }))
    )
  }, [layout])

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
    const goalIds = new Set(nodes.filter((node) => node.isGoal && node.isCompleted).map((node) => node.id))
    edges.forEach((edge) => {
      const sourceId = resolveEdgeEndpoint(edge.source)
      const targetId = resolveEdgeEndpoint(edge.target)
      if (goalIds.has(sourceId)) set.add(targetId)
      else if (goalIds.has(targetId)) set.add(sourceId)
    })
    return set
  }, [nodes, edges])

  const visibleEdges = useMemo(() => {
    if (!layout) return []
    return computeVisibleEdges(edges, layout.nodeMeta, orientation!)
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

  // Expose camera control methods to parent
  useImperativeHandle(ref, () => ({
    fitAll() {
      controllerRef.current?.fitAll(true)
    },
    zoomIn() {
      controllerRef.current?.zoomBy(ZOOM_STEP)
    },
    zoomOut() {
      controllerRef.current?.zoomBy(1 / ZOOM_STEP)
    },
  }))

  // next/dynamic() swallows `ref` (its wrapper only exposes `retry`), so the
  // same handle is also published through this plain prop, which dynamic
  // passes through untouched.
  useEffect(() => {
    if (!controlRef) return
    controlRef.current = {
      fitAll() {
        controllerRef.current?.fitAll(true)
      },
      zoomIn() {
        controllerRef.current?.zoomBy(ZOOM_STEP)
      },
      zoomOut() {
        controllerRef.current?.zoomBy(1 / ZOOM_STEP)
      },
    }
  })

  // Sync props into the controller on every render
  useEffect(() => {
    if (!layout || !orientation) return
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
    if (!controller || !layout || !orientation) return

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

  // Don't render the canvas until orientation is measured
  if (!orientation) {
    return (
      <div
        ref={containerRef}
        data-graph-container
        className="w-full h-full relative overflow-hidden bg-transparent"
        style={{ minHeight: '400px' }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      data-graph-container
      className="w-full h-full relative overflow-hidden bg-transparent"
      style={{ minHeight: '400px' }}
    />
  )
})

export default memo(Graph)
