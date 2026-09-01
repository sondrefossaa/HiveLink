// scripts/generate-icons.ts
// One-off generator for PWA PNG icons (no image dependencies).
// Draws the HiveLink mark: golden hexagon + center dot on the dark theme color.
//
// Usage: npx tsx scripts/generate-icons.ts

import { deflateSync } from 'zlib'
import { writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, '..', 'public')

// --- Minimal PNG encoder (RGBA, 8-bit) ---

const CRC_TABLE: number[] = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x]
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Icon drawing ---

const BG: [number, number, number] = [0x0d, 0x0d, 0x0d]
const GOLD: [number, number, number] = [0xf4, 0xb4, 0x00]

/** Signed distance to a pointy-top hexagon centered at (cx, cy) with circumradius r. */
function hexDistance(px: number, py: number, cx: number, cy: number, r: number): number {
  const dx = px - cx
  const dy = py - cy
  let maxDist = -Infinity
  // Pointy-top hexagon edges at 0, 60, 120, ... degrees (normals)
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    const dist = dx * nx + dy * ny - (r * Math.sqrt(3)) / 2
    if (dist > maxDist) maxDist = dist
  }
  return maxDist
}

function drawIcon(size: number, maskable: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4)
  const c = size / 2
  // Maskable icons need a safe zone: content within the inner 80%
  const hexRadius = size * (maskable ? 0.34 : 0.4)
  const strokeWidth = Math.max(2, size * 0.055)
  const dotRadius = size * (maskable ? 0.11 : 0.13)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Supersample 2x2 for smoother edges
      let goldSamples = 0
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
        const px = x + ox
        const py = y + oy

        const dist = hexDistance(px, py, c, c, hexRadius)
        const inStroke = Math.abs(dist) <= strokeWidth / 2
        const inDot = Math.hypot(px - c, py - c) <= dotRadius

        if (inStroke || inDot) {
          goldSamples++
        }
      }

      // Blend between background and gold based on coverage
      const coverage = goldSamples / 4
      const idx = (y * size + x) * 4
      rgba[idx] = Math.round(BG[0] + (GOLD[0] - BG[0]) * coverage)
      rgba[idx + 1] = Math.round(BG[1] + (GOLD[1] - BG[1]) * coverage)
      rgba[idx + 2] = Math.round(BG[2] + (GOLD[2] - BG[2]) * coverage)
      rgba[idx + 3] = 255
    }
  }

  return encodePng(size, size, rgba)
}

async function main() {
  const targets: Array<[string, number, boolean]> = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-192.png', 192, true],
    ['icon-maskable-512.png', 512, true],
  ]

  for (const [name, size, maskable] of targets) {
    const png = drawIcon(size, maskable)
    await writeFile(path.join(PUBLIC_DIR, name), png)
    console.log(`✓ Wrote public/${name} (${size}x${size}${maskable ? ', maskable' : ''})`)
  }
}

main()
