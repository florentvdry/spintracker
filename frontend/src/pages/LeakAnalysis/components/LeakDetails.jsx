import { X, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export default function LeakDetails({ leak, onClose }) {
  if (!leak) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-white">{leak.leak_type}</h4>
        <button onClick={onClose} className="btn-icon">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Severity badge */}
      <div className={clsx(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
        leak.severity === 'critical' && 'bg-red-500/20 text-red-400',
        leak.severity === 'major' && 'bg-yellow-500/20 text-yellow-400',
        leak.severity === 'minor' && 'bg-blue-500/20 text-blue-400'
      )}>
        {leak.severity.charAt(0).toUpperCase() + leak.severity.slice(1)}
      </div>

      {/* Description */}
      <div className="p-4 bg-dark-200 rounded-lg">
        <p className="text-gray-300">{leak.description}</p>
      </div>

      {/* Action comparison */}
      {(leak.expected_action || leak.actual_action) && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Comparaison des actions</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-400 mb-1">Action jouée</p>
              <p className="text-white font-medium">{leak.actual_action || '—'}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <div className="flex-1 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-xs text-green-400 mb-1">Action optimale</p>
              <p className="text-white font-medium">{leak.expected_action || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* EV Loss */}
      {leak.ev_loss > 0 && (
        <div className="p-4 bg-dark-200 rounded-lg text-center">
          <p className="text-sm text-gray-400 mb-1">Perte EV estimée</p>
          <p className="text-2xl font-bold text-red-400">
            -{leak.ev_loss.toFixed(2)}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button className="btn-secondary flex-1 text-sm">
          Voir la main
        </button>
        <button className="btn-primary flex-1 text-sm">
          Mains similaires
        </button>
      </div>
    </div>
  );
}
