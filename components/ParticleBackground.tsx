'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'

interface Bubble {
  id: string
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  isPopping: boolean
  popProgress: number
  phase: number
}

interface Bee {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  wingPhase: number
  targetX: number
  targetY: number
}

const BUBBLE_COUNT = 10
const BEE_COUNT = 3
const COLLISION_INTERVAL = 3

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

const createBubbles = (width: number, height: number): Bubble[] =>
  Array.from({ length: BUBBLE_COUNT }, (_, i) => ({
    id: `bubble-${i}`,
    x: Math.random() * width,
    y: Math.random() * height,
    size: 8 + Math.random() * 12,
    speed: randomInRange(0.15, 0.35),
    opacity: randomInRange(0.25, 0.6),
    isPopping: false,
    popProgress: 0,
    phase: Math.random() * Math.PI * 2,
  }))

const createBees = (width: number, height: number): Bee[] =>
  Array.from({ length: BEE_COUNT }, (_, i) => {
    const startX = Math.random() * width
    const startY = Math.random() * height

    return {
      id: `bee-${i}`,
      x: startX,
      y: startY,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      angle: Math.random() * Math.PI * 2,
      wingPhase: Math.random() * Math.PI * 2,
      targetX: startX + randomInRange(-300, 300),
      targetY: startY + randomInRange(-300, 300),
    }
  })

const updateBubble = (bubble: Bubble, width: number, height: number): Bubble => {
  if (bubble.isPopping) {
    const progress = bubble.popProgress + 0.05
    if (progress >= 1) {
      return {
        ...bubble,
        x: Math.random() * width,
        y: height + Math.random() * 200,
        isPopping: false,
        popProgress: 0,
        phase: Math.random() * Math.PI * 2,
      }
    }

    return { ...bubble, popProgress: progress }
  }

  if (Math.random() < 0.00005) {
    return { ...bubble, isPopping: true, popProgress: 0 }
  }

  const nextY = bubble.y - bubble.speed
  const y = nextY < -bubble.size ? height + Math.random() * 200 : nextY
  const phase = bubble.phase + 0.002
  let x = bubble.x + Math.sin(phase) * 0.3

  if (x < 0) x = width + x
  if (x > width) x = x - width

  return { ...bubble, x, y, phase }
}

const updateBee = (bee: Bee, width: number, height: number): Bee => {
  const wingPhase = bee.wingPhase + 0.3
  const dx = bee.targetX - bee.x
  const dy = bee.targetY - bee.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  if (distance < 10) {
    const newTargetX = Math.random() * width
    const newTargetY = Math.random() * height
    return {
      ...bee,
      targetX: newTargetX,
      targetY: newTargetY,
      angle: Math.atan2(dy, dx),
      wingPhase,
    }
  }

  const speed = 0.5
  const vx = (dx / distance) * speed
  const vy = (dy / distance) * speed
  let x = bee.x + vx
  let y = bee.y + vy
  let nextVx = vx
  let nextVy = vy

  if (x < 0 || x > width) {
    x = Math.max(0, Math.min(width, x))
    nextVx = -nextVx
  }

  if (y < 0 || y > height) {
    y = Math.max(0, Math.min(height, y))
    nextVy = -nextVy
  }

  return {
    ...bee,
    x,
    y,
    vx: nextVx,
    vy: nextVy,
    angle: Math.atan2(nextVy, nextVx),
    wingPhase,
  }
}

const drawBubbles = (ctx: CanvasRenderingContext2D, bubbles: Bubble[]) => {
  bubbles.forEach((bubble) => {
    ctx.save()
    ctx.globalAlpha = Math.max(0, bubble.opacity * (bubble.isPopping ? 1 - bubble.popProgress : 1))
    ctx.beginPath()
    const radius = bubble.size * (bubble.isPopping ? 1 + bubble.popProgress * 0.8 : 1)
    ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(244, 180, 0, 0.18)"
    ctx.fill()
    ctx.lineWidth = bubble.isPopping ? 2 - bubble.popProgress : 1
    ctx.strokeStyle = "rgba(255, 184, 0, 0.45)"
    ctx.stroke()
    ctx.restore()
  })
}

