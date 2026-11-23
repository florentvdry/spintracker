import { useEffect, useMemo, useState } from 'react'
import { ipcService, type Json } from '@/services/ipcService'
import { useLiveHudStore } from '@/stores/liveHudStore'
import { figuresOf, requestsOf, type HudFigures, type HudGrid } from '@/views/LiveHud/hudGrid'
import type { HudFormat } from '@/views/LiveHud/hudProfile'
import { logError } from '@/utils/log'

/** What a seat shows of the HUD: the profile's main grid and the opponent's figures. */
export interface SeatHud {
  grid: HudGrid
  figures: HudFigures
}

/** Players of a hand whose figures a seat can show: everyone but the hero. */
function opponentsOf(handData: Json | null): string[] {
  return ((handData?.players ?? []) as Json[]).filter((p) => !p.isHero).map((p) => String(p.name))
}

/**
 * The HUD of each opponent as it stood at the time of the hand: the figures count only the hands
 * played before it, in the active profile's layout for this table size.
 */
export function useReplayerHud(handData: Json | null, enabled: boolean): Record<string, SeatHud> {
  const settings = useLiveHudStore((s) => s.settings)
  const loaded = useLiveHudStore((s) => s.loaded)
  const load = useLiveHudStore((s) => s.load)
  const [answers, setAnswers] = useState<Record<string, HudFigures>>({})

  useEffect(() => {
    if (enabled && !loaded) void load()
  }, [enabled, loaded, load])

  const profile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const playerCount = (handData?.players ?? []).length
  const format: HudFormat = playerCount <= 2 ? 'headsUp' : 'threeMax'
  const grid = profile?.layouts[format].grids[0]
  const requests = useMemo(() => (profile ? requestsOf({ grids: grid ? [grid] : [], popups: [] }) : []), [profile, grid])

  const handId = handData?.handId
  const room = handData?.room as string | undefined
  const date = handData?.date as string | undefined
  const spinFormat = handData?.spinFormat as string | undefined
  const hero = ((handData?.players ?? []) as Json[]).find((p) => p.isHero)?.name as string | undefined
  const opponents = useMemo(() => opponentsOf(handData), [handData])

  useEffect(() => {
    if (!enabled || !grid || !room || !hero || !date || opponents.length === 0 || requests.length === 0) {
      setAnswers({})
      return undefined
    }
    let cancelled = false
    void ipcService
      .getHudPlayers({ room, heroName: hero, players: opponents, stats: requests, spinFormat, before: date })
      .then((result) => {
        if (cancelled || !result.success) return
        const next: Record<string, HudFigures> = {}
        for (const answer of (result.data?.players ?? []) as Json[]) next[answer.name] = figuresOf(answer.stats ?? [])
        setAnswers(next)
      })
      .catch((error: unknown) => logError('Could not read the HUD figures of the hand:', error))
    return () => {
      cancelled = true
    }
    // One read per hand: the hand id stands for its room, date and players.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handId, grid, requests])

  return useMemo(() => {
    const out: Record<string, SeatHud> = {}
    if (!grid) return out
    for (const [name, figures] of Object.entries(answers)) out[name] = { grid, figures }
    return out
  }, [grid, answers])
}
