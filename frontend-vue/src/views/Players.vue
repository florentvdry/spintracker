<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Joueurs</h1>
      <p class="text-gray-400 mt-1">Liste des joueurs rencontrés</p>
    </div>

    <div class="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
      <table class="w-full">
        <thead class="bg-dark-700">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Nom</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Régulier</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-700">
          <tr v-for="player in players" :key="player.id" class="hover:bg-dark-700/50">
            <td class="px-4 py-3 text-gray-400">{{ player.id }}</td>
            <td class="px-4 py-3 text-white font-medium">{{ player.name }}</td>
            <td class="px-4 py-3">
              <span :class="player.is_reg ? 'text-green-500' : 'text-gray-500'">
                {{ player.is_reg ? 'Oui' : 'Non' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <button
                @click="toggleReg(player)"
                class="text-primary-400 hover:text-primary-300"
              >
                {{ player.is_reg ? 'Retirer reg' : 'Ajouter reg' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="players.length === 0 && !isLoading" class="text-center text-gray-500 py-8">
      Aucun joueur trouvé
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { usePlayersStore } from '../stores/players'

const playersStore = usePlayersStore()

const players = computed(() => playersStore.players)
const isLoading = computed(() => playersStore.isLoading)

async function toggleReg(player) {
  await playersStore.updatePlayerRegStatus(player.id, !player.is_reg)
}

onMounted(() => {
  playersStore.loadPlayers({ limit: 100 })
})
</script>