const drawBee = (ctx: CanvasRenderingContext2D, bee: Bee) => {
  ctx.save()
  ctx.translate(bee.x, bee.y)
  ctx.rotate(bee.angle)

  // wings
  const wingOffset = Math.sin(bee.wingPhase) * 2
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.beginPath()
  ctx.ellipse(-2, -6, 6, 3 + wingOffset * 0.3, Math.PI / 6, 0, Math.PI * 2)
  ctx.ellipse(-2, 6, 6, 3 - wingOffset * 0.3, -Math.PI / 6, 0, Math.PI * 2)
  ctx.fill()

  // body
  ctx.fillStyle = "#F9A826"
  ctx.beginPath()
  ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // stripes
  ctx.strokeStyle = "#5C2805"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-4, -5)
  ctx.lineTo(-4, 5)
  ctx.moveTo(0, -6)
  ctx.lineTo(0, 6)
  ctx.moveTo(4, -5)
  ctx.lineTo(4, 5)
  ctx.stroke()

  ctx.restore()
}

const drawBees = (ctx: CanvasRenderingContext2D, bees: Bee[]) => {
  bees.forEach((bee) => drawBee(ctx, bee))
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const bubblesRef = useRef<Bubble[]>([])
  const beesRef = useRef<Bee[]>([])
  const frameCountRef = useRef(0)
  const lastSizeRef = useRef({ width: 0, height: 0 })
  const isVisibleRef = useRef(true)

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window === "undefined") return

    const { innerWidth, innerHeight, devicePixelRatio } = window
    if (
      lastSizeRef.current.width === innerWidth &&
      lastSizeRef.current.height === innerHeight
    ) {
      return
    }

    lastSizeRef.current = { width: innerWidth, height: innerHeight }
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    canvas.style.width = `${innerWidth}px`
    canvas.style.height = `${innerHeight}px`

    const ctx = canvas.getContext("2d")
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (bubblesRef.current.length === 0) {
      bubblesRef.current = createBubbles(innerWidth, innerHeight)
    }

    if (beesRef.current.length === 0) {
      beesRef.current = createBees(innerWidth, innerHeight)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || typeof window === 'undefined') return

    resizeCanvas()

    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('resize', resizeCanvas)

    const animate = () => {
      if (!isVisibleRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      const width = lastSizeRef.current.width || window.innerWidth
      const height = lastSizeRef.current.height || window.innerHeight

      bubblesRef.current = bubblesRef.current.map((bubble) =>
        updateBubble(bubble, width, height)
      )

      beesRef.current = beesRef.current.map((bee) => updateBee(bee, width, height))

      frameCountRef.current += 1
      if (frameCountRef.current % COLLISION_INTERVAL === 0) {
        const collisionRadius = 30
        const toPop: string[] = []

        beesRef.current.forEach((bee) => {
          bubblesRef.current.forEach((bubble) => {
            if (bubble.isPopping || toPop.includes(bubble.id)) return

            const dx = bee.x - bubble.x
            const dy = bee.y - bubble.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance < collisionRadius + bubble.size) {
              toPop.push(bubble.id)
            }
          })
        })

        if (toPop.length) {
          bubblesRef.current = bubblesRef.current.map((bubble) =>
            toPop.includes(bubble.id)
              ? { ...bubble, isPopping: true, popProgress: 0 }
              : bubble
          )
        }
      }

      ctx.clearRect(0, 0, width, height)
      drawBubbles(ctx, bubblesRef.current)
      drawBees(ctx, beesRef.current)

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [resizeCanvas])

  // Honeycomb pattern SVG - realistic beehive pattern with depth
  const HoneycombPattern = () => {
    const hexSize = 50
    const hexWidth = hexSize * Math.sqrt(3)
    const hexHeight = hexSize * 2
    const rowHeight = hexHeight * 0.75 // Height of one row

    return (
      <svg
        className="absolute inset-0 w-full h-full honeycomb-pattern"
        style={{ zIndex: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradient for depth - lighter at top, darker at bottom */}
          <linearGradient id="hex-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F4B400" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#E6A100" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#D4A000" stopOpacity="0.08" />
          </linearGradient>

          {/* Inner highlight gradient for 3D effect */}
          <radialGradient id="hex-highlight" cx="50%" cy="30%">
            <stop offset="0%" stopColor="#FFB800" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#F4B400" stopOpacity="0" />
          </radialGradient>

          {/* Shadow filter for depth */}
          <filter id="hex-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
            <feOffset dx="0.5" dy="1" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <pattern
            id="honeycomb-pattern-realistic"
            x="0"
            y="0"
            width={hexWidth}
            height={rowHeight * 2}
            patternUnits="userSpaceOnUse"
          >
            {/* First row - centered hexagons with depth */}
            <g filter="url(#hex-shadow)">
              <path
                d={`M ${hexWidth / 2} 0 
                    L ${hexWidth} ${rowHeight / 3} 
                    L ${hexWidth} ${rowHeight * 2 / 3} 
                    L ${hexWidth / 2} ${rowHeight} 
                    L 0 ${rowHeight * 2 / 3} 
                    L 0 ${rowHeight / 3} 
                    Z`}
                fill="url(#hex-gradient)"
                stroke="#F4B400"
                strokeWidth="1"
                opacity="0.4"
              />
              {/* Inner highlight for 3D effect */}
              <path
                d={`M ${hexWidth / 2} 0 
                    L ${hexWidth} ${rowHeight / 3} 
                    L ${hexWidth} ${rowHeight * 2 / 3} 
                    L ${hexWidth / 2} ${rowHeight} 
                    L 0 ${rowHeight * 2 / 3} 
                    L 0 ${rowHeight / 3} 
                    Z`}
                fill="url(#hex-highlight)"
                opacity="0.6"
              />
            </g>

            {/* Second row - offset by half width to create proper honeycomb grid */}
            <g filter="url(#hex-shadow)">
              <path
                d={`M ${hexWidth / 2} ${rowHeight} 
                    L ${hexWidth} ${rowHeight + rowHeight / 3} 
                    L ${hexWidth} ${rowHeight + rowHeight * 2 / 3} 
                    L ${hexWidth / 2} ${rowHeight * 2} 
                    L 0 ${rowHeight + rowHeight * 2 / 3} 
                    L 0 ${rowHeight + rowHeight / 3} 
                    Z`}
                fill="url(#hex-gradient)"
                stroke="#F4B400"
                strokeWidth="1"
                opacity="0.4"
              />
              {/* Inner highlight for 3D effect */}
              <path
                d={`M ${hexWidth / 2} ${rowHeight} 
                    L ${hexWidth} ${rowHeight + rowHeight / 3} 
                    L ${hexWidth} ${rowHeight + rowHeight * 2 / 3} 
                    L ${hexWidth / 2} ${rowHeight * 2} 
                    L 0 ${rowHeight + rowHeight * 2 / 3} 
                    L 0 ${rowHeight + rowHeight / 3} 
                    Z`}
                fill="url(#hex-highlight)"
                opacity="0.6"
              />
            </g>

            {/* Additional hexagon in first row for better coverage */}
            <g filter="url(#hex-shadow)">
              <path
                d={`M ${hexWidth + hexWidth / 2} 0 
                    L ${hexWidth * 2} ${rowHeight / 3} 
                    L ${hexWidth * 2} ${rowHeight * 2 / 3} 
                    L ${hexWidth + hexWidth / 2} ${rowHeight} 
                    L ${hexWidth} ${rowHeight * 2 / 3} 
                    L ${hexWidth} ${rowHeight / 3} 
                    Z`}
                fill="url(#hex-gradient)"
                stroke="#F4B400"
                strokeWidth="1"
                opacity="0.4"
              />
              {/* Inner highlight for 3D effect */}
              <path
                d={`M ${hexWidth + hexWidth / 2} 0 
                    L ${hexWidth * 2} ${rowHeight / 3} 
                    L ${hexWidth * 2} ${rowHeight * 2 / 3} 
                    L ${hexWidth + hexWidth / 2} ${rowHeight} 
                    L ${hexWidth} ${rowHeight * 2 / 3} 
                    L ${hexWidth} ${rowHeight / 3} 
                    Z`}
                fill="url(#hex-highlight)"
                opacity="0.6"
              />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#honeycomb-pattern-realistic)" />
      </svg>
    )
  }

  const honeycombBackground = useMemo(() => <HoneycombPattern />, [])

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        {honeycombBackground}
      </div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full particle-layer-canvas"
        style={{ zIndex: 1 }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(244, 180, 0, 0.01) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(244, 180, 0, 0.01) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(244, 180, 0, 0.015) 0%, transparent 40%)
          `,
          zIndex: 2,
        }}
      />
    </div>
  )
}
