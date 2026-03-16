<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Tournois</h1>
      <p class="text-gray-400 mt-1">Historique des tournois</p>
    </div>

    <div class="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
      <table class="w-full">
        <thead class="bg-dark-700">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Buy-in</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Joueurs</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Profit</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-700">
          <tr v-for="tournament in tournaments" :key="tournament.id" class="hover:bg-dark-700/50">
            <td class="px-4 py-3 text-gray-400">{{ tournament.id }}</td>
            <td class="px-4 py-3 text-white">{{ tournament.game_name || tournament.game_type }}</td>
            <td class="px-4 py-3 text-gray-300">{{ tournament.buy_in }}€</td>
            <td class="px-4 py-3 text-gray-300">{{ tournament.players_count }}</td>
            <td class="px-4 py-3" :class="tournament.net_profit >= 0 ? 'text-green-500' : 'text-red-500'">
              {{ tournament.net_profit >= 0 ? '+' : '' }}{{ tournament.net_profit }}
            </td>
            <td class="px-4 py-3 text-gray-400">
              {{ formatDate(tournament.start_time) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="tournaments.length === 0 && !isLoading" class="text-center text-gray-500 py-8">
      Aucun tournoi trouvé
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTournamentsStore } from '../stores/tournaments'

const tournamentsStore = useTournamentsStore()

const tournaments = computed(() => tournamentsStore.tournaments)
const isLoading = computed(() => tournamentsStore.isLoading)

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR')
}

onMounted(() => {
  tournamentsStore.loadTournaments(50)
})
</script>
