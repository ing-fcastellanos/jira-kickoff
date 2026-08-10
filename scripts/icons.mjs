import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Generates web/public/favicon.ico from the same geometry as favicon.svg.
 *
 * The SVG is the real icon; the .ico is only there for the browsers that ignore
 * `type="image/svg+xml"`. Rasterising it by hand keeps the repo free of an image
 * toolchain (sharp, resvg, imagemagick) for three tiny bitmaps: zlib is already
 * in node, and the shape is two strokes and a rounded square.
 *
 * The geometry below mirrors favicon.svg. If that file moves a coordinate, this
 * one has to follow: `npm run icons`.
 */

const SIZE = 32 // design units, the SVG viewBox
const RADIUS = 7.5
const STROKE = 3 / 2 // half-width, which is what the distance test compares to
const SAMPLES = 8 // per axis; 64 per pixel is enough antialiasing at 16px

// Light pair from index.css. An .ico cannot follow the system theme, and the
// dark lavender on a light tab strip is the weaker of the two.
const BG = [0x6b, 0x4f, 0xa8]
const FG = [0xff, 0xff, 0xff]

const CHEVRON = [
  [9.5, 10, 15, 16],
  [15, 16, 9.5, 22],
]
const CARET = [[18.5, 22, 22.5, 22]]

/** Signed distance to the rounded square, negative inside. */
function sdRoundedSquare(x, y) {
  const half = SIZE / 2
  const qx = Math.abs(x - half) - (half - RADIUS)
  const qy = Math.abs(y - half) - (half - RADIUS)
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - RADIUS
}

/** Distance to a segment, which is what gives round caps and joins for free. */
function distanceToSegment(x, y, [ax, ay, bx, by]) {
  const vx = bx - ax
  const vy = by - ay
  const wx = x - ax
  const wy = y - ay
  const len = vx * vx + vy * vy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len))
  return Math.hypot(wx - t * vx, wy - t * vy)
}

function insideGlyph(x, y) {
  for (const segment of [...CHEVRON, ...CARET]) {
    if (distanceToSegment(x, y, segment) <= STROKE) return true
  }
  return false
}

/** RGBA pixels for one square size, supersampled. */
function render(size) {
  const scale = SIZE / size
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) * scale
          const y = (py + (sy + 0.5) / SAMPLES) * scale
          if (sdRoundedSquare(x, y) > 0) continue
          bg++
          if (insideGlyph(x, y)) fg++
        }
      }
      const total = SAMPLES * SAMPLES
      const alpha = bg / total
      const i = (py * size + px) * 4
      if (alpha === 0) continue
      // The glyph only exists over the square, so its coverage is already
      // clipped: mixing the two colours by their own share is the composite.
      const mix = fg / bg
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix)
      }
      pixels[i + 3] = Math.round(alpha * 255)
    }
  }
  return pixels
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Minimal RGBA PNG: no filtering, which zlib handles fine at these sizes. */
function png(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO carrying PNG payloads, which every browser still reading .ico accepts. */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = []
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size === 256 ? 0 : size
    entry[1] = size === 256 ? 0 : size
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const out = join(fileURLToPath(new URL('../web/public', import.meta.url)))
const images = [16, 32, 48].map((size) => ({ size, data: png(size, render(size)) }))
const file = join(out, 'favicon.ico')
writeFileSync(file, ico(images))
console.log(`  favicon.ico · ${images.map((i) => i.size).join(', ')} px · ${ico(images).length} B`)
