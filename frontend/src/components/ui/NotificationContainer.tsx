import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useNotificationStore } from '@/stores/notificationStore'

const BORDER = { success: 'border-green-500/30', error: 'border-red-500/30', warning: 'border-yellow-500/30', info: 'border-blue-500/30' }
const DOT = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' }

export default function NotificationContainer() {
  const notifications = useNotificationStore((s) => s.notifications)
  const remove = useNotificationStore((s) => s.removeNotification)

  return createPortal(
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((n) => (
        <div key={n.id} className={clsx('flex items-start gap-3 p-4 rounded-lg shadow-xl max-w-sm animate-slide-up bg-dark-300 border', BORDER[n.type])}>
          <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', DOT[n.type])} />
          <div className="flex-1 min-w-0">
            {n.title && <p className="text-sm font-medium text-gray-100">{n.title}</p>}
            <p className={clsx('text-sm text-gray-300', n.title && 'mt-1')}>{n.message}</p>
          </div>
          <button onClick={() => remove(n.id)} className="text-gray-400 hover:text-white flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
