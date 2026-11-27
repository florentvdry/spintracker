import { describe, expect, it } from 'vitest'
import { shouldOfferSetup } from './firstLaunch'

const found = [{ room: 'Winamax', path: 'C:/Users/a/Documents/Winamax Poker/accounts/1/history' }]

describe('shouldOfferSetup', () => {
  it('is offered when nothing is set up and a history folder was found', () => {
    expect(shouldOfferSetup({ enabled: false, folders: [], detected: found, dismissed: false })).toBe(true)
  })

  it('is not offered again once dismissed', () => {
    expect(shouldOfferSetup({ enabled: false, folders: [], detected: found, dismissed: true })).toBe(false)
  })

  it('is not offered when auto-import or folders are already configured', () => {
    expect(shouldOfferSetup({ enabled: true, folders: [], detected: found, dismissed: false })).toBe(false)
    expect(shouldOfferSetup({ enabled: false, folders: found, detected: found, dismissed: false })).toBe(false)
  })

  it('is not offered when no folder was found', () => {
    expect(shouldOfferSetup({ enabled: false, folders: [], detected: [], dismissed: false })).toBe(false)
  })
})
