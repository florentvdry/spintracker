import type { Json } from '@/services/ipcService'

const lower = (text: unknown): string => (typeof text === 'string' ? text.trim().toLowerCase() : '')

/**
 * Every name the user plays under: the selected hero, and the player names of the alias group that
 * the hero is, or belongs to. The HUD uses them to tell the hero from the opponents at a table.
 */
export function heroNamesOf(heroName: string | null, aliases: Json[]): string[] {
  if (!heroName?.trim()) return []
  const wanted = lower(heroName)
  const names = new Set<string>([heroName.trim()])
  for (const alias of aliases) {
    const players: { name?: unknown }[] = Array.isArray(alias?.players) ? alias.players : []
    const isGroup = lower(alias?.name) === wanted || players.some((p) => lower(p.name) === wanted)
    if (!isGroup) continue
    for (const player of players) {
      if (typeof player.name === 'string' && player.name.trim()) names.add(player.name.trim())
    }
  }
  return [...names]
}
