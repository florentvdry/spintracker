import { describe, expect, it } from 'vitest'
import { GIF_SIZES, VIDEO_SIZES, dealEquities, pickVideoFormat, seatPoints, seatsOf } from './handVideo'

describe('pickVideoFormat', () => {
  it('prefers MP4 and falls back to WebM', () => {
    expect(pickVideoFormat(() => true)?.extension).toBe('mp4')
    expect(pickVideoFormat((mime) => mime.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9', extension: 'webm' })
    expect(pickVideoFormat((mime) => mime === 'video/webm')).toEqual({ mime: 'video/webm', extension: 'webm' })
  })

  it('gives nothing when the webview records nothing', () => {
    expect(pickVideoFormat(() => false)).toBeNull()
  })
})

describe('layouts', () => {
  it('has the two formats and keeps the GIF smaller than the video', () => {
    expect(VIDEO_SIZES['16:9']).toEqual({ width: 1280, height: 720 })
    expect(VIDEO_SIZES['9:16']).toEqual({ width: 720, height: 1280 })
    for (const aspect of ['16:9', '9:16'] as const) {
      expect(GIF_SIZES[aspect].width).toBeLessThan(VIDEO_SIZES[aspect].width)
      expect(GIF_SIZES[aspect].width / GIF_SIZES[aspect].height).toBeCloseTo(VIDEO_SIZES[aspect].width / VIDEO_SIZES[aspect].height, 5)
    }
  })

  it('puts the hero at the bottom and every seat inside the picture', () => {
    for (const aspect of ['16:9', '9:16'] as const) {
      for (const count of [2, 3]) {
        const points = seatPoints(count, aspect)
        expect(points).toHaveLength(count)
        expect(points[0].y).toBeGreaterThan(0.7)
        for (const p of points) {
          expect(p.x).toBeGreaterThan(0)
          expect(p.x).toBeLessThan(1)
          expect(p.y).toBeGreaterThan(0)
          expect(p.y).toBeLessThan(1)
        }
      }
    }
  })

  it('seats the players after the hero in turn order', () => {
    const players = [{ name: 'A' }, { name: 'Hero', isHero: true }, { name: 'C' }]
    const seats = seatsOf(players, '16:9')
    const layout = seatPoints(3, '16:9')
    expect(seats[1]).toEqual(layout[0])
    expect(seats[2]).toEqual(layout[1])
    expect(seats[0]).toEqual(layout[2])
  })
})

describe('dealEquities', () => {
  const actions = [{ equity: { Hero: 60, Villain: 40 } }, { type: 'Call' }, { equity: { Hero: 90, Villain: 10 } }]

  it('takes the equities of the last deal already played', () => {
    expect(dealEquities(actions, 2)).toEqual({ Hero: 60, Villain: 40 })
    expect(dealEquities(actions, 3)).toEqual({ Hero: 90, Villain: 10 })
  })

  it('gives nothing when the replay carries none', () => {
    expect(dealEquities([{ type: 'Call' }], 1)).toBeNull()
    expect(dealEquities(actions, 0)).toBeNull()
  })
})
