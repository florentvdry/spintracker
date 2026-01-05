import { X } from 'lucide-react';
import { useProgressStore } from '@stores/progressStore';

export default function ProgressModal() {
  const { isVisible, title, message, progress, canCancel, cancel } = useProgressStore();

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-400 border border-primary-500/30 rounded-xl p-6 w-96 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {canCancel && (
            <button
              onClick={cancel}
              className="p-1 hover:bg-dark-200 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">{message}</span>
          <span className="text-primary-400 font-medium">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
}
