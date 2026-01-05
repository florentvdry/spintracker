import clsx from 'clsx';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  major: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
  },
  minor: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
};

export default function LeaksList({ leaks, onSelect, selectedId }) {
  return (
    <div className="divide-y divide-dark-100/30 max-h-[600px] overflow-y-auto">
      {leaks.map((leak) => {
        const config = severityConfig[leak.severity] || severityConfig.minor;
        const Icon = config.icon;
        const isSelected = leak.id === selectedId;

        return (
          <div
            key={leak.id}
            onClick={() => onSelect(leak)}
            className={clsx(
              'p-4 cursor-pointer transition-colors hover:bg-dark-200',
              isSelected && 'bg-dark-200'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                config.bg
              )}>
                <Icon className={clsx('w-4 h-4', config.color)} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white">{leak.leak_type}</span>
                  <span className={clsx(
                    'badge',
                    config.bg,
                    config.color
                  )}>
                    {leak.severity}
                  </span>
                </div>
                
                <p className="text-sm text-gray-400 line-clamp-2">
                  {leak.description}
                </p>
                
                {leak.ev_loss > 0 && (
                  <p className="text-sm text-red-400 mt-1">
                    Perte EV: -{leak.ev_loss.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
