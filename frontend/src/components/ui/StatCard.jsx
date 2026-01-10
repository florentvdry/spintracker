import clsx from 'clsx';

export default function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend,
  trendValue,
  format = 'default',
  unit,
  className,
  subStats = [] // Array of { label, value, format }
}) {
  const formattedValue = formatValue(value, format);
  const isPositive = trend === 'up' || (typeof value === 'number' && value >= 0);

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="stat-label">{label}</p>
          {value !== null && value !== undefined && (
            <div className="flex items-baseline gap-2 mt-1">
              <p className={clsx(
                'stat-value',
                format === 'profit' && (isPositive ? 'profit-positive' : 'profit-negative')
              )}>
                {formattedValue}
              </p>
              {unit && (
                <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">
                  {unit}
                </span>
              )}
            </div>
          )}
          
          {subStats.length > 0 && (
            <div className={clsx(
              "space-y-1",
              (value !== null && value !== undefined) ? "mt-3 pt-3 border-t border-white/5" : "mt-2"
            )}>
              {subStats.map((stat, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">{stat.label}</span>
                  <span className="text-gray-200 font-mono">
                    {formatValue(stat.value, stat.format)}
                  </span>
                </div>
              ))}
            </div>
          )}

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
          <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0 ml-3">
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
