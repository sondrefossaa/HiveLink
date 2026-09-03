import type { GraphEdge } from '@/types'
import { resolveEdgeEndpoint } from '@/lib/graph-layout'
import type { Camera } from './camera'
import type { GraphLayoutResult, LayoutNodeMeta } from '@/lib/graph-layout'

/**
 * Canvas renderer for the custom graph.
 * Drawing code is ported 1:1 from the previous react-force-graph
 * nodeCanvasObject / linkCanvasObject implementations so visuals are identical.
 */

const MIN_VISUAL_SCALE = 0.2
const SAME_LAYER_X_EPSILON = 10
const NEAR_VERTICAL_HORIZONTAL_DRIFT = 14

// Screen-space pointer hit radii (world radius = screen radius / camera zoom)
export const POINTER_RADIUS_DEFAULT = 40
export const POINTER_RADIUS_ANCHORED = 60

export interface DragOverride {
  id: string
  x: number
  y: number
}

export interface RenderState {
  layout: GraphLayoutResult
  edges: GraphEdge[]
  animatedPositions: ReadonlyMap<string, { x: number; y: number }>
  dragOverride: DragOverride | null
  selectedNodeId: string | null
  isComplete: boolean
  winningEdgeIds: ReadonlySet<string>
  goalNeighbors: ReadonlySet<string>
  orientation: 'horizontal' | 'vertical'
}

const getZoomCompensation = (node: LayoutNodeMeta, globalScale: number): number => {
  if (node.isStart || node.isGoal) return 1
  if (globalScale >= 1) return 1
  // When zoomed out, maintain larger node size by using a less aggressive reduction
  const normalized = Math.max(Math.min(globalScale, 1), MIN_VISUAL_SCALE)
  return Math.sqrt(normalized)
}

const getRenderedNodeSize = (node: LayoutNodeMeta, globalScale: number): number => {
  const baseSize = node.isStart || node.isGoal ? 48 : 36
  const inverseScale = 1 / Math.max(globalScale, 0.001)
  const compensatedSize = baseSize * inverseScale * getZoomCompensation(node, globalScale)
  // Ensure minimum size when zoomed out (at least 60% of base size)
  const minSize = baseSize * 0.6
  return Math.max(compensatedSize, minSize)
}

const getNodeVisualRadius = (node: LayoutNodeMeta, globalScale: number): number => {
  const size = getRenderedNodeSize(node, globalScale)
  // Use the full size (circumradius) to ensure edges don't overlap with hexagon
  const strokeWidth = 2.5 / Math.max(globalScale, 0.001)
  return size + strokeWidth / 2
}

