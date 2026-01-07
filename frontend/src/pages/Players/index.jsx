import { useEffect, useState } from 'react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import { usePlayersStore } from '@stores/playersStore';
import { Card, EmptyState, LoadingSpinner } from '@components/ui';
import PlayersTable from './components/PlayersTable';
import PlayerDetails from './components/PlayerDetails';

export default function Players() {
  const { 
    players, 
    heroName,
    isLoading, 
    loadPlayers, 
    filters, 
    setFilters,
    selectedPlayer,
    selectPlayer,
    clearSelection
  } = usePlayersStore();
  
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    loadPlayers();
  }, []);

  const handleSearch = (e) => {
    setSearchValue(e.target.value);
    setFilters({ search: e.target.value });
  };

  const filteredPlayers = players.filter(player => 
    player.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Joueurs</h1>
          <p className="text-gray-400 mt-1">
            Statistiques des adversaires • Héro: <span className="text-primary-400">{heroName || '—'}</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card flat className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher un joueur..."
            value={searchValue}
            onChange={handleSearch}
            className="input pl-10"
          />
        </div>

        <select 
          className="select w-40"
          value={filters.sortBy}
          onChange={(e) => setFilters({ sortBy: e.target.value })}
        >
          <option value="hands">Par mains</option>
          <option value="profit">Par profit</option>
          <option value="name">Par nom</option>
          <option value="lastSeen">Par date</option>
        </select>

        <div className="flex items-center gap-2">
           <span className="text-sm text-gray-400">Min. Mains:</span>
           <input 
             type="number" 
             className="input w-20"
             value={filters.minHands || 0}
             onChange={(e) => {
               const val = parseInt(e.target.value) || 0;
               setFilters({ minHands: val });
               loadPlayers({ minHands: val });
             }}
           />
        </div>
      </Card>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Players table */}
        <div className="lg:col-span-2">
          <Card padding={false}>
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : filteredPlayers.length > 0 ? (
              <PlayersTable 
                players={filteredPlayers} 
                onSelect={selectPlayer}
                selectedId={selectedPlayer?.id}
              />
            ) : (
              <EmptyState
                title="Aucun joueur trouvé"
                description={searchValue ? 'Essayez une autre recherche' : 'Importez des mains pour voir les joueurs'}
              />
            )}
          </Card>
        </div>

        {/* Player details */}
        <div>
          <Card title="Détails du joueur">
            {selectedPlayer ? (
              <PlayerDetails player={selectedPlayer} onClose={clearSelection} />
            ) : (
              <p className="text-gray-400 text-center py-8">
                Sélectionnez un joueur pour voir ses statistiques
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
