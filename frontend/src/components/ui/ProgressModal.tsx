import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { roomPercent, useProgressStore } from '@/stores/progressStore'

/** Progress dialog; an import also shows one bar per room with running hand and tournament counters. */
export default function ProgressModal() {
  const { t } = useTranslation()
  const { isVisible, title, message, progress, details } = useProgressStore()
  if (!isVisible) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-300 rounded-lg p-6 w-[28rem] max-w-full shadow-xl border border-dark-200">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">{title}</h3>
        <div className="mb-4 progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {details && (
          <>
            <div className="mb-3 flex gap-6 font-mono text-sm text-gray-100">
              <span>
                {details.hands.toLocaleString()} <span className="text-xs text-gray-500">{t('common.hands')}</span>
              </span>
              <span>
                {details.tournaments.toLocaleString()} <span className="text-xs text-gray-500">{t('common.tournaments')}</span>
              </span>
            </div>
            <div className="mb-3 space-y-2">
              {details.rooms.map((room) => (
                <div key={room.room}>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{room.room}</span>
                    <span className="font-mono">
                      {room.handsImported.toLocaleString()} / {room.totalHands.toLocaleString()} · {room.tournaments.toLocaleString()} {t('common.tournaments')}
                    </span>
                  </div>
                  <div className="mt-1 progress-bar">
                    <div className="progress-fill" style={{ width: `${roomPercent(room)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>,
    document.body,
  )
}
