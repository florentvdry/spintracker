import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, Check, ChevronDown, Hash, RefreshCw, Search, Trash2, Trophy, Upload, Users, X } from 'lucide-react'
import RoomLogo from '@/components/common/RoomLogo'
import AutoImportIndicator from './AutoImportIndicator'
import HudSwitch from './HudSwitch'
import TopNav from './TopNav'
import { ipcService, type ImportProgress, type Json } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore, type DateRange } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useProgressStore } from '@/stores/progressStore'
import { useUpdateStore } from '@/stores/updateStore'
import { formatCurrency, formatDate } from '@/utils/formatters'

const RECENT_SESSIONS_SHOWN = 5
const PLAYER_LIST_LIMIT = 500

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function Dot() {
  return <div className="w-2 h-2 rounded-full bg-primary-500" />
}

export default function Header() {
  const { t } = useTranslation()
  // The HUD page has nothing to filter: its figures come from every hand of the opponents.
  const { pathname } = useLocation()
  const hideFilters = pathname === '/hud' || pathname === '/settings'
  const app = useAppStore()
  const filters = useFilterStore()
  const updates = useUpdateStore()
  const notifications = useNotificationStore()
  const progress = useProgressStore()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [players, setPlayers] = useState<Json[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [heroOpen, setHeroOpen] = useState(false)
  const [dateMenu, setDateMenu] = useState<'session' | 'custom' | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(filters.customDateFrom ?? '')
  const [customTo, setCustomTo] = useState(filters.customDateTo ?? '')

  const unreadCount = notifications.history.filter((n) => !n.read).length

  const loadPlayers = useCallback(async () => {
    try {
      const res = await ipcService.getPlayers({ limit: PLAYER_LIST_LIMIT, minHands: 1 })
      if (res.success) setPlayers(res.data)
      await useFilterStore.getState().fetchAliases()
    } catch {
      // The hero list is optional; the header stays usable without it.
    }
  }, [])

  // `lastUpdate` changes after every data reload, including the ones the automatic import triggers.
  useEffect(() => {
    if (app.isInitialized) void loadPlayers()
  }, [app.isInitialized, app.lastUpdate, loadPlayers])

  useEffect(() => {
    setCustomFrom(filters.customDateFrom ?? '')
    setCustomTo(filters.customDateTo ?? '')
  }, [filters.customDateFrom, filters.customDateTo])

  const needle = searchTerm.toLowerCase()
  const filteredPlayers = useMemo(() => players.filter((p) => p.name.toLowerCase().includes(needle)), [players, needle])
  const filteredAliases = useMemo(() => filters.aliases.filter((a) => a.name.toLowerCase().includes(needle)), [filters.aliases, needle])

  const mainDateFilters: { id: DateRange; label: string }[] = [
    { id: 'today', label: t('dashboard.filters.today') },
    { id: 'week', label: t('dashboard.filters.week') },
    { id: 'month', label: t('dashboard.filters.month') },
    { id: 'all', label: t('dashboard.filters.all') },
  ]

  const customLabel = (() => {
    const fmt = (v: string) => (v ? v.replace('T', ' ') : '...')
    return filters.dateRange === 'custom' ? `${fmt(customFrom)} - ${fmt(customTo)}` : t('common.custom')
  })()

  const sessionLabel = (() => {
    const selected = filters.selectedSession
    if (filters.dateRange !== 'session' || !selected) return t('common.sessions')
    return `${formatDate(selected.session_date, { format: 'date-only' })} ${formatTime(selected.session_date)}→${formatTime(selected.session_end)}`
  })()

  const handleImport = async () => {
    const unsubscribe = ipcService.onImportProgress((p: ImportProgress) => {
      if (p.stage === 'counting') {
        progress.update({
          progress: p.percent,
          message: t('header.counting', { current: p.filesProcessed + 1, total: p.totalFiles }),
        })
        return
      }
      let message = `${p.handsImported} ${t('common.hands')}`
      if (p.handsSkipped) message += ` (+${p.handsSkipped} ${t('common.skipped')})`
      if (p.totalHands) message += ` / ${p.totalHands}`
      progress.update({ progress: p.percent, message })
    })

    progress.start({ title: t('header.import_hands'), message: t('header.calculating') })

    try {
      const result = await ipcService.importHandHistory()
      if (result.success) {
        notifications.addNotification({
          type: 'success',
          title: t('header.import_success'),
          message: t('header.import_stats', {
            hands: result.handsImported,
            skipped: result.handsSkipped || 0,
            files: result.filesProcessed,
          }),
        })
        await app.refreshAll()
        await loadPlayers()
      } else if (result.message !== 'Import cancelled') {
        notifications.addNotification({ type: 'error', title: t('header.import_error'), message: result.message ?? '' })
      }
    } catch (error) {
      notifications.addNotification({
        type: 'error',
        title: t('common.error'),
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      progress.finish()
      unsubscribe()
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await app.refreshAll()
    setIsRefreshing(false)
    notifications.addNotification({ type: 'info', message: t('header.data_refreshed') })
  }

  const menuPanel = 'absolute top-full mt-1.5 z-50 flex flex-col rounded-[10px] border border-dark-200 bg-dark-300 shadow-xl'
  const menuItem = (active: boolean) =>
    clsx('px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 flex items-center justify-between rounded-md', active ? 'bg-primary-500/10 text-primary-400' : 'text-gray-300')
  const toggleDateMenu = (menu: 'session' | 'custom') => setDateMenu(dateMenu === menu ? null : menu)

  return (
    <>
      <TopNav>
        {!hideFilters && (
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-dark-200 bg-dark-400 py-1 pl-1 pr-2.5 hover:border-dark-100 transition-colors"
              onClick={() => setHeroOpen(!heroOpen)}
            >
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-dark-300 font-semibold text-primary-500">
                {(filters.heroName || '?').charAt(0).toUpperCase()}
              </span>
              <span className="text-gray-500">{t('common.hero')}</span>
              <b className="max-w-[160px] truncate font-medium text-gray-200">{filters.heroName || t('header.select_hero')}</b>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
            {heroOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHeroOpen(false)} />
                <div className={clsx(menuPanel, 'right-0 w-64 max-h-[400px]')}>
                  <div className="p-2 border-b border-dark-200">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <input
                        type="text"
                        autoFocus
                        placeholder={t('common.search')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-dark-400 border border-dark-200 rounded pl-8 pr-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {filteredAliases.length > 0 && (
                      <div className="px-2 py-1 bg-dark-400/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('common.aliases', 'Aliases')}</div>
                    )}
                    {filteredAliases.map((a) => (
                      <div key={`alias-${a.id}`} className={menuItem(filters.heroName === a.name)} onClick={() => { filters.setHeroName(a.name); setHeroOpen(false) }}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary-400" />
                          <div className="flex flex-col">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-xs text-gray-500">{a.players.length} {t('common.players')}</span>
                          </div>
                        </div>
                        {filters.heroName === a.name && <Dot />}
                      </div>
                    ))}

                    {filteredPlayers.length > 0 && (
                      <div className="px-2 py-1 bg-dark-400/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('common.players')}</div>
                    )}
                    {filteredPlayers.map((p) => (
                      <div key={p.id} className={menuItem(filters.heroName === p.name)} onClick={() => { filters.setHeroName(p.name); setHeroOpen(false) }}>
                        <div className="flex items-center gap-2">
                          <RoomLogo room={p.room} />
                          <div className="flex flex-col">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-gray-500">{p.total_hands} {t('common.hands')}</span>
                          </div>
                        </div>
                        {filters.heroName === p.name && <Dot />}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <button onClick={handleImport} className="btn-primary">
          <Upload className="w-4 h-4" />
          <span>{t('common.import')}</span>
        </button>

        <button onClick={handleRefresh} disabled={isRefreshing} className="btn-icon p-2" title={t('common.refresh')}>
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
        </button>

        {(updates.isAvailable || updates.isDownloaded) && (
          <button
            onClick={() => void updates.downloadUpdate()}
            className="flex h-8 items-center gap-1.5 px-3 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-full text-xs font-medium transition-colors border border-primary-500/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
            </span>
            {t('header.update_required')}
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button className="btn-icon p-2 relative" onClick={() => setNotificationsOpen(!notificationsOpen)} title={t('common.notifications')}>
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-profit-negative rounded-full text-[10px] flex items-center justify-center text-dark-500 font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
              <div className={clsx(menuPanel, 'right-0 w-80 max-h-[400px]')}>
                <div className="p-3 border-b border-dark-200 flex items-center justify-between">
                  <h3 className="font-medium text-gray-200">{t('common.notifications')}</h3>
                  {unreadCount > 0 && (
                    <button onClick={notifications.markAllAsRead} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                      <Check className="w-3 h-3" /> {t('common.all_read')}
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1">
                  {notifications.history.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm">{t('common.no_notifications')}</div>
                  )}
                  {notifications.history.map((item) => (
                    <div
                      key={item.id}
                      className={clsx('p-3 border-b border-dark-200 hover:bg-dark-400 group relative', !item.read && 'bg-primary-500/5')}
                      onClick={() => notifications.markAsRead(item.id)}
                    >
                      <div className="flex gap-3 pr-6">
                        <div
                          className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', {
                            'bg-profit-positive': item.type === 'success',
                            'bg-profit-negative': item.type === 'error',
                            'bg-primary-500': item.type === 'warning',
                            'bg-[#7aa7ff]': item.type === 'info',
                          })}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={clsx('text-sm font-medium', item.read ? 'text-gray-400' : 'text-gray-100')}>{item.title || 'Notification'}</p>
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.message}</p>
                          <p className="text-[10px] text-gray-500 mt-1">{formatDate(item.timestamp)}</p>
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); notifications.removeHistoryItem(item.id) }}
                          className="p-1 hover:bg-dark-200 rounded text-gray-400 hover:text-profit-negative"
                          title={t('common.delete')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {notifications.history.length > 0 && (
                  <div className="p-2 border-t border-dark-200 bg-dark-400/50">
                    <button onClick={notifications.clearHistory} className="w-full py-1.5 text-xs text-center text-gray-500 hover:text-gray-300 flex items-center justify-center gap-2">
                      <Trash2 className="w-3 h-3" /> {t('common.clear_all')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </TopNav>

      {!hideFilters && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-dark-200 bg-dark-500 px-6 py-2.5">
          <span className="text-[11px] uppercase tracking-[.06em] text-gray-500">{t('header.buy_in')}</span>
          <button type="button" className={clsx('pill', filters.buyIn === 'all' && 'active')} onClick={() => filters.setBuyIn('all')}>
            {t('dashboard.filters.all')} Buy-ins
          </button>
          {app.availableBuyIns.map((bi) => (
            <button key={bi} type="button" className={clsx('pill', filters.buyIn === bi.toString() && 'active')} onClick={() => filters.setBuyIn(bi.toString())}>
              {bi}€
            </button>
          ))}

          <span className="mx-1.5 h-[22px] w-px bg-dark-200" />

          <span className="text-[11px] uppercase tracking-[.06em] text-gray-500">{t('header.period')}</span>
          {mainDateFilters.map((f) => (
            <button key={f.id} type="button" className={clsx('pill', filters.dateRange === f.id && 'active')} onClick={() => { filters.setDateRange(f.id); setDateMenu(null) }}>
              {f.label}
            </button>
          ))}

          <div className="relative">
            <button type="button" className={clsx('pill', filters.dateRange === 'session' && 'active')} onClick={() => toggleDateMenu('session')}>
              {sessionLabel} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {dateMenu === 'session' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDateMenu(null)} />
                <div className={clsx(menuPanel, 'left-0 w-72')}>
                  <div className="p-1 max-h-72 overflow-y-auto">
                    {app.sessions.slice(0, RECENT_SESSIONS_SHOWN).map((session) => {
                      const selected = filters.selectedSession?.session_date === session.session_date
                      return (
                        <div
                          key={session.session_date}
                          className={clsx('px-3 py-2 text-sm cursor-pointer hover:bg-dark-400 rounded-md transition-colors mb-1', selected && 'bg-primary-500/10 border border-primary-500/30')}
                          onClick={() => { filters.setSelectedSession(session); setDateMenu(null) }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className={selected ? 'text-primary-400 font-medium' : 'text-gray-200'}>
                                {formatDate(session.session_date, { format: 'date-only' })}
                              </span>
                              <span className="text-xs text-gray-500">{formatTime(session.session_date)}→{formatTime(session.session_end)}</span>
                            </div>
                            <span className={clsx('font-mono font-medium text-xs', session.profit >= 0 ? 'text-profit-positive' : 'text-profit-negative')}>
                              {formatCurrency(session.profit)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500">
                            <div className="flex items-center gap-1"><Trophy className="w-3 h-3" /><span>{session.tournaments}</span></div>
                            <div className="flex items-center gap-1"><Hash className="w-3 h-3" /><span>{session.hands_played}</span></div>
                          </div>
                        </div>
                      )
                    })}
                    {app.sessions.length === 0 && (
                      <div className="text-center text-gray-500 text-xs italic py-4">{t('dashboard.no_sessions')}</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button type="button" className={clsx('pill', filters.dateRange === 'custom' && 'active')} onClick={() => toggleDateMenu('custom')}>
              {customLabel} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {dateMenu === 'custom' && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDateMenu(null)} />
                <div className={clsx(menuPanel, 'left-0 w-72 p-3 space-y-2')}>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{t('common.from')}</label>
                    <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-gray-200" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{t('common.to')}</label>
                    <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full bg-dark-400 border border-dark-200 rounded px-2 py-1 text-xs text-gray-200" />
                  </div>
                  <button
                    className="btn-primary w-full"
                    onClick={() => { filters.setCustomDateRange(customFrom || null, customTo || null); setDateMenu(null) }}
                  >
                    {t('common.apply')}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex-1" />

          <HudSwitch />
          <AutoImportIndicator />
        </div>
      )}
    </>
  )
}
