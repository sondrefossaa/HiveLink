'use client'

import { useCallback, useMemo } from 'react'
import Particles from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { Engine, ISourceOptions } from '@tsparticles/engine'

export default function ParticleBackground() {
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine)
  }, [])

  const options: ISourceOptions = useMemo(
    () => ({
      background: {
        color: {
          value: 'transparent',
        },
      },
      fpsLimit: 60,
      particles: {
        color: {
          value: ['#F4B400', '#FFB800', '#E6A100', '#D4A000'],
        },
        move: {
          direction: 'none' as const,
          enable: true,
          outModes: {
            default: 'bounce' as const,
          },
          random: true,
          speed: 0.5,
          straight: false,
          attract: {
            enable: false,
          },
          drift: 0,
        },
        number: {
          density: {
            enable: true,
            width: 1920,
            height: 1080,
          },
          value: 50,
        },
        opacity: {
          value: {
            min: 0.1,
            max: 0.4,
          },
          animation: {
            enable: true,
            speed: 0.5,
            sync: false,
            mode: 'auto' as const,
            startValue: 'random' as const,
          },
        },
        shape: {
          type: 'circle',
        },
        size: {
          value: {
            min: 2,
            max: 8,
          },
          animation: {
            enable: true,
            speed: 2,
            sync: false,
            mode: 'auto' as const,
            startValue: 'random' as const,
          },
        },
        twinkle: {
          particles: {
            enable: true,
            frequency: 0.03,
            opacity: 0.8,
            color: {
              value: '#FFB800',
            },
          },
        },
        wobble: {
          enable: true,
          distance: 10,
          speed: {
            min: 1,
            max: 3,
          },
        },
      },
      detectRetina: true,
      fullScreen: {
        enable: false,
        zIndex: 0,
      },
    }),
    []
  )

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Particles
        id="tsparticles"
        init={particlesInit}
        options={options}
        className="w-full h-full"
      />
      {/* Gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(244, 180, 0, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 50%, rgba(244, 180, 0, 0.03) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 100%, rgba(244, 180, 0, 0.05) 0%, transparent 40%)
          `,
        }}
      />
    </div>
  )
}

