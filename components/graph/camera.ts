import { easeInOutCubic } from '@/lib/graph-layout'

/**
 * 2D camera for the custom canvas graph.
 *
 * Convention: screen = world * k + translation (tx, ty).
 * Supports immediate manipulation (wheel / pinch / pan) and eased
 * programmatic transitions (fit / reveal).
 */
export class Camera {
  k = 1
  tx = 0
  ty = 0
  width = 0
  height = 0
  minZoom = 0.05
  maxZoom = 8

  private anim: {
    fromK: number
    fromTx: number
    fromTy: number
    toK: number
    toTx: number
    toTy: number
    start: number
    duration: number
  } | null = null

  setViewport(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  setLimits(minZoom: number, maxZoom: number): void {
    this.minZoom = minZoom
    this.maxZoom = maxZoom
    const clamped = this.clampZoom(this.k)
    if (clamped !== this.k) {
      this.cancelAnimation()
      // Keep the viewport center fixed while clamping
      const center = this.screenToWorld(this.width / 2, this.height / 2)
      this.k = clamped
      this.tx = this.width / 2 - center.x * clamped
      this.ty = this.height / 2 - center.y * clamped
    }
  }

  clampZoom(k: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, k))
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.tx) / this.k, y: (py - this.ty) / this.k }
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.k + this.tx, y: wy * this.k + this.ty }
  }

  /** World coordinates currently at the center of the viewport */
  centerWorld(): { x: number; y: number } {
    return this.screenToWorld(this.width / 2, this.height / 2)
  }

  isAnimating(): boolean {
    return this.anim !== null
  }

  cancelAnimation(): void {
    this.anim = null
  }

  /**
   * Advance an in-flight transition. Returns true when the transform changed.
   */
  update(now: number): boolean {
    if (!this.anim) return false
    const { fromK, fromTx, fromTy, toK, toTx, toTy, start, duration } = this.anim
    const raw = duration <= 0 ? 1 : (now - start) / duration
    const t = Math.max(0, Math.min(1, raw))

    if (t >= 1) {
      this.k = toK
      this.tx = toTx
      this.ty = toTy
      this.anim = null
      return true
    }

    const e = easeInOutCubic(t)
    // Interpolate zoom in log space for a perceptually smooth transition
    this.k = Math.exp(Math.log(fromK) + (Math.log(toK) - Math.log(fromK)) * e)
    this.tx = fromTx + (toTx - fromTx) * e
    this.ty = fromTy + (toTy - fromTy) * e
    return true
  }

  /**
   * Immediate zoom by a multiplicative factor around a screen point
   * (keeps the world point under the cursor fixed).
   */
  zoomAt(px: number, py: number, factor: number): void {
    this.cancelAnimation()
    const newK = this.clampZoom(this.k * factor)
    if (newK === this.k) return
    const ratio = newK / this.k
    this.tx = px - (px - this.tx) * ratio
    this.ty = py - (py - this.ty) * ratio
    this.k = newK
  }

  panBy(dx: number, dy: number): void {
    this.cancelAnimation()
    this.tx += dx
    this.ty += dy
  }

  centerAt(cx: number, cy: number, duration = 0): void {
    this.animateTo(this.k, cx, cy, duration)
  }

  zoomTo(k: number, duration = 0): void {
    const center = this.centerWorld()
    this.animateTo(k, center.x, center.y, duration)
  }

  /**
   * Eased transition to a zoom level with the given world point centered.
   */
  animateTo(k: number, cx: number, cy: number, duration = 0): void {
    const toK = this.clampZoom(k)
    if (duration <= 0) {
      this.cancelAnimation()
      this.k = toK
      this.tx = this.width / 2 - cx * toK
      this.ty = this.height / 2 - cy * toK
      return
    }
    this.anim = {
      fromK: this.k,
      fromTx: this.tx,
      fromTy: this.ty,
      toK,
      toTx: this.width / 2 - cx * toK,
      toTy: this.height / 2 - cy * toK,
      start: performance.now(),
      duration,
    }
  }

  /**
   * Zoom/center needed to fit a world-space box in the viewport.
   * Returns null when the box is empty.
   */
  fitTransform(
    box: { centerX: number; centerY: number; width: number; height: number },
    padding = 0.18
  ): { k: number; cx: number; cy: number } | null {
    const effectiveWidth = box.width * (1 + padding * 2)
    const effectiveHeight = box.height * (1 + padding * 2)
    if (effectiveWidth <= 0 || effectiveHeight <= 0) return null

    const zoomX = this.width > 0 ? this.width / effectiveWidth : 1
    const zoomY = this.height > 0 ? this.height / effectiveHeight : 1
    let zoom = Math.min(zoomX, zoomY)
    if (!isFinite(zoom) || zoom <= 0) zoom = 1

    return {
      k: this.clampZoom(zoom),
      cx: isFinite(box.centerX) ? box.centerX : 0,
      cy: isFinite(box.centerY) ? box.centerY : 0,
    }
  }
}
