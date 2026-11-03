import { useCallback, useEffect, useState } from 'react'
import { Check, Link as LinkIcon, Loader2, RefreshCw, Search, Trash2, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import RoomLogo from '@/components/common/RoomLogo'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { ipcService, type Json } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'

const MIN_SEARCH_LENGTH = 2
const LARGE_LIST_THRESHOLD = 50
const PLAYER_LIMIT = 1000
// Space needed above the button for the menu to open upwards.
const MENU_MIN_SPACE_ABOVE = 250
const MENU_OFFSET_LEFT = 150

interface MenuAnchor {
  player: Json
  top: number
  left: number
  openDown: boolean
}

export default function AliasManagement() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const aliases = useFilterStore((s) => s.aliases)
  const fetchAliases = useFilterStore((s) => s.fetchAliases)

  const [searchTerm, setSearchTerm] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newAliasName, setNewAliasName] = useState('')
  const [creating, setCreating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [availablePlayers, setAvailablePlayers] = useState<Json[]>([])
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const [aliasToDelete, setAliasToDelete] = useState<Json | null>(null)

  const loadPlayers = useCallback(async () => {
    try {
      const res = await ipcService.getPlayers({ limit: PLAYER_LIMIT })
      if (res.success) setAvailablePlayers(res.data)
    } catch (e) {
      console.error('Failed to load players for linking', e)
    }
  }, [])

  useEffect(() => {
    void fetchAliases()
    void loadPlayers()
  }, [fetchAliases, loadPlayers])

  const filteredPlayers =
    searchTerm.length < MIN_SEARCH_LENGTH
      ? []
      : availablePlayers.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const aliasName = (id: number | string) => aliases.find((a) => a.id === id)?.name ?? t('players.aliases.unknown_alias')

  const refresh = async () => {
    await fetchAliases()
    await loadPlayers()
  }

  /** Runs an alias mutation, reporting success or failure with a notification. */
  const mutate = async (action: () => Promise<{ success: boolean }>, ok: string, failed: string, after?: () => void) => {
    try {
      const res = await action()
      if (res.success) {
        await refresh()
        after?.()
        notify.success(ok)
      }
    } catch {
      notify.error(failed)
    }
  }

  const syncPlayers = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await ipcService.syncPlayers()
      if (res.success) {
        await loadPlayers()
        notify.success(t('players.aliases.synced'))
      }
    } catch {
      notify.error(t('players.aliases.sync_failed'))
    } finally {
      setSyncing(false)
    }
  }

  const createAlias = async () => {
    const name = newAliasName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await ipcService.createAlias({ name })
      if (res.success) {
        await fetchAliases()
        setShowCreate(false)
        setNewAliasName('')
        notify.success(t('players.aliases.created'))
      }
    } catch {
      notify.error(t('players.aliases.create_failed'))
    } finally {
      setCreating(false)
    }
  }

  const toggleMenu = (player: Json, button: HTMLElement) => {
    if (menu?.player.id === player.id) return setMenu(null)
    const rect = button.getBoundingClientRect()
    setMenu({ player, top: rect.top, left: rect.left, openDown: rect.top < MENU_MIN_SPACE_ABOVE })
  }

  const menuStyle = menu
    ? menu.openDown
      ? { top: menu.top + 32, left: menu.left - MENU_OFFSET_LEFT }
      : { bottom: window.innerHeight - menu.top + 8, left: menu.left - MENU_OFFSET_LEFT }
    : undefined

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-6 overflow-hidden">
        {/* Alias list */}
        <div className="flex flex-col bg-dark-200 rounded-lg border border-white/5 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/5 bg-dark-300/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-400" />
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">{t('players.aliases.title')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void syncPlayers()}
                disabled={syncing}
                className="px-3 py-1 bg-dark-400 hover:bg-dark-100 text-gray-400 rounded-lg text-xs font-medium transition-all border border-white/5 flex items-center gap-2"
                title={t('players.aliases.sync_hint', 'Repopulate player list from hands')}
              >
                <RefreshCw className={clsx('w-3 h-3', syncing && 'animate-spin')} />
                {syncing ? t('players.aliases.syncing', 'Syncing...') : t('players.aliases.sync', 'Sync players')}
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-all shadow-lg shadow-primary-500/20"
              >
                + {t('players.aliases.create')}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {aliases.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
                <div className="w-16 h-16 rounded-full bg-dark-300 flex items-center justify-center"><Users className="w-8 h-8 text-gray-500" /></div>
                <div>
                  <p className="text-gray-300 font-medium">{t('players.aliases.empty')}</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs">{t('players.aliases.empty_description')}</p>
                </div>
              </div>
            )}

            {aliases.map((alias) => (
              <div key={alias.id} className="bg-dark-300 rounded-lg border border-white/5 p-4 space-y-3 hover:border-primary-500/30 transition-all group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white tracking-tight">{alias.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 text-[10px] font-bold uppercase">
                      {alias.players.length} {t('common.players')}
                    </span>
                  </div>
                  <button
                    onClick={() => setAliasToDelete(alias)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-profit-negative hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {alias.players.map((p: Json) => (
                    <div key={p.id} className="flex items-center gap-2 bg-dark-400 border border-white/5 rounded-lg px-2 py-1">
                      <RoomLogo room={p.room} />
                      <span className="text-xs text-gray-300">{p.name}</span>
                      <button
                        onClick={() => void mutate(() => ipcService.unlinkPlayerFromAlias(p.id), t('players.aliases.unlinked'), t('players.aliases.unlink_failed'))}
                        className="text-gray-600 hover:text-profit-negative"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {alias.players.length === 0 && <div className="text-xs text-gray-600 italic py-1">{t('players.aliases.no_players')}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Link players */}
        <div className="flex flex-col bg-dark-200 rounded-lg border border-white/5 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/5 bg-dark-300/30">
            <div className="flex items-center gap-2 mb-3">
              <LinkIcon className="w-4 h-4 text-primary-400" />
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">{t('players.aliases.link_players')}</h2>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('players.aliases.search_players')}
                className="w-full bg-dark-400 border border-dark-100 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {searchTerm.length < MIN_SEARCH_LENGTH && availablePlayers.length > LARGE_LIST_THRESHOLD && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Search className="w-8 h-8 text-gray-700 mb-2" />
                <p className="text-sm text-gray-500">{t('players.aliases.search_hint')}</p>
              </div>
            )}

            {filteredPlayers.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-dark-300/50 transition-all">
                <div className="flex items-center gap-3">
                  <RoomLogo room={p.room} />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200">{p.name}</span>
                    <span className="text-[10px] text-gray-500">{p.total_hands} {t('common.hands')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.alias_id && (
                    <div className="px-2 py-0.5 rounded-lg bg-dark-400 text-[10px] text-gray-500 border border-white/5">
                      {t('players.aliases.linked_to', { name: aliasName(p.alias_id) })}
                    </div>
                  )}
                  <button
                    className="px-3 py-1 rounded-lg bg-primary-600/10 text-primary-400 text-xs font-medium hover:bg-primary-600 hover:text-white transition-all"
                    onClick={(e) => { e.stopPropagation(); toggleMenu(p, e.currentTarget) }}
                  >
                    {p.alias_id ? t('players.aliases.change_alias') : t('players.aliases.link')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick-link menu: fixed positioning avoids clipping by the scroll container */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setMenu(null)} />
          <div className="fixed w-48 bg-dark-300 border border-white/10 rounded-lg shadow-2xl z-[999] p-1 flex flex-col" style={menuStyle}>
            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('players.aliases.select_alias')}</div>
            <div className="max-h-48 overflow-y-auto">
              {aliases.map((alias) => (
                <div
                  key={alias.id}
                  className="px-3 py-2 text-xs text-gray-300 hover:bg-primary-500 hover:text-white rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() =>
                    void mutate(
                      () => ipcService.linkPlayerToAlias(menu.player.id, { aliasId: alias.id }),
                      t('players.aliases.linked'),
                      t('players.aliases.link_failed'),
                      () => setMenu(null),
                    )
                  }
                >
                  <span>{alias.name}</span>
                  {menu.player.alias_id === alias.id && <Check className="w-3 h-3" />}
                </div>
              ))}
            </div>
            {aliases.length === 0 && <div className="px-3 py-4 text-center text-[10px] text-gray-600">{t('players.aliases.no_aliases')}</div>}
            <div className="border-t border-white/5 mt-1 pt-1">
              <button onClick={() => setMenu(null)} className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-dark-400 rounded-lg">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-dark-200 rounded-lg shadow-2xl border border-white/10 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">{t('players.aliases.create_title')}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">{t('players.aliases.name_label')}</label>
                <input
                  type="text"
                  autoFocus
                  value={newAliasName}
                  onChange={(e) => setNewAliasName(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && void createAlias()}
                  placeholder={t('players.aliases.name_placeholder')}
                  className="w-full bg-dark-400 border border-dark-100 rounded-lg px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 bg-dark-300 hover:bg-dark-100 text-gray-300 rounded-lg text-sm font-medium transition-all">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => void createAlias()}
                  disabled={!newAliasName.trim() || creating}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-primary-500/20"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('players.aliases.create_button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!aliasToDelete}
        title={t('players.aliases.confirm_delete', { name: aliasToDelete?.name })}
        detail={t('players.aliases.confirm_delete_detail')}
        confirmLabel={t('common.delete')}
        onCancel={() => setAliasToDelete(null)}
        onConfirm={() => {
          const alias = aliasToDelete
          setAliasToDelete(null)
          if (alias) void mutate(() => ipcService.deleteAlias(alias.id), t('players.aliases.deleted'), t('players.aliases.delete_failed'))
        }}
      />
    </div>
  )
}
