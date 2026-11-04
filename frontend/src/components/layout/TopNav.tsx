import { Link, useLocation } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import logo from '@/assets/logo.png'

export default function TopNav() {
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
    <header className="h-11 shrink-0 flex items-center gap-6 px-5 bg-dark-400 border-b border-dark-200">
      <div className="flex items-center gap-2">
        <img src={logo} alt="SpinTracker" className="w-5 h-5 object-contain" />
        <span className="font-semibold text-sm text-gray-100">SpinTracker</span>
      </div>

      <nav className="flex h-full gap-0.5">
        {navigation.map((item) => (
          <Link key={item.href} to={item.href} className={clsx('nav-item', pathname === item.href && 'active')}>
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <Link to="/settings" className={clsx('btn-icon', pathname === '/settings' && 'text-primary-400')} title={t('navigation.settings')}>
        <Settings className="w-4 h-4" />
      </Link>
    </header>
  )
}
