import winamaxLogo from '@/assets/rooms/winamax.png'
import unibetLogo from '@/assets/rooms/unibet.png'
import betclicLogo from '@/assets/rooms/betclic.png'

const ROOMS: { match: string[]; name: string; logo: string }[] = [
  { match: ['winamax', 'w'], name: 'Winamax', logo: winamaxLogo },
  { match: ['unibet', 'u'], name: 'Unibet', logo: unibetLogo },
  { match: ['betclic', 'b'], name: 'Betclic', logo: betclicLogo },
]

function findRoom(room: string) {
  const key = room.toLowerCase()
  // Full names are matched by substring (e.g. "Winamax Poker"), single letters exactly.
  return ROOMS.find((r) => r.match.some((m) => (m.length === 1 ? key === m : key.includes(m))))
}

export default function RoomLogo({ room }: { room?: string | null }) {
  if (!room) return <div className="w-6 h-6" />
  const found = findRoom(room)
  const name = found?.name ?? room

  return (
    <div className="w-6 h-6 flex items-center justify-center" title={name}>
      {found && <img src={found.logo} alt={name} className="w-full h-full object-contain" />}
    </div>
  )
}
