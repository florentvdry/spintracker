import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdateStore } from '@/stores/updateStore'

export default function UpdateModal() {
  const { t } = useTranslation()
  const { isAvailable, isDownloading, isDownloaded, version, releaseNotes, progress, error, downloadUpdate, quitAndInstall } =
    useUpdateStore()
  const [userClosed, setUserClosed] = useState(false)

  // A new update re-opens the modal after the user dismissed an earlier one.
  useEffect(() => {
    if (isAvailable) setUserClosed(false)
  }, [isAvailable, version])

  if (!(isAvailable || isDownloaded) || userClosed) return null

  const primary = 'px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-onprimary rounded-lg font-semibold transition-colors'

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-400 rounded-lg p-8 w-[450px] shadow-xl border border-dark-200 animate-slide-up">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-primary-500/10 rounded-lg">
            <Download className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-100">{t('update.title')}</h3>
            <p className="text-gray-400 text-sm">{t('update.ready', { version })}</p>
          </div>
        </div>

        {releaseNotes && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{t('update.changelog')}</p>
            {/* Release notes come from the network: render as text, never as HTML. */}
            <div className="max-h-40 overflow-y-auto bg-dark-300/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {releaseNotes}
            </div>
          </div>
        )}

        {isDownloading && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">{t('update.downloading')}</span>
              <span className="text-primary-400 font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-dark-200 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-profit-negative/10 border border-profit-negative/20 rounded-lg text-profit-negative text-sm">{error}</div>
        )}

        <div className="flex gap-3 justify-end">
          {isDownloaded ? (
            <button onClick={() => void quitAndInstall()} className={primary}>{t('update.restart')}</button>
          ) : isDownloading ? (
            <button disabled className="px-6 py-2.5 bg-dark-200 text-gray-400 rounded-lg font-semibold cursor-not-allowed">{t('update.downloading')}</button>
          ) : (
            <>
              <button onClick={() => setUserClosed(true)} className="px-6 py-2.5 bg-dark-200 hover:bg-dark-100 text-gray-100 rounded-lg font-semibold transition-colors">{t('update.later')}</button>
              <button onClick={() => void downloadUpdate()} className={primary}>{t('update.download')}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
