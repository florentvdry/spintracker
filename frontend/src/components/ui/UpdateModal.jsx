import { useState, useEffect } from 'react';
import { X, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ipcService from '../../services/ipcService';

export default function UpdateModal() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('idle'); // idle, checking, available, downloading, downloaded, error
  const [version, setVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Listen for IPC messages
    const removeListener = ipcService.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          // Optional: show a small indicator or nothing
          break;
        case 'available':
          setStatus('available');
          setVersion(data.version);
          setReleaseNotes(data.releaseNotes || 'Bug fixes and improvements.');
          setIsVisible(true);
          break;
        case 'not-available':
          // Do nothing
          break;
        case 'downloading':
          setStatus('downloading');
          setProgress(data.progress.percent);
          break;
        case 'downloaded':
          setStatus('downloaded');
          setVersion(data.version);
          break;
        case 'error':
          setStatus('error');
          setError(data.error);
          break;
      }
    });

    return () => {
        if (removeListener) removeListener();
    };
  }, []);

  const handleDownload = () => {
    ipcService.downloadUpdate();
    setStatus('downloading');
  };

  const handleInstall = () => {
    ipcService.quitAndInstall();
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-400 border border-primary-500/30 rounded-xl p-6 w-[32rem] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary-400" />
            {status === 'available' && t('header.update_required')}
            {status === 'downloading' && t('common.loading')}
            {status === 'downloaded' && t('header.import_success')}
            {status === 'error' && t('common.error')}
          </h3>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-dark-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {status === 'available' && (
            <div className="space-y-4">
              <p className="text-gray-300">
                {t('header.new_version_available', 'A new version')} <span className="font-mono text-primary-400 font-bold">{version}</span> {t('header.is_available', 'is available.')}
              </p>
              <div className="bg-dark-300 rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-sm text-gray-400 font-medium mb-1">{t('common.details')}:</p>
                <div className="text-sm text-gray-300 whitespace-pre-wrap">
                  {typeof releaseNotes === 'string' ? releaseNotes : JSON.stringify(releaseNotes)}
                </div>
              </div>
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-2">
               <div className="progress-bar h-2 bg-dark-200 rounded-full overflow-hidden">
                <div 
                  className="bg-primary-500 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>{t('common.loading')}...</span>
                <span>{Math.round(progress)}%</span>
              </div>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="text-gray-300">
              {t('header.update_downloaded', 'Update {{version}} has been downloaded. Restart to apply.', { version })}
            </div>
          )}

          {status === 'error' && (
             <div className="flex items-start gap-3 text-red-400 bg-red-400/10 p-3 rounded-lg">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
             </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
            {status === 'available' && (
                <>
                    <button 
                        onClick={handleClose}
                        className="px-4 py-2 text-gray-400 hover:text-white hover:bg-dark-300 rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button 
                        onClick={handleDownload}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg flex items-center gap-2 transition-colors font-medium shadow-lg shadow-primary-900/20"
                    >
                        <Download className="w-4 h-4" />
                        {t('common.import', 'Download')}
                    </button>
                </>
            )}

            {status === 'downloaded' && (
                <>
                    <button 
                        onClick={handleClose}
                        className="px-4 py-2 text-gray-400 hover:text-white hover:bg-dark-300 rounded-lg transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button 
                        onClick={handleInstall}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center gap-2 transition-colors font-medium shadow-lg shadow-green-900/20"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {t('common.retry', 'Restart')}
                    </button>
                </>
            )}
             {status === 'error' && (
                 <button 
                    onClick={handleClose}
                    className="px-4 py-2 bg-dark-300 hover:bg-dark-200 text-white rounded-lg transition-colors"
                >
                    {t('common.cancel', 'Close')}
                </button>
             )}
        </div>
      </div>
    </div>
  );
}
