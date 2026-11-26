import { describe, expect, it } from 'vitest'
import { encodeGif, lzwEncode, paletteBytes, paletteIndex, quantize } from './gif'

const MIN_CODE_SIZE = 8
const CLEAR = 1 << MIN_CODE_SIZE
const END = CLEAR + 1

/** The reference way of reading GIF LZW data, to check the encoder against. */
function lzwDecode(bytes: number[]): number[] {
  let table: number[][] = []
  const reset = () => {
    table = Array.from({ length: CLEAR }, (_, i) => [i])
    table.push([], [])
  }
  reset()
  let size = MIN_CODE_SIZE + 1
  let buffer = 0
  let bits = 0
  let position = 0
  const out: number[] = []
  let previous: number[] | null = null
  while (true) {
    while (bits < size && position < bytes.length) {
      buffer |= bytes[position++] << bits
      bits += 8
    }
    if (bits < size) break
    const code = buffer & ((1 << size) - 1)
    buffer >>>= size
    bits -= size
    if (code === CLEAR) {
      reset()
      size = MIN_CODE_SIZE + 1
      previous = null
      continue
    }
    if (code === END) break
    let entry: number[]
    if (code < table.length) entry = table[code]
    else if (previous) entry = [...previous, previous[0]]
    else throw new Error('bad code')
    out.push(...entry)
    if (previous) {
      table.push([...previous, entry[0]])
      if (table.length === 1 << size && size < 12) size += 1
    }
    previous = entry
  }
  return out
}

describe('lzwEncode', () => {
  it('round-trips short, repetitive and noisy data', () => {
    const cases: Uint8Array[] = [
      Uint8Array.from([]),
      Uint8Array.from([7]),
      Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      Uint8Array.from(Array.from({ length: 3000 }, (_, i) => (i * 37 + (i >> 3)) % 251)),
      Uint8Array.from(Array.from({ length: 20000 }, (_, i) => (i % 97 < 60 ? 5 : (i * 13) % 256))),
    ]
    for (const input of cases) expect(lzwDecode(lzwEncode(input))).toEqual(Array.from(input))
  })

  it('survives a table that fills up and restarts', () => {
    let seed = 12345
    const noise = Uint8Array.from(Array.from({ length: 60000 }, () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 0xff))
    expect(lzwDecode(lzwEncode(noise))).toEqual(Array.from(noise))
  })
})

describe('palette', () => {
  it('maps a colour to the nearest of the 3-3-2 palette and back', () => {
    const palette = paletteBytes()
    for (const [r, g, b] of [[255, 255, 255], [0, 0, 0], [52, 194, 122], [255, 122, 107]]) {
      const index = paletteIndex(r, g, b)
      expect(Math.abs(palette[index * 3] - r)).toBeLessThan(40)
      expect(Math.abs(palette[index * 3 + 1] - g)).toBeLessThan(40)
      expect(Math.abs(palette[index * 3 + 2] - b)).toBeLessThan(90)
    }
    expect(quantize(Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255]))).toEqual(Uint8Array.from([255, 0]))
  })
})

describe('encodeGif', () => {
  it('writes a valid file: signature, size, one image per frame and the trailer', () => {
    const width = 4
    const height = 2
    const frame = (value: number) => ({ rgba: Uint8Array.from(Array.from({ length: width * height * 4 }, (_, i) => (i % 4 === 3 ? 255 : value))) })
    const gif = encodeGif([frame(255), frame(0)], width, height, 500)
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a')
    expect([gif[6] | (gif[7] << 8), gif[8] | (gif[9] << 8)]).toEqual([width, height])
    expect(gif[gif.length - 1]).toBe(0x3b)
    const images = Array.from(gif).filter((byte, i, all) => byte === 0x2c && all[i - 1] === 0x00).length
    expect(images).toBeGreaterThanOrEqual(2)
  })
})