const traceHexagon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void => {
  const sides = 6
  const angle = Math.PI / 6
  ctx.beginPath()
  for (let i = 0; i < sides; i++) {
    const a = angle + (i * 2 * Math.PI) / sides
    const px = x + size * Math.cos(a)
    const py = y + size * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

export function renderGraph(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  dpr: number,
  state: RenderState
): void {
  const { layout, edges, animatedPositions, dragOverride } = state
  const k = camera.k

  const positionOf = (nodeId: string): { x: number; y: number } | null => {
    if (dragOverride && dragOverride.id === nodeId) {
      return { x: dragOverride.x, y: dragOverride.y }
    }
    const animated = animatedPositions.get(nodeId)
    if (animated) return { x: animated.x, y: animated.y }
    const meta = layout.nodeMeta.get(nodeId)
    return meta ? { x: meta.targetX, y: meta.targetY } : null
  }

  // Clear (screen space)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, camera.width, camera.height)

  // World transform: screen = world * k + t
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * camera.tx, dpr * camera.ty)

  // ---- Links ----
  edges.forEach((edge) => {
    const sourceId = resolveEdgeEndpoint(edge.source)
    const targetId = resolveEdgeEndpoint(edge.target)
    const sourceMeta = layout.nodeMeta.get(sourceId)
    const targetMeta = layout.nodeMeta.get(targetId)
    if (!sourceMeta || !targetMeta) return

    const sourcePos = positionOf(sourceId)
    const targetPos = positionOf(targetId)
    if (!sourcePos || !targetPos) return

    const isWinning = state.winningEdgeIds.has(edge.id)

    // Same-layer detection uses layout target positions (stable during animation)
    const sameLayer =
      state.orientation === 'horizontal'
        ? Math.abs(sourceMeta.targetX - targetMeta.targetX) < SAME_LAYER_X_EPSILON
        : Math.abs(sourceMeta.targetY - targetMeta.targetY) < SAME_LAYER_X_EPSILON

    const dx = targetPos.x - sourcePos.x
    const dy = targetPos.y - sourcePos.y
    const mainAxisDrift =
      state.orientation === 'horizontal' ? Math.abs(dx) : Math.abs(dy)
    const isStapleEdge = sameLayer || mainAxisDrift < NEAR_VERTICAL_HORIZONTAL_DRIFT

    let startX = sourcePos.x
    let startY = sourcePos.y
    let endX = targetPos.x
    let endY = targetPos.y

    if (isStapleEdge) {
      const sourceRadius = getNodeVisualRadius(sourceMeta, k)
      const targetRadius = getNodeVisualRadius(targetMeta, k)
      if (state.orientation === 'horizontal') {
        const verticalDir = dy >= 0 ? 1 : -1
        startY = sourcePos.y + verticalDir * sourceRadius
        endY = targetPos.y - verticalDir * targetRadius
      } else {
        const horizontalDir = dx >= 0 ? 1 : -1
        startX = sourcePos.x + horizontalDir * sourceRadius
        endX = targetPos.x - horizontalDir * targetRadius
      }
    }

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)

    if (isStapleEdge && !isWinning) {
      ctx.setLineDash([12 / k, 10 / k])
    } else {
      ctx.setLineDash([])
    }

    if (isWinning && state.isComplete) {
      ctx.strokeStyle = '#22c55e'
    } else if (isStapleEdge) {
      ctx.strokeStyle = 'rgba(244, 180, 0, 0.5)'
    } else {
      ctx.strokeStyle = '#F4B400'
    }

    ctx.lineWidth = isWinning ? 4 / k : isStapleEdge ? 1.8 / k : 2.8 / k
    ctx.stroke()
    ctx.restore()

    // Shared part label at the edge midpoint (fixed screen size)
    if (edge.sharedPart && k > 0.5) {
      const midX = (startX + endX) / 2
      const midY = (startY + endY) / 2
      const screen = camera.worldToScreen(midX, midY)

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const fontSize = 24
      ctx.font = `400 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const labelWidth = ctx.measureText(edge.sharedPart).width
      const padding = 4
      const backgroundWidth = labelWidth + padding * 2
      const backgroundHeight = fontSize + padding * 2

      ctx.fillStyle = 'rgba(7, 6, 4, 0.85)'
      ctx.fillRect(
        screen.x - backgroundWidth / 2,
        screen.y - backgroundHeight / 2,
        backgroundWidth,
        backgroundHeight
      )

      ctx.fillStyle = isStapleEdge ? '#F6E0A0' : '#F4B400'
      ctx.fillText(edge.sharedPart, screen.x, screen.y)
      ctx.restore()
    }
  })

  // ---- Nodes ----
  layout.nodes.forEach((node) => {
    const pos = positionOf(node.id)
    if (!pos) return

    const x = pos.x
    const y = pos.y
    const isSelected = node.id === state.selectedNodeId
    const isGoalCompleted = node.isGoal && node.isCompleted
    const connectsToGoal = state.goalNeighbors.has(node.id) && node.id !== 'goal'
    const size = getRenderedNodeSize(node, k)

    // Glow halo
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

    // Hexagon body
    ctx.save()
    traceHexagon(ctx, x, y, size)
    ctx.fillStyle = node.isGoal
      ? isGoalCompleted ? '#14532D' : '#1C170F'
      : node.isStart
        ? '#F4B400'
        : isGoalCompleted
          ? '#22c55e'
          : connectsToGoal
            ? '#0A1F0A'
            : '#0F0D09'
    ctx.fill()

    if (connectsToGoal) {
      ctx.lineWidth = 4 / k
      ctx.strokeStyle = '#22c55e'
      ctx.stroke()
      ctx.lineWidth = 2 / k
      ctx.strokeStyle = '#4ade80'
      ctx.stroke()
    } else {
      ctx.lineWidth = 2.5 / k
      ctx.strokeStyle = node.isGoal
        ? isGoalCompleted ? '#4ade80' : '#F4B400'
        : node.isStart
          ? '#1A1406'
          : isSelected
            ? '#FFD369'
            : '#3C3223'
      ctx.stroke()
    }
    ctx.restore()

    // Label
    const label = node.word.length > 14 ? `${node.word.slice(0, 12)}…` : node.word
    const fontSize = size * 0.4

    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(label, x, y)

    if (node.isReused && !node.isGoal) {
      const screen = camera.worldToScreen(x, y)
      const screenRadius = size * k

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const badgeX = screen.x + screenRadius * 0.72
      const badgeY = screen.y - screenRadius * 0.72
      ctx.beginPath()
      ctx.arc(badgeX, badgeY, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#33270A'
      ctx.fill()
      ctx.strokeStyle = '#F4B400'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.font = '700 10px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#F4B400'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('↻', badgeX, badgeY + 0.5)

      ctx.restore()
    }

    // Parts breakdown when selected
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
  })
}

/**
 * Hit-test a node in screen space (mirrors the old nodePointerAreaPaint radii).
 * Returns the closest node within its hit radius, or null.
 */
export function hitTestNode(
  camera: Camera,
  layout: GraphLayoutResult,
  animatedPositions: ReadonlyMap<string, { x: number; y: number }>,
  dragOverride: DragOverride | null,
  px: number,
  py: number
): LayoutNodeMeta | null {
  let best: LayoutNodeMeta | null = null
  let bestDist = Infinity

  for (let i = layout.nodes.length - 1; i >= 0; i--) {
    const node = layout.nodes[i]
    let wx: number
    let wy: number
    if (dragOverride && dragOverride.id === node.id) {
      wx = dragOverride.x
      wy = dragOverride.y
    } else {
      const pos = animatedPositions.get(node.id)
      wx = pos ? pos.x : node.targetX
      wy = pos ? pos.y : node.targetY
    }

    const screen = camera.worldToScreen(wx, wy)
    const radius = node.isStart || node.isGoal ? POINTER_RADIUS_ANCHORED : POINTER_RADIUS_DEFAULT
    const dist = Math.hypot(px - screen.x, py - screen.y)
    if (dist <= radius && dist < bestDist) {
      best = node
      bestDist = dist
    }
  }

  return best
}
