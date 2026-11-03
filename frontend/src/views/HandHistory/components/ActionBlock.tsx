const AUTOMATIC_ACTIONS = ['posts sb', 'posts bb', 'ante', 'dealing', 'collected', 'uncalled bet', 'returned']

interface ActionBlockProps {
  title: string
  content?: string | null
}

/** Shows a street's actions, hiding blinds, antes and other automatic lines. */
export default function ActionBlock({ title, content }: ActionBlockProps) {
  const visible = (content ?? '')
    .split('\n')
    .filter((line) => {
      const text = line.toLowerCase()
      return text.trim() && !AUTOMATIC_ACTIONS.some((auto) => text.includes(auto))
    })
    .join('\n')

  if (!visible.trim()) return null

  return (
    <div className="p-3 bg-dark-200 rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-sm text-gray-300 whitespace-pre-line">{visible}</p>
    </div>
  )
}
