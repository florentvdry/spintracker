import type { ComponentType, ReactNode } from 'react'

interface SettingRowProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  children?: ReactNode
}

export default function SettingRow({ icon: Icon, title, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-dark-100/30 last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <p className="text-white font-medium">{title}</p>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
