import { useTranslation } from 'react-i18next';

export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4 border',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-2',
    xl: 'w-16 h-16 border-3',
  };

  return (
    <div className={`${sizes[size]} border-primary-500/30 border-t-primary-500 rounded-full animate-spin ${className}`} />
  );
}

export function LoadingOverlay({ message = 'Chargement...' }) {
  return (
    <div className="absolute inset-0 bg-dark-500/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-gray-400">{message}</p>
    </div>
  );
}

export function LoadingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20">
      <LoadingSpinner size="xl" />
      <p className="mt-6 text-gray-400">{t('common.loading')}</p>
    </div>
  );
}
