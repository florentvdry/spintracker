/**
 * A hand as a picture and as a video: the table is drawn on a canvas, one frame per step of the
 * replay, then the frames are recorded (MediaRecorder: MP4 where the webview can, WebM otherwise)
 * or packed into a GIF. No encoder is shipped: the webview does the video, `gif.ts` the GIF.
 */
import type { Json } from '@/services/ipcService'
import type { ReplayStep } from '@/stores/replayerStore'
import { equitiesAt } from '@/utils/replayEquity'

export type Aspect = '16:9' | '9:16'

export const VIDEO_SIZES: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
}
/** GIFs are smaller: their size grows with every frame. */
export const GIF_SIZES: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 640, height: 360 },
  '9:16': { width: 360, height: 640 },
}

export interface Point {
  x: number
  y: number
}

/** Seats of a table as fractions of the picture, the hero (first) at the bottom. */
export function seatPoints(count: number, aspect: Aspect): Point[] {
  if (count <= 2) return aspect === '16:9' ? [{ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.2 }] : [{ x: 0.5, y: 0.82 }, { x: 0.5, y: 0.18 }]
  return aspect === '16:9'
    ? [{ x: 0.5, y: 0.8 }, { x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }]
    : [{ x: 0.5, y: 0.84 }, { x: 0.27, y: 0.16 }, { x: 0.73, y: 0.16 }]
}

/** The seat of each player: the hero at the bottom, the others in turn order after them. */
export function seatsOf(players: Json[], aspect: Aspect): Point[] {
  const points = seatPoints(players.length, aspect)
  const heroIndex = Math.max(0, players.findIndex((p) => p.isHero))
  return players.map((_, index) => points[(index - heroIndex + players.length) % players.length] ?? points[0])
}

const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_COLORS: Record<string, string> = { s: '#1b1f26', c: '#1b1f26', h: '#d63b3b', d: '#d63b3b' }

