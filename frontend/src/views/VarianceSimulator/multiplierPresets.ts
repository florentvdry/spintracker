/**
 * Theoretical prize pool multiplier distributions, as frequencies in %.
 * Source: pokersciences.com ("Spin & Go Rake and Jackpots"), published for 1 € buy-ins only.
 * Both tables average x2.79, which is the three buy-ins minus the 7% rake.
 */
export interface PresetRow {
  multiplier: string
  weight: string
}

export const MULTIPLIER_PRESETS = {
  winamax: [
    { multiplier: '2', weight: '59.38688' },
    { multiplier: '3', weight: '26.74208' },
    { multiplier: '4', weight: '8.25' },
    { multiplier: '5', weight: '4' },
    { multiplier: '10', weight: '1.5' },
    { multiplier: '50', weight: '0.1' },
    { multiplier: '100', weight: '0.02' },
    { multiplier: '1000', weight: '0.001' },
    { multiplier: '100000', weight: '0.00004' },
  ],
  betclic: [
    { multiplier: '2', weight: '47.8185' },
    { multiplier: '3', weight: '34.621' },
    { multiplier: '4', weight: '13' },
    { multiplier: '5', weight: '4' },
    { multiplier: '10', weight: '0.5' },
    { multiplier: '20', weight: '0.05' },
    { multiplier: '100', weight: '0.01' },
    { multiplier: '1000', weight: '0.0005' },
  ],
} satisfies Record<string, PresetRow[]>

export type PresetKey = keyof typeof MULTIPLIER_PRESETS
export type DistributionChoice = PresetKey | 'custom'
