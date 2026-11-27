import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipcService, type ImportRoomProgress } from '@/services/ipcService'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAppStore } from '@/stores/appStore'

const ROOM_COLOR: Record<string, string> = {
  Winamax: 'bg-rose-500',
  Unibet: 'bg-blue-500',
  Betclic: 'bg-emerald-500',
}

interface RoomRowProps {
  room: ImportRoomProgress
  color: string
}

function RoomRow({ room, color }: RoomRowProps) {
  const { t } = useTranslation()
  const percent = room.totalHands > 0 ? Math.round((room.handsImported / room.totalHands) * 100) : 0
  return (
    <div className="flex items-center gap-3 px-3 py-2 border border-dark-200 rounded-lg bg-dark-400/50">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="flex-shrink-0 font-medium text-gray-200">{room.room}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-gray-500">{t('import.files')} </span>
          <span className="text-[10px] text-gray-500">{room.filesProcessed}</span>
        </div>
        <div className="w-full bg-dark-400/30 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>
      <span className={`w-16 text-right text-xs font-mono ${percent >= 100 ? 'text-emerald-400' : 'text-gray-400'}`}>
        {percent}%
      </span>
    </div>
  )
}

export default function Import() {
  const { t } = useTranslation()
  const notify = useNotificationStore()
  const refreshAll = useAppStore((s) => s.refreshAll)

  const [rooms, setRooms] = useState<ImportRoomProgress[]>([])
  const [totalHands, setTotalHands] = useState(0)
  const [totalTournaments, setTotalTournaments] = useState(0)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const unsubscribeProgress = ipcService.onImportRoomProgress((progress) => {
      setRooms((current) =>
        current.map((r) =>
          r.room === progress.room
            ? { ...r, handsImported: progress.handsImported, percent: progress.percent, filesProcessed: progress.filesProcessed }
            : r,
        ),
      )
    })
    const unsubscribeDetected = ipcService.onImportRoomsDetected((payload) => {
      const detected = (payload?.rooms as Array<{ room: string; totalHands: number }> | undefined) ?? []
      setRooms(
        detected.map((r) => ({
          room: r.room,
          handsImported: 0,
          totalHands: r.totalHands || 0,
          percent: 0,
          filesProcessed: 0,
        })),
      )
      setImporting(true)
      setDone(false)
    })
    return () => {
      unsubscribeProgress()
      unsubscribeDetected()
    }
  }, [])

  const handleStart = useCallback(async () => {
    setRooms([])
    setTotalHands(0)
    setTotalTournaments(0)
    setDone(false)
    setImporting(false)
    try {
      const result = await ipcService.importHistoryRooms()
      setImporting(false)
      if (result.success) {
        setRooms(
          result.rooms.map((r) => ({
            room: r.room,
            handsImported: r.handsImported,
            totalHands: r.totalHands,
            percent: r.totalHands > 0 ? 100 : 0,
            filesProcessed: 0,
          })),
        )
        setTotalHands(result.totalHandsImported)
        setTotalTournaments(result.totalTournaments)
        setDone(true)
        if (result.totalHandsImported > 0) {
          void refreshAll()
        }
        notify.addNotification({
          type: 'success',
          title: t('header.import_success'),
          message: t('header.import_stats', {
            hands: result.totalHandsImported,
            skipped: 0,
            files: result.filesProcessed,
          }),
        })
      } else if (result.message !== 'Import cancelled') {
        notify.addNotification({ type: 'error', title: t('header.import_error'), message: result.message ?? '' })
      }
    } catch (error) {
      setImporting(false)
      notify.addNotification({
        type: 'error',
        title: t('common.error'),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }, [notify, refreshAll, t])

  return (
    <div className="px-6 py-8">
      <Card title={t('import.title')} subtitle={t('import.subtitle')}>
        <div className="space-y-3 text-xs text-gray-400">
          <p>{t('import.detection')}</p>
          <p>{t('import.idempotent')}</p>
        </div>
        <div className="mt-5 space-y-2">
          {rooms.map((room) => (
            <RoomRow key={room.room} room={room} color={ROOM_COLOR[room.room] ?? 'bg-primary-500'} />
          ))}
          {rooms.length === 0 && !importing && <p className="text-gray-500">{t('import.no_rooms')}</p>}
        </div>
        <div className="mt-6 border-t border-dark-200 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">{t('import.hands_imported')}</span>
            <div className="text-2xl font-mono font-bold text-gray-200">{totalHands}</div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500">{t('import.tournaments')}</span>
            <div className="text-2xl font-mono font-bold text-gray-200">{totalTournaments}</div>
          </div>
          {done && (
            <span className="text-xs text-emerald-400">{t('import.done')}</span>
          )}
        </div>
      </Card>
      <button
        disabled={importing}
        onClick={handleStart}
        className="mt-6 w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {importing ? (
          <>
            <Loader className="w-4 h-4 animate-spin" /> {t('import.importing')}
          </>
        ) : (
          <>
            <Check className="w-4 h-4" /> {t('import.start')}
          </>
        )}
      </button>
    </div>
  )
}