function cardParts(card: string): { rank: string; suit: string } {
  return { rank: card.slice(0, -1).toUpperCase().replace('T', '10'), suit: card.slice(-1).toLowerCase() }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCard(ctx: CanvasRenderingContext2D, card: string | null, x: number, y: number, w: number): void {
  const h = w * 1.4
  roundRect(ctx, x, y, w, h, w * 0.12)
  if (card === null) {
    ctx.fillStyle = '#2d5cba'
    ctx.fill()
    ctx.strokeStyle = '#7fb0ff'
    ctx.lineWidth = Math.max(1, w * 0.04)
    ctx.stroke()
    return
  }
  const { rank, suit } = cardParts(card)
  ctx.fillStyle = '#f3f1ec'
  ctx.fill()
  ctx.fillStyle = SUIT_COLORS[suit] ?? '#1b1f26'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${w * 0.5}px Inter, sans-serif`
  ctx.fillText(rank, x + w / 2, y + h * 0.36)
  ctx.font = `${w * 0.5}px Inter, sans-serif`
  ctx.fillText(SUIT_SYMBOLS[suit] ?? suit, x + w / 2, y + h * 0.7)
}

export interface FrameOptions {
  width: number
  height: number
  aspect: Aspect
  /** Show the stacks in big blinds (the way the replayer's BB switch does). */
  inBb: boolean
  bigBlind: number
  title: string
}

const splitCards = (text: unknown): string[] => (typeof text === 'string' ? (text.match(/.{2}/g) ?? []) : [])

/** Draws one step of the replay. */
export function drawFrame(ctx: CanvasRenderingContext2D, step: ReplayStep, hand: Json, options: FrameOptions): void {
  const { width, height, aspect } = options
  const unit = Math.min(width, height) / 720
  const { snapshot } = step
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#0f1114'
  ctx.fillRect(0, 0, width, height)

  // The felt.
  ctx.fillStyle = '#173a2a'
  ctx.strokeStyle = '#2a5a44'
  ctx.lineWidth = 8 * unit
  ctx.beginPath()
  ctx.ellipse(width / 2, height / 2, width * 0.42, height * 0.36, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Title and street.
  ctx.fillStyle = '#aeb6c4'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `600 ${22 * unit}px Inter, sans-serif`
  ctx.fillText(options.title, 24 * unit, 20 * unit)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#34c27a'
  ctx.fillText(snapshot.street.toUpperCase(), width - 24 * unit, 20 * unit)

  // Board and pot.
  const cardWidth = 64 * unit
  const gap = 10 * unit
  const boardWidth = 5 * cardWidth + 4 * gap
  snapshot.board.forEach((card, i) => drawCard(ctx, card, (width - boardWidth) / 2 + i * (cardWidth + gap), height / 2 - cardWidth * 0.7, cardWidth))
  const amount = (chips: number) => (options.inBb && options.bigBlind > 0 ? `${Math.round((chips / options.bigBlind) * 10) / 10} bb` : `${Math.round(chips)}`)
  if (snapshot.pot > 0) {
    ctx.fillStyle = '#e6e9ef'
    ctx.textAlign = 'center'
    ctx.font = `600 ${24 * unit}px "IBM Plex Mono", monospace`
    ctx.fillText(`Pot ${amount(snapshot.pot)}`, width / 2, height / 2 + cardWidth * 0.95)
  }

  // Seats.
  const equities = equitiesAt(hand.actions ?? [], step.applied)
  const last = snapshot.actionLog[snapshot.actionLog.length - 1]
  const seats = seatsOf(snapshot.players, aspect)
  const panelWidth = (aspect === '16:9' ? 250 : 230) * unit
  snapshot.players.forEach((player: Json, index: number) => {
    const point = seats[index]
    const cx = point.x * width
    const cy = point.y * height
    ctx.globalAlpha = player.isFolded ? 0.4 : 1

    const seatCards = splitCards(player.cards)
    const shown = player.isHero || player.showCards
    const cw = 46 * unit
    const cardsY = cy - 105 * unit
    ;[0, 1].forEach((i) => drawCard(ctx, shown ? (seatCards[i] ?? null) : null, cx - cw - 3 * unit + i * (cw + 6 * unit), cardsY, cw))

    roundRect(ctx, cx - panelWidth / 2, cy - 30 * unit, panelWidth, 80 * unit, 12 * unit)
    ctx.fillStyle = player.isActive ? '#1f3a2f' : '#171b24'
    ctx.fill()
    ctx.strokeStyle = player.isActive ? '#34c27a' : '#2f3646'
    ctx.lineWidth = 2 * unit
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = '#e6e9ef'
    ctx.font = `600 ${20 * unit}px Inter, sans-serif`
    ctx.fillText(`${player.position ? `${String(player.position).slice(0, 3)} · ` : ''}${player.name}`, cx, cy - 22 * unit)
    ctx.font = `600 ${20 * unit}px "IBM Plex Mono", monospace`
    ctx.fillStyle = '#34c27a'
    ctx.fillText(amount(player.currentStack), cx, cy + 8 * unit)
    const equity = equities?.[player.name]
    if (equity !== undefined && !player.isFolded) {
      ctx.fillStyle = '#e6e9ef'
      ctx.font = `600 ${16 * unit}px "IBM Plex Mono", monospace`
      ctx.fillText(`${Math.round(equity)}%`, cx, cy + 34 * unit)
    }
    if (player.bet > 0) {
      ctx.fillStyle = '#f5c06b'
      ctx.font = `600 ${18 * unit}px "IBM Plex Mono", monospace`
      const towardsCentre = cy > height / 2 ? -1 : 1
      ctx.fillText(amount(player.bet), cx, cy + towardsCentre * 78 * unit + (towardsCentre > 0 ? 10 * unit : 0))
    }
    if (last && last.playerName === player.name && last.description) {
      ctx.fillStyle = '#e6e9ef'
      ctx.font = `600 ${17 * unit}px Inter, sans-serif`
      ctx.fillText(String(last.description).slice(0, 38), cx, cy + 62 * unit)
    }
    ctx.globalAlpha = 1
  })

  // Signature.
  ctx.fillStyle = '#6b7080'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.font = `500 ${15 * unit}px Inter, sans-serif`
  ctx.fillText('SpinTracker', width / 2, height - 10 * unit)
}

/** The recorder format to use among the ones the webview supports, MP4 first. */
export function pickVideoFormat(isSupported: (mime: string) => boolean): { mime: string; extension: 'mp4' | 'webm' } | null {
  const candidates: { mime: string; extension: 'mp4' | 'webm' }[] = [
    { mime: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mime: 'video/mp4', extension: 'mp4' },
    { mime: 'video/webm;codecs=vp9', extension: 'webm' },
    { mime: 'video/webm;codecs=vp8', extension: 'webm' },
    { mime: 'video/webm', extension: 'webm' },
  ]
  return candidates.find((c) => isSupported(c.mime)) ?? null
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
/** The canvas is redrawn at this rate while a step is held, so the recording has frames to take. */
const REDRAW_MS = 100

export interface RecordOptions {
  steps: ReplayStep[]
  holdMs: number
  draw: (step: ReplayStep) => void
  onProgress: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Records the steps as they are drawn, each held for `holdMs`. */
export async function recordVideo(canvas: HTMLCanvasElement, options: RecordOptions): Promise<{ blob: Blob; extension: 'mp4' | 'webm' }> {
  const format = typeof MediaRecorder === 'undefined' ? null : pickVideoFormat((mime) => MediaRecorder.isTypeSupported(mime))
  if (!format) throw new Error('video recording is not supported here')
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: format.mime, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data)
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  recorder.start()
  try {
    for (let i = 0; i < options.steps.length; i++) {
      if (options.signal?.aborted) break
      options.onProgress(i, options.steps.length)
      const until = performance.now() + options.holdMs
      while (performance.now() < until) {
        options.draw(options.steps[i])
        await sleep(REDRAW_MS)
      }
    }
  } finally {
    recorder.stop()
  }
  await stopped
  if (options.signal?.aborted) throw new Error('cancelled')
  options.onProgress(options.steps.length, options.steps.length)
  return { blob: new Blob(chunks, { type: format.mime.split(';')[0] }), extension: format.extension }
}

/** The frames of the steps as pixels, for the GIF. */
export async function captureFrames(canvas: HTMLCanvasElement, options: RecordOptions): Promise<Uint8ClampedArray[]> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no canvas')
  const frames: Uint8ClampedArray[] = []
  for (let i = 0; i < options.steps.length; i++) {
    if (options.signal?.aborted) throw new Error('cancelled')
    options.draw(options.steps[i])
    frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
    options.onProgress(i + 1, options.steps.length)
    // Lets the page breathe between two frames.
    await sleep(0)
  }
  return frames
}
