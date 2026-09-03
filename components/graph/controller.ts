import { getAnimationManager } from '@/lib/graph-layout'
import type { GraphLayoutResult, LayoutNodeMeta } from '@/lib/graph-layout'
import type { GraphEdge } from '@/types'
import { Camera } from './camera'
import { renderGraph, hitTestNode, type DragOverride } from './renderer'

const CAMERA_TRANSITION_MS = 600
const CLICK_SLOP_PX = 6
const REVEAL_MARGIN_PX = 80
// Padding factor for spine-centered fit (matches fitTransform's 18% side padding)
const SPINE_FIT_PADDING = 1.36

export interface ControllerSyncState {
  layout: GraphLayoutResult
  edges: GraphEdge[]
  selectedNodeId: string | null
  isComplete: boolean
  winningEdgeIds: ReadonlySet<string>
  goalNeighbors: ReadonlySet<string>
  orientation: 'horizontal' | 'vertical'
  minZoom: number
  maxZoom: number
}

/**
 * Imperative controller owning the canvas, camera, interactions and the
 * render loop. React only syncs props into it and asks for camera moves.
 */
export class GraphController {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private camera = new Camera()
  private animManager = getAnimationManager()
  private onNodeSelect: (id: string) => void

  private state: ControllerSyncState | null = null
  private dragOverride: DragOverride | null = null
  private animatedPositions: ReadonlyMap<string, { x: number; y: number }> = new Map()

  private dpr = 1
  private pointers = new Map<number, { x: number; y: number }>()
  private panState: { lastX: number; lastY: number } | null = null
  private nodeDrag: { id: string; moved: boolean } | null = null
  private pinchState: { dist: number; k: number; midX: number; midY: number } | null = null
  private downPos: { x: number; y: number } | null = null
  private downMoved = false

  private resizeObserver: ResizeObserver
  private raf = 0
  private running = false
  private dirty = true
  private disposed = false
  private lastWidth = 0
  private lastHeight = 0

  constructor(container: HTMLElement, onNodeSelect: (id: string) => void) {
    this.container = container
    this.onNodeSelect = onNodeSelect

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText =
      'width:100%;height:100%;display:block;touch-action:none;cursor:default;'
    container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx

    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)

