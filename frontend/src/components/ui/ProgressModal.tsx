import { createPortal } from 'react-dom'
import { useProgressStore } from '@/stores/progressStore'

export default function ProgressModal() {
  const { isVisible, title, message, progress } = useProgressStore()
  if (!isVisible) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-dark-300 rounded-lg p-6 w-96 shadow-2xl border border-dark-100/30">
        <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
        <div className="mb-4 progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>,
    document.body,
  )
}
