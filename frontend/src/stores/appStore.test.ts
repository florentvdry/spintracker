import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDashboardStats = vi.fn()
const getSessionHistory = vi.fn()
const getBuyIns = vi.fn()

vi.mock('@/services/ipcService', () => ({
  ipcService: {
    getDashboardStats: (...args: unknown[]) => getDashboardStats(...args),
    getSessionHistory: (...args: unknown[]) => getSessionHistory(...args),
    getBuyIns: (...args: unknown[]) => getBuyIns(...args),
  },
}))

import { useAppStore } from './appStore'
import { useFilterStore } from './filterStore'

/** A promise settled by hand, to control the order in which backend answers arrive. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('appStore refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFilterStore.setState({ heroName: 'hero' })
    getBuyIns.mockResolvedValue({ success: true, data: [] })
    getDashboardStats.mockResolvedValue({ success: true, data: {} })
    getSessionHistory.mockResolvedValue({ success: true, data: [] })
  })

  it('keeps loading until the latest of two overlapping refreshes completes', async () => {
    const first = deferred<{ success: boolean; data: unknown[] }>()
    getSessionHistory.mockReturnValueOnce(first.promise)

    const older = useAppStore.getState().refreshAll()
    const newer = useAppStore.getState().refreshAll()

    await newer
    expect(useAppStore.getState().isLoading).toBe(false)

    // The older refresh finishing last must neither end nor restart the loading state.
    first.resolve({ success: true, data: [] })
    await older
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('does not hide the loading state when an older refresh finishes first', async () => {
    const slow = deferred<{ success: boolean; data: unknown[] }>()
    getSessionHistory.mockReturnValueOnce(Promise.resolve({ success: true, data: [] })).mockReturnValueOnce(slow.promise)

    const older = useAppStore.getState().refreshAll()
    const newer = useAppStore.getState().refreshAll()

    await older
    expect(useAppStore.getState().isLoading).toBe(true)

    slow.resolve({ success: true, data: [] })
    await newer
    expect(useAppStore.getState().isLoading).toBe(false)
  })

  it('ignores the answer of a superseded sessions request', async () => {
    const stale = deferred<{ success: boolean; data: unknown[] }>()
    getSessionHistory.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ success: true, data: [{ session_date: 'new' }] })

    const older = useAppStore.getState().loadSessions()
    await useAppStore.getState().loadSessions()
    stale.resolve({ success: true, data: [{ session_date: 'old' }] })
    await older

    expect(useAppStore.getState().sessions).toEqual([{ session_date: 'new' }])
  })
})
