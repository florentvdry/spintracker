import { InboxIcon } from 'lucide-react';

export default function EmptyState({ 
  icon: Icon = InboxIcon,
  title = 'Aucune donnée',
  description = 'Importez des mains pour commencer.',
  action
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-dark-200 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-500" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-gray-400 max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
