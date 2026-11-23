/**
 * A small GIF89a writer: full-size frames, a fixed 256-colour palette (3 bits of red, 3 of green,
 * 2 of blue) and LZW compression. Enough for flat drawings such as a poker table; it avoids a
 * dependency for a feature that needs nothing more.
 */

const MIN_CODE_SIZE = 8
const CLEAR_CODE = 1 << MIN_CODE_SIZE
const END_CODE = CLEAR_CODE + 1
const MAX_CODES = 4096
const MAX_SUB_BLOCK = 255

/** Palette index of a colour: RRRGGGBB. */
export function paletteIndex(r: number, g: number, b: number): number {
  return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6)
}

/** The 256 colours of the palette, as r, g, b bytes. */
export function paletteBytes(): Uint8Array {
  const bytes = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const r = (i >> 5) & 7
    const g = (i >> 2) & 7
    const b = i & 3
    bytes[i * 3] = Math.round((r * 255) / 7)
    bytes[i * 3 + 1] = Math.round((g * 255) / 7)
    bytes[i * 3 + 2] = Math.round((b * 255) / 3)
  }
  return bytes
}

/** RGBA pixels as palette indexes. */
export function quantize(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const indexes = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < indexes.length; i++) indexes[i] = paletteIndex(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
  return indexes
}

class BitWriter {
  private bytes: number[] = []
  private buffer = 0
  private bits = 0

  write(code: number, size: number): void {
    this.buffer |= code << this.bits
    this.bits += size
    while (this.bits >= 8) {
      this.bytes.push(this.buffer & 0xff)
      this.buffer >>>= 8
      this.bits -= 8
    }
  }

  finish(): number[] {
    if (this.bits > 0) this.bytes.push(this.buffer & 0xff)
    this.buffer = 0
    this.bits = 0
    return this.bytes
  }
}

/** LZW-compresses palette indexes the way GIF wants them. */
export function lzwEncode(indexes: Uint8Array): number[] {
  const out = new BitWriter()
  let table = new Map<number, number>()
  let nextCode = END_CODE + 1
  let codeSize = MIN_CODE_SIZE + 1
  out.write(CLEAR_CODE, codeSize)
  if (indexes.length === 0) {
    out.write(END_CODE, codeSize)
    return out.finish()
  }
  let prefix = indexes[0]
  for (let i = 1; i < indexes.length; i++) {
    const byte = indexes[i]
    const key = prefix * 256 + byte
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }
    out.write(prefix, codeSize)
    if (nextCode < MAX_CODES) {
      table.set(key, nextCode)
      // The code size grows once the table needs one more bit for the codes the reader will see.
      if (nextCode === 1 << codeSize) codeSize += 1
      nextCode += 1
    } else {
      out.write(CLEAR_CODE, codeSize)
      table = new Map()
      nextCode = END_CODE + 1
      codeSize = MIN_CODE_SIZE + 1
    }
    prefix = byte
  }
  out.write(prefix, codeSize)
  out.write(END_CODE, codeSize)
  return out.finish()
}

const word = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff]

function subBlocks(data: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += MAX_SUB_BLOCK) {
    const chunk = data.slice(i, i + MAX_SUB_BLOCK)
    out.push(chunk.length, ...chunk)
  }
  out.push(0)
  return out
}

export interface GifFrame {
  /** RGBA pixels, `width * height * 4`. */
  rgba: Uint8ClampedArray | Uint8Array
}

/** Encodes frames shown one after the other, `delayMs` each, looping forever. */
export function encodeGif(frames: GifFrame[], width: number, height: number, delayMs: number): Uint8Array {
  const out: number[] = []
  out.push(...Array.from('GIF89a', (c) => c.charCodeAt(0)))
  out.push(...word(width), ...word(height), 0xf7, 0, 0)
  out.push(...paletteBytes())
  // Loop forever.
  out.push(0x21, 0xff, 0x0b, ...Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00)
  const delay = Math.max(2, Math.round(delayMs / 10))
  for (const frame of frames) {
    out.push(0x21, 0xf9, 0x04, 0x04, ...word(delay), 0x00, 0x00)
    out.push(0x2c, ...word(0), ...word(0), ...word(width), ...word(height), 0x00)
    out.push(MIN_CODE_SIZE, ...subBlocks(lzwEncode(quantize(frame.rgba))))
  }
  out.push(0x3b)
  return Uint8Array.from(out)
}
