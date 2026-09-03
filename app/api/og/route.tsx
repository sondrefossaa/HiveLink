import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Get params from URL
    const status = searchParams.get('status') || 'playing' // 'won', 'gave-up', 'playing'
    const startWord = searchParams.get('start') || 'fotball'
    const goalWord = searchParams.get('goal') || 'ballong'
    const words = searchParams.get('words') || '0'
    const layers = searchParams.get('layers') || '0'
    const paths = searchParams.get('paths') || '0'
    const pathWords = searchParams.getAll('path').slice(0, 8)
    const fullPath = pathWords.join(' → ')
    const pathText = fullPath.length > 70 ? `${fullPath.slice(0, 67)}...` : fullPath
    const puzzleNumber = searchParams.get('puzzle')
    const difficulty = searchParams.get('difficulty') || 'medium'
    const isDaily = !!puzzleNumber

    // Status config - matching VictoryModal style
    const statusConfig: Record<string, { emoji: string; title: string; subtitle: string; subtitleColor: string }> = {
      won: { emoji: '🏆', title: 'Puslespill løst!', subtitle: 'Utmerket!', subtitleColor: '#4ade80' },
      'gave-up': { emoji: '🔄', title: 'Prøv igjen!', subtitle: 'Du får dette til', subtitleColor: '#fbbf24' },
      playing: { emoji: '🐝', title: 'Pågående', subtitle: 'Summer fortsatt...', subtitleColor: '#F4B400' },
    }
    const statusInfo = statusConfig[status] || statusConfig.playing

    // Header text
    const header = isDaily
      ? `HiveLink #${puzzleNumber}`
      : `HiveLink ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1f1f1f',
            fontFamily: 'system-ui, sans-serif',
            position: 'relative',
            padding: '40px',
          }}
        >
          {/* Header glow effect - like VictoryModal */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '250px',
              background: 'linear-gradient(180deg, rgba(244, 180, 0, 0.15) 0%, transparent 100%)',
              display: 'flex',
            }}
          />

          {/* Main card - matching VictoryModal style */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '40px 48px',
              background: '#262626',
              borderRadius: '24px',
              border: '1px solid #404040',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              width: '100%',
              maxWidth: '500px',
            }}
          >
            {/* Trophy icon with gradient background - like VictoryModal */}
            <div
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F4B400 0%, #D4A000 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 0 40px rgba(244, 180, 0, 0.4)',
              }}
            >
              <span style={{ fontSize: '44px' }}>{statusInfo.emoji}</span>
            </div>

            {/* Title - like VictoryModal */}
            <div
              style={{
                fontSize: '36px',
                fontWeight: 'bold',
                color: '#ffffff',
                marginBottom: '6px',
                display: 'flex',
              }}
            >
              {statusInfo.title}
            </div>

            {/* Subtitle with color */}
            <div
              style={{
                fontSize: '20px',
                fontWeight: '500',
                color: statusInfo.subtitleColor,
                marginBottom: '20px',
                display: 'flex',
              }}
            >
              {statusInfo.subtitle}
            </div>

            {/* Puzzle info badge */}
            <div
              style={{
                display: 'flex',
                padding: '8px 20px',
                background: 'rgba(244, 180, 0, 0.1)',
                borderRadius: '10px',
                marginBottom: '24px',
              }}
            >
              <span style={{ fontSize: '18px', color: '#F4B400' }}>
                🍯 {header}
              </span>
            </div>

            {/* Word path */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: pathText ? '16px' : '28px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  padding: '12px 22px',
                  background: '#F4B400',
                  borderRadius: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#1f1f1f',
                  }}
                >
                  {startWord}
                </span>
              </div>
              <span style={{ fontSize: '26px', color: '#666' }}>→</span>
              <div
                style={{
                  display: 'flex',
                  padding: '12px 22px',
                  background: status === 'won' ? '#22c55e' : '#333',
                  borderRadius: '10px',
                  border: status !== 'won' ? '2px solid #F4B400' : 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: status === 'won' ? '#fff' : '#F4B400',
                  }}
                >
                  {goalWord}
                </span>
              </div>
            </div>

            {pathText && (
              <div
                style={{
                  display: 'flex',
                  color: '#d4d4d4',
                  fontSize: '17px',
                  textAlign: 'center',
                  marginBottom: '24px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(13, 13, 13, 0.45)',
                }}
              >
                {pathText}
              </div>
            )}

            {/* Stats grid - matching VictoryModal layout */}
            <div
              style={{
                display: 'flex',
                gap: '16px',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              {/* Words stat */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '14px 24px',
                  background: 'rgba(13, 13, 13, 0.5)',
                  borderRadius: '14px',
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '30px',
                    fontWeight: 'bold',
                    color: '#F4B400',
                  }}
                >
                  {words}
                </span>
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Ord
                </span>
              </div>

              {/* Layers stat */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '14px 24px',
                  background: 'rgba(13, 13, 13, 0.5)',
                  borderRadius: '14px',
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '30px',
                    fontWeight: 'bold',
                    color: '#F4B400',
                  }}
                >
                  {layers}
                </span>
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Lag
                </span>
              </div>

              {/* Paths stat */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '14px 24px',
                  background: 'rgba(13, 13, 13, 0.5)',
                  borderRadius: '14px',
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '30px',
                    fontWeight: 'bold',
                    color: '#F4B400',
                  }}
                >
                  {paths}
                </span>
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Stier
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 630,
        height: 900,
      }
    )
  } catch (e) {
    console.error('Error generating OG image:', e)
    return new Response('Failed to generate image', { status: 500 })
  }
}