    this.resizeObserver = new ResizeObserver(this.handleResize)
    this.resizeObserver.observe(container)
    this.handleResize()
  }

  destroy(): void {
    this.disposed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.running = false
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('wheel', this.handleWheel)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.remove()
  }

  // ---- React sync ----

  sync(state: ControllerSyncState): void {
    this.state = state
    this.camera.setLimits(state.minZoom, state.maxZoom)
    this.invalidate()
  }

  // ---- Camera moves ----

  /**
   * Fit the graph on launch, centered on the start/end node axis.
   * On a symmetric (fresh) graph this equals a plain bbox fit; when the tree
   * has drifted asymmetrically it re-centers the spine and zooms out just
   * enough to keep every node visible.
   */
  fitAll(animate: boolean): void {
    if (!this.state) return
    const { layout } = this.state
    const { boundingBox } = layout

    const startMeta = layout.startNodeId ? layout.nodeMeta.get(layout.startNodeId) : undefined
    const goalMeta = layout.goalNodeId ? layout.nodeMeta.get(layout.goalNodeId) : undefined

    if (!startMeta || !goalMeta) {
      const fit = this.camera.fitTransform(boundingBox)
      if (!fit) return
      this.camera.animateTo(fit.k, fit.cx, fit.cy, animate ? CAMERA_TRANSITION_MS : 0)
      this.invalidate()
      return
    }

    // Spine midpoint between start and goal (post-swap coordinates)
    const spineX = (startMeta.targetX + goalMeta.targetX) / 2
    const spineY = (startMeta.targetY + goalMeta.targetY) / 2

    // Asymmetric fit: viewport must contain the bbox when centered on the spine
    const halfW = Math.max(spineX - boundingBox.minX, boundingBox.maxX - spineX) * SPINE_FIT_PADDING
    const halfH = Math.max(spineY - boundingBox.minY, boundingBox.maxY - spineY) * SPINE_FIT_PADDING

    let k = Infinity
    if (halfW > 0 && this.camera.width > 0) k = Math.min(k, this.camera.width / (2 * halfW))
    if (halfH > 0 && this.camera.height > 0) k = Math.min(k, this.camera.height / (2 * halfH))
    if (!isFinite(k) || k <= 0) k = 1
    k = this.camera.clampZoom(k)

    this.camera.animateTo(k, spineX, spineY, animate ? CAMERA_TRANSITION_MS : 0)
    this.invalidate()
  }

  zoomBy(factor: number): void {
    const cx = this.camera.width / 2
    const cy = this.camera.height / 2
    this.camera.zoomAt(cx, cy, factor)
    this.invalidate()
  }

  /**
   * Hybrid reveal after new nodes were added:
   * - if the graph no longer fits at the current zoom: zoom out to fit fully
   * - otherwise keep zoom and pan only if the new nodes are not fully visible
   */
  reveal(newNodeIds: string[]): void {
    if (!this.state || newNodeIds.length === 0) return
    const fit = this.camera.fitTransform(this.state.layout.boundingBox)
    if (!fit) return

    if (fit.k < this.camera.k * 1.01) {
      // Graph no longer fits at the current zoom - zoom out to fit fully
      this.camera.animateTo(fit.k, fit.cx, fit.cy, CAMERA_TRANSITION_MS)
      this.invalidate()
      return
    }

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    newNodeIds.forEach((id) => {
      const meta = this.state!.layout.nodeMeta.get(id)
      if (!meta) return
      const s = this.camera.worldToScreen(meta.targetX, meta.targetY)
      minX = Math.min(minX, s.x)
      maxX = Math.max(maxX, s.x)
      minY = Math.min(minY, s.y)
      maxY = Math.max(maxY, s.y)
    })

    if (!isFinite(minX)) return

    const fullyVisible =
      minX >= REVEAL_MARGIN_PX &&
      maxX <= this.camera.width - REVEAL_MARGIN_PX &&
      minY >= REVEAL_MARGIN_PX &&
      maxY <= this.camera.height - REVEAL_MARGIN_PX

    if (!fullyVisible) {
      const cx = ((minX + maxX) / 2 - this.camera.tx) / this.camera.k
      const cy = ((minY + maxY) / 2 - this.camera.ty) / this.camera.k
      this.camera.animateTo(this.camera.k, cx, cy, CAMERA_TRANSITION_MS)
    }
    this.invalidate()
  }

  // ---- Render loop ----

  private invalidate(): void {
    this.dirty = true
    this.kick()
  }

  private kick(): void {
    if (!this.running && !this.disposed) {
      this.running = true
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  private frame = (now: number): void => {
    this.running = false
    if (this.disposed) return

    let needsDraw = this.dirty
    this.dirty = false

    if (this.camera.update(now)) needsDraw = true
    if (this.animManager.hasActiveAnimations()) needsDraw = true

    if (needsDraw) this.draw()

    if (this.dirty || this.camera.isAnimating() || this.animManager.hasActiveAnimations()) {
      this.running = true
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  private draw(): void {
    if (!this.state) return
    this.animatedPositions = this.animManager.getCurrentPositions(performance.now())

    renderGraph(this.ctx, this.camera, this.dpr, {
      layout: this.state.layout,
      edges: this.state.edges,
      animatedPositions: this.animatedPositions,
      dragOverride: this.dragOverride,
      selectedNodeId: this.state.selectedNodeId,
      isComplete: this.state.isComplete,
      winningEdgeIds: this.state.winningEdgeIds,
      goalNeighbors: this.state.goalNeighbors,
      orientation: this.state.orientation,
    })
  }

  // ---- Sizing ----

  private handleResize = (): void => {
    if (this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width <= 0 || height <= 0) return

    // Skip no-op resize callbacks (common with ResizeObserver)
    if (width === this.lastWidth && height === this.lastHeight) return
    this.lastWidth = width
    this.lastHeight = height

    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.round(width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(height * this.dpr))
    this.camera.setViewport(width, height)

    // Don't cancel an in-flight camera animation — let it finish with the
    // updated viewport dimensions. Only re-fit when nothing is animating.
    if (this.camera.isAnimating()) {
      this.invalidate()
      return
    }

    if (this.state) {
      this.fitAll(false)
    } else {
      this.invalidate()
    }
  }

  // ---- Interactions ----

  private localPoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private isDraggable(node: LayoutNodeMeta): boolean {
    return !node.isStart && !(node.isGoal && !node.isCompleted)
  }

  private isClickable(node: LayoutNodeMeta): boolean {
    return !(node.isGoal && !node.isCompleted)
  }

  private currentPositionOf(id: string): { x: number; y: number } {
    if (this.dragOverride && this.dragOverride.id === id) {
      return { x: this.dragOverride.x, y: this.dragOverride.y }
    }
    const animated = this.animatedPositions.get(id)
    if (animated) return { x: animated.x, y: animated.y }
    const meta = this.state?.layout.nodeMeta.get(id)
    return meta ? { x: meta.targetX, y: meta.targetY } : { x: 0, y: 0 }
  }

  private cancelDrag(): void {
    if (this.dragOverride && this.state) {
      const node = this.state.layout.nodeMeta.get(this.dragOverride.id)
      if (node) {
        // Snap back to target instantly (old behavior)
        this.animManager.finalizePosition(node.id, { x: node.targetX, y: node.targetY })
      }
    }
    this.dragOverride = null
    this.nodeDrag = null
  }

  private handleWheel = (e: WheelEvent): void => {
    if (this.disposed) return
    e.preventDefault()
    const p = this.localPoint(e)
    const factor = Math.exp(-e.deltaY * 0.0015)
    this.camera.zoomAt(p.x, p.y, factor)
    this.invalidate()
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.disposed || !this.state) return
    this.canvas.setPointerCapture(e.pointerId)
    const p = this.localPoint(e)
    this.pointers.set(e.pointerId, p)
    this.camera.cancelAnimation()

    if (this.pointers.size === 2) {
      this.cancelDrag()
      this.panState = null
      this.downPos = null
      const [a, b] = [...this.pointers.values()]
      this.pinchState = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        k: this.camera.k,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      }
      return
    }
    if (this.pointers.size > 2) return

    this.downPos = p
    this.downMoved = false

    const node = hitTestNode(
      this.camera,
      this.state.layout,
      this.animatedPositions,
      this.dragOverride,
      p.x,
      p.y
    )

    if (node && this.isDraggable(node)) {
      this.nodeDrag = { id: node.id, moved: false }
      const pos = this.currentPositionOf(node.id)
      this.dragOverride = { id: node.id, x: pos.x, y: pos.y }
    } else {
      this.panState = { lastX: p.x, lastY: p.y }
    }
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.disposed || !this.state) return
    const p = this.localPoint(e)

    // Hover cursor (no buttons pressed)
    if (this.pointers.size === 0) {
      const node = hitTestNode(
        this.camera,
        this.state.layout,
        this.animatedPositions,
        this.dragOverride,
        p.x,
        p.y
      )
      this.canvas.style.cursor = node && this.isClickable(node) ? 'pointer' : 'default'
      return
    }

    if (!this.pointers.has(e.pointerId)) return
    this.pointers.set(e.pointerId, p)

    if (this.pointers.size >= 2 && this.pinchState) {
      const [a, b] = [...this.pointers.values()]
      if (!a || !b) return
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const newK = this.camera.clampZoom(this.pinchState.k * (dist / this.pinchState.dist))
      this.camera.zoomAt(midX, midY, newK / this.camera.k)
      this.camera.panBy(midX - this.pinchState.midX, midY - this.pinchState.midY)
      this.pinchState.midX = midX
      this.pinchState.midY = midY
      this.invalidate()
      return
    }

    if (this.downPos && Math.hypot(p.x - this.downPos.x, p.y - this.downPos.y) > CLICK_SLOP_PX) {
      this.downMoved = true
    }

    if (this.nodeDrag && this.dragOverride) {
      const node = this.state.layout.nodeMeta.get(this.nodeDrag.id)
      if (node) {
        this.nodeDrag.moved = true
        const world = this.camera.screenToWorld(p.x, p.y)
        if (this.state.orientation === 'horizontal') {
          this.dragOverride.x = node.targetX
          this.dragOverride.y = world.y
        } else {
          this.dragOverride.x = world.x
          this.dragOverride.y = node.targetY
        }
        this.invalidate()
      }
      return
    }

    if (this.panState) {
      const dx = p.x - this.panState.lastX
      const dy = p.y - this.panState.lastY
      this.panState = { lastX: p.x, lastY: p.y }
      if (dx !== 0 || dy !== 0) {
        this.camera.panBy(dx, dy)
        this.invalidate()
      }
    }
  }

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.disposed) return
    this.pointers.delete(e.pointerId)

    if (this.pinchState) {
      if (this.pointers.size < 2) {
        this.pinchState = null
        const remaining = [...this.pointers.values()][0]
        if (remaining) this.panState = { lastX: remaining.x, lastY: remaining.y }
        this.downPos = null
      }
      return
    }

    if (this.nodeDrag) {
      const wasMoved = this.nodeDrag.moved
      const nodeId = this.nodeDrag.id
      this.cancelDrag()
      if (!wasMoved && !this.downMoved && this.state) {
        const node = this.state.layout.nodeMeta.get(nodeId)
        if (node && this.isClickable(node)) this.onNodeSelect(node.id)
      }
      this.downPos = null
      this.invalidate()
      return
    }

    if (this.panState && !this.downMoved && this.downPos && this.state) {
      // Tap on start/goal (non-draggable) nodes
      const node = hitTestNode(
        this.camera,
        this.state.layout,
        this.animatedPositions,
        this.dragOverride,
        this.downPos.x,
        this.downPos.y
      )
      if (node && this.isClickable(node)) this.onNodeSelect(node.id)
    }

    this.panState = null
    this.downPos = null
  }

  private handlePointerCancel = (e: PointerEvent): void => {
    if (this.disposed) return
    this.pointers.delete(e.pointerId)
    this.cancelDrag()
    this.pinchState = null
    this.panState = null
    this.downPos = null
    this.invalidate()
  }
}
