import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  AlertTriangle, 
  Grid3X3, 
  Settings,
  Database,
  BarChart2,
  Hammer
} from 'lucide-react';
import clsx from 'clsx';
import logo from '../../assets/logo.png';

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();

  const navigation = [
    { name: t('navigation.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('navigation.history'), href: '/hands', icon: History },
    { name: t('navigation.ranges'), href: '/ranges', icon: Grid3X3 },
    { name: t('navigation.settings'), href: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-dark-400 border-r border-dark-100/30 flex flex-col">
      {/* Logo */}
      <div className="h-50 flex items-center px-6 border-b border-dark-100/30">
        <div className="flex items-center gap-3">
          <img src={logo} alt="SpinTracker" className="w-24 h-24 object-contain py-2" />
          <div>
            <h1 className="text-xl font-bold gradient-text">SpinTracker</h1>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          const Icon = item.icon;
          
          return (
            <NavLink
              key={item.href}
              to={item.href}
              className={clsx(
                'nav-item',
                isActive && 'active'
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-100/30">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Database className="w-4 h-4" />
          <span>{t('sidebar.sqlite_local')}</span>
        </div>
      </div>
    </aside>
  );
}
