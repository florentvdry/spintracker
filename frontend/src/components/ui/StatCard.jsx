import clsx from 'clsx';

export default function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend,
  trendValue,
  format = 'default',
  className 
}) {
  const formattedValue = formatValue(value, format);
  const isPositive = trend === 'up' || (typeof value === 'number' && value >= 0);

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className={clsx(
            'stat-value mt-1',
            format === 'profit' && (isPositive ? 'profit-positive' : 'profit-negative')
          )}>
            {formattedValue}
          </p>
          {trendValue && (
            <p className={clsx(
              'text-xs mt-1',
              trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'
            )}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-400" />
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '—';
  
  switch (format) {
    case 'number':
      return new Intl.NumberFormat('fr-FR').format(value);
    case 'profit':
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toFixed(2)}€`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'currency':
      return `${value.toFixed(2)}€`;
    default:
      return String(value);
  }
}
