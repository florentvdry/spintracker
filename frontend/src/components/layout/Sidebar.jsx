import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  AlertTriangle, 
  Grid3X3, 
  Settings,
  TrendingUp,
  Database
} from 'lucide-react';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Joueurs', href: '/players', icon: Users },
  { name: 'Historique', href: '/hands', icon: History },
  { name: 'Analyse Leaks', href: '/leaks', icon: AlertTriangle },
  { name: 'Ranges', href: '/ranges', icon: Grid3X3 },
  { name: 'Paramètres', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-64 bg-dark-400 border-r border-dark-100/30 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-dark-100/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-dark-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Poker Tracker</h1>
            <span className="text-xs text-gray-500">Pro Edition</span>
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
              key={item.name}
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
          <span>SQLite Local</span>
        </div>
      </div>
    </aside>
  );
}
