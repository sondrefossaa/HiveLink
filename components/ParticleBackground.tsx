'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface Bubble {
  id: string
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  isPopping: boolean
  popProgress: number
  phase: number // For smooth horizontal drift
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

export default function ParticleBackground() {
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [bees, setBees] = useState<Bee[]>([])
  const animationFrameRef = useRef<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const beesRef = useRef<Bee[]>([])
  const frameCountRef = useRef(0)
  
  // Keep refs in sync with state
  useEffect(() => {
    bubblesRef.current = bubbles
  }, [bubbles])
  
  useEffect(() => {
    beesRef.current = bees
  }, [bees])

  // Initialize bubbles
  useEffect(() => {
    if (typeof window === 'undefined') return

    const initialBubbles: Bubble[] = []
    const bubbleCount = 10 // Reduced for better performance
    const width = window.innerWidth
    const height = window.innerHeight

    for (let i = 0; i < bubbleCount; i++) {
      initialBubbles.push({
        id: `bubble-${i}`,
        x: Math.random() * width,
        y: Math.random() * height, // Start bubbles at random positions across screen
        size: 8 + Math.random() * 12, // Smaller bubbles
        speed: 0.2 + Math.random() * 0.3, // Slower movement
        opacity: 0.25 + Math.random() * 0.35, // Slightly higher opacity for visibility
        isPopping: false,
        popProgress: 0,
        phase: Math.random() * Math.PI * 2, // Random starting phase for smooth drift
      })
    }

    setBubbles(initialBubbles)
  }, [])

  // Initialize bees
  useEffect(() => {
    if (typeof window === 'undefined') return

    const beeCount = 3 // Increased for better visibility
    const initialBees: Bee[] = []
    const width = window.innerWidth
    const height = window.innerHeight

    for (let i = 0; i < beeCount; i++) {
      const startX = Math.random() * width
      const startY = Math.random() * height
      
      initialBees.push({
        id: `bee-${i}`,
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        angle: Math.random() * Math.PI * 2,
        wingPhase: Math.random() * Math.PI * 2,
        targetX: startX + (Math.random() - 0.5) * 300, // Slower movement
        targetY: startY + (Math.random() - 0.5) * 300,
      })
    }

    setBees(initialBees)
  }, [])

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const now = Date.now()
      const width = typeof window !== 'undefined' ? window.innerWidth : 1920
      const height = typeof window !== 'undefined' ? window.innerHeight : 1080

      // Update bubbles
      setBubbles((prev) => {
        const updated = prev.map((bubble) => {
          if (bubble.isPopping) {
            const newProgress = bubble.popProgress + 0.05
            if (newProgress >= 1) {
              // Reset bubble at bottom
              return {
                ...bubble,
                x: Math.random() * width,
                y: height + Math.random() * 200,
                isPopping: false,
                popProgress: 0,
                phase: Math.random() * Math.PI * 2, // Reset phase
              }
            }
            return { ...bubble, popProgress: newProgress }
          }

          // Natural pop chance (very low - reduced for less distraction)
          if (Math.random() < 0.00005) {
            return { ...bubble, isPopping: true, popProgress: 0 }
          }

          // Float upward
          let newY = bubble.y - bubble.speed
          if (newY < -bubble.size) {
            // Reset bubble at bottom with random X position
            return {
              ...bubble,
              x: Math.random() * width,
              y: height + Math.random() * 200,
              phase: Math.random() * Math.PI * 2,
            }
          }

          // Smooth horizontal drift using phase
          const newPhase = bubble.phase + 0.002 // Increment phase smoothly
          const driftAmount = Math.sin(newPhase) * 0.3 // Smooth sine wave drift
          let newX = bubble.x + driftAmount

          // Wrap around screen edges properly
          if (newX < 0) {
            newX = width + newX
          } else if (newX > width) {
            newX = newX - width
          }

          return {
            ...bubble,
            x: newX,
            y: newY,
            phase: newPhase,
          }
        })

        return updated
      })

      // Update bees
      setBees((prev) => {
        return prev.map((bee) => {
          // Update wing phase
          const newWingPhase = bee.wingPhase + 0.3

          // Move towards target with smooth path
          const dx = bee.targetX - bee.x
          const dy = bee.targetY - bee.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 10) {
            // New target
            const newTargetX = Math.random() * width
            const newTargetY = Math.random() * height
            return {
              ...bee,
              targetX: newTargetX,
              targetY: newTargetY,
              angle: Math.atan2(dy, dx),
              wingPhase: newWingPhase,
            }
          }

          // Smooth movement towards target (slower for less distraction)
          const speed = 0.5
          const newVx = (dx / distance) * speed
          const newVy = (dy / distance) * speed
          const newX = bee.x + newVx
          const newY = bee.y + newVy

          // Boundary bounce
          let finalX = newX
          let finalY = newY
          let finalVx = newVx
          let finalVy = newVy

          if (newX < 0 || newX > width) {
            finalX = Math.max(0, Math.min(width, newX))
            finalVx = -finalVx
          }
          if (newY < 0 || newY > height) {
            finalY = Math.max(0, Math.min(height, newY))
            finalVy = -finalVy
          }

          return {
            ...bee,
            x: finalX,
            y: finalY,
            vx: finalVx,
            vy: finalVy,
            angle: Math.atan2(finalVy, finalVx),
            wingPhase: newWingPhase,
          }
        })
      })

      // Check collisions using refs - throttled for performance
      // Only check collisions every few frames to reduce lag
      frameCountRef.current++
      
      if (frameCountRef.current % 3 === 0) { // Check collisions every 3 frames
        const currentBees = beesRef.current
        const currentBubbles = bubblesRef.current
        const collisionRadius = 30
        const bubblesToPop: string[] = []

        currentBees.forEach((bee) => {
          currentBubbles.forEach((bubble) => {
            if (bubble.isPopping || bubblesToPop.includes(bubble.id)) return

            const dx = bee.x - bubble.x
            const dy = bee.y - bubble.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance < collisionRadius + bubble.size) {
              bubblesToPop.push(bubble.id)
            }
          })
        })

        // Pop bubbles in batch
        if (bubblesToPop.length > 0) {
          setBubbles((prev) =>
            prev.map((bubble) =>
              bubblesToPop.includes(bubble.id)
                ? { ...bubble, isPopping: true, popProgress: 0 }
                : bubble
            )
          )
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

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

  // Bee component - more subtle
  const BeeSprite = ({ bee }: { bee: Bee }) => {
    const wingOffset = Math.sin(bee.wingPhase) * 4
    const rotation = (bee.angle * 180) / Math.PI
    const wingOpacity = 0.5 + Math.abs(Math.sin(bee.wingPhase)) * 0.2

    return (
      <div
        className="absolute"
        style={{
          left: `${bee.x}px`,
          top: `${bee.y}px`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          pointerEvents: 'none',
          opacity: 0.85, // More visible bees
          transition: 'transform 0.1s linear', // Smooth movement
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          {/* Wings - back layer */}
          <ellipse
            cx="9"
            cy="9"
            rx="3.5"
            ry="5"
            fill="#FFB800"
            opacity={wingOpacity * 0.25}
            transform={`translate(0, ${wingOffset * 0.8})`}
          />
          <ellipse
            cx="15"
            cy="9"
            rx="3.5"
            ry="5"
            fill="#FFB800"
            opacity={wingOpacity * 0.25}
            transform={`translate(0, ${-wingOffset * 0.8})`}
          />
          {/* Body */}
          <ellipse
            cx="12"
            cy="12"
            rx="6"
            ry="4"
            fill="#F4B400"
            opacity="0.8"
          />
          {/* Stripes */}
          <line x1="9" y1="10" x2="9" y2="14" stroke="#1A1A1A" strokeWidth="1.2" />
          <line x1="12" y1="10" x2="12" y2="14" stroke="#1A1A1A" strokeWidth="1.2" />
          <line x1="15" y1="10" x2="15" y2="14" stroke="#1A1A1A" strokeWidth="1.2" />
          {/* Wings - front layer */}
          <ellipse
            cx="8.5"
            cy="9"
            rx="3"
            ry="4.5"
            fill="#FFB800"
            opacity={wingOpacity * 0.4}
            transform={`translate(0, ${wingOffset})`}
          />
          <ellipse
            cx="15.5"
            cy="9"
            rx="3"
            ry="4.5"
            fill="#FFB800"
            opacity={wingOpacity * 0.4}
            transform={`translate(0, ${-wingOffset})`}
          />
        </svg>
      </div>
    )
  }

  // Bubble component with lighting simulation
  const BubbleSprite = ({ bubble }: { bubble: Bubble }) => {
    if (bubble.isPopping) {
      const scale = 1 + bubble.popProgress * 2
      const opacity = (1 - bubble.popProgress) * bubble.opacity
      const highlightSize = bubble.size * 0.3 * scale

      return (
        <div
          className="absolute rounded-full transition-all duration-300 ease-out"
          style={{
            left: `${bubble.x}px`,
            top: `${bubble.y}px`,
            width: `${bubble.size * scale}px`,
            height: `${bubble.size * scale}px`,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle at 30% 30%, rgba(255, 184, 0, ${opacity}), rgba(244, 180, 0, ${opacity * 0.6}))`,
            border: `1px solid rgba(255, 184, 0, ${opacity * 0.5})`,
            opacity: opacity,
            pointerEvents: 'none',
            position: 'relative',
          }}
        >
          {/* Lighting highlight - top left */}
          <div
            className="absolute rounded-full"
            style={{
              width: `${highlightSize}px`,
              height: `${highlightSize}px`,
              top: `${bubble.size * scale * 0.2}px`,
              left: `${bubble.size * scale * 0.2}px`,
              background: `radial-gradient(circle, rgba(255, 255, 255, ${opacity * 0.6}), transparent)`,
              pointerEvents: 'none',
            }}
          />
        </div>
      )
    }

    const highlightSize = bubble.size * 0.3

    return (
      <div
        className="absolute rounded-full"
        style={{
          left: `${bubble.x}px`,
          top: `${bubble.y}px`,
          width: `${bubble.size}px`,
          height: `${bubble.size}px`,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle at 30% 30%, rgba(255, 184, 0, ${bubble.opacity}), rgba(244, 180, 0, ${bubble.opacity * 0.6}))`,
          border: `1px solid rgba(255, 184, 0, ${bubble.opacity * 0.5})`,
          boxShadow: `0 0 ${bubble.size * 0.5}px rgba(244, 180, 0, ${bubble.opacity * 0.3})`,
          pointerEvents: 'none',
          position: 'relative',
        }}
      >
        {/* Lighting highlight - small lighter circle in top left */}
        <div
          className="absolute rounded-full"
          style={{
            width: `${highlightSize}px`,
            height: `${highlightSize}px`,
            top: `${bubble.size * 0.2}px`,
            left: `${bubble.size * 0.2}px`,
            background: `radial-gradient(circle, rgba(255, 255, 255, ${bubble.opacity * 0.7}), transparent)`,
            pointerEvents: 'none',
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
    >
      {/* Honeycomb pattern - base layer */}
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          zIndex: 0,
          backgroundColor: 'transparent'
        }}
      >
        <HoneycombPattern />
      </div>

      {/* Bubbles */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        {bubbles.map((bubble) => (
          <BubbleSprite key={bubble.id} bubble={bubble} />
        ))}
      </div>

      {/* Bees */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        {bees.map((bee) => (
          <BeeSprite key={bee.id} bee={bee} />
        ))}
      </div>

      {/* Very subtle gradient overlay for depth - top layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(244, 180, 0, 0.01) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(244, 180, 0, 0.01) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(244, 180, 0, 0.015) 0%, transparent 40%)
          `,
          zIndex: 3,
        }}
      />
    </div>
  )
}
