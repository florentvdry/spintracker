import clsx from 'clsx';

export default function Card({ 
  children, 
  className, 
  title, 
  subtitle,
  action,
  padding = true,
  flat = false,
  ...props 
}) {
  return (
    <div 
      className={clsx(
        flat ? 'card-flat' : 'card',
        !padding && 'p-0',
        className
      )}
      {...props}
    >
      {(title || action) && (
        <div className={clsx(
          'flex items-center justify-between',
          padding ? 'mb-4' : 'p-4 border-b border-dark-100/30'
        )}>
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
