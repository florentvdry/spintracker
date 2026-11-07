import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import logo from '@/assets/logo.png'

/** Application bar: logo, page tabs, then the actions passed as children (hero, import, ...). */
export default function TopNav({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  const navigation = [
    { name: t('navigation.dashboard'), href: '/' },
    { name: t('navigation.history'), href: '/hands' },
    { name: t('navigation.stats'), href: '/stats' },
    { name: t('navigation.ranges'), href: '/ranges' },
    { name: t('navigation.charts'), href: '/charts' },
    { name: t('navigation.players'), href: '/players' },
    { name: t('navigation.hud'), href: '/hud' },
  ]

  return (
    <header className="h-14 shrink-0 flex items-center gap-6 px-6 bg-dark-600">
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="SpinTracker" className="w-6 h-6 object-contain" />
        <span className="font-semibold text-[15px] text-gray-100">SpinTracker</span>
      </div>

      <nav className="flex h-full min-w-0">
        {navigation.map((item) => (
          <Link key={item.href} to={item.href} className={clsx('nav-item', pathname === item.href && 'active')}>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2">{children}</div>

      <Link
        to="/settings"
        className={clsx('btn-icon p-2', pathname === '/settings' && 'text-primary-400')}
        title={t('navigation.settings')}
        aria-label={t('navigation.settings')}
      >
        <SlidersHorizontal className="w-[18px] h-[18px]" />
      </Link>
    </header>
  )
}
