import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin/codex-insights')
const assetsDir = path.join(pluginRoot, 'assets')
const skillAssetsDir = path.join(pluginRoot, 'skills/insights/assets')

const TEAL = [15, 118, 110, 255]
const PAPER = [248, 250, 252, 255]
const INK = [248, 250, 252, 255]
const DARK = [11, 18, 32, 255]

mkdirSync(assetsDir, { recursive: true })
mkdirSync(skillAssetsDir, { recursive: true })

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function writePng(filePath, width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixels[y * width + x]
      const offset = rowStart + 1 + x * 4
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  writeFileSync(
    filePath,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

function fill(pixels, width, height, color) {
  for (let i = 0; i < width * height; i += 1) pixels[i] = color
}

function rect(pixels, width, x0, y0, x1, y1, color, radius = 0) {
  const minX = Math.max(0, Math.floor(x0))
  const minY = Math.max(0, Math.floor(y0))
  const maxX = Math.min(width - 1, Math.ceil(x1))
  const maxY = Math.min(pixels.length / width - 1, Math.ceil(y1))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (radius > 0) {
        const dx = x < minX + radius ? minX + radius - x : x > maxX - radius ? x - (maxX - radius) : 0
        const dy = y < minY + radius ? minY + radius - y : y > maxY - radius ? y - (maxY - radius) : 0
        if (dx * dx + dy * dy > radius * radius) continue
      }
      pixels[y * width + x] = color
    }
  }
}

function drawMark(pixels, width, cx, cy, size, fillColor, barColor) {
  const half = size / 2
  rect(pixels, width, cx - half, cy - half, cx + half, cy + half, fillColor, size * 0.22)
  const barWidth = size * 0.11
  const gap = size * 0.08
  const base = cy + half * 0.42
  const heights = [size * 0.28, size * 0.46, size * 0.62]
  for (let i = 0; i < 3; i += 1) {
    const x = cx - (barWidth + gap) + i * (barWidth + gap)
    rect(pixels, width, x, base - heights[i], x + barWidth, base, barColor, barWidth * 0.35)
  }
}

function makeLogo(fileName, background, size, directory = assetsDir) {
  const pixels = new Array(size * size)
  fill(pixels, size, size, background)
  drawMark(pixels, size, size / 2, size / 2, size * 0.7, TEAL, INK)
  writePng(path.join(directory, fileName), size, size, pixels)
}

makeLogo('logo.png', PAPER, 512)
makeLogo('logo-dark.png', DARK, 512)
makeLogo('icon.png', PAPER, 256)
makeLogo('logo.png', PAPER, 512, skillAssetsDir)
makeLogo('icon.png', PAPER, 256, skillAssetsDir)

process.stdout.write(`Wrote plugin assets to ${assetsDir} and ${skillAssetsDir}\n`)
