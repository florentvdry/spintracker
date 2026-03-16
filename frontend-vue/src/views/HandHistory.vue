<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Historique des mains</h1>
      <p class="text-gray-400 mt-1">Parcourez vos mains jouées</p>
    </div>

    <div class="bg-dark-800 rounded-lg border border-dark-700 overflow-hidden">
      <table class="w-full">
        <thead class="bg-dark-700">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Buy-in</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Pot</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Résultat</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-700">
          <tr v-for="hand in hands" :key="hand.id" class="hover:bg-dark-700/50">
            <td class="px-4 py-3 text-gray-400">{{ hand.id }}</td>
            <td class="px-4 py-3 text-gray-300">{{ formatDate(hand.hand_datetime) }}</td>
            <td class="px-4 py-3 text-white">{{ hand.game_name || hand.game_type }}</td>
            <td class="px-4 py-3 text-gray-300">{{ hand.buy_in }}€</td>
            <td class="px-4 py-3 text-gray-300">{{ hand.total_pot }}</td>
            <td class="px-4 py-3" :class="hand.result?.includes('win') ? 'text-green-500' : 'text-gray-400'">
              {{ hand.result || '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="hands.length === 0 && !isLoading" class="text-center text-gray-500 py-8">
      Aucune main trouvée
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useHandsStore } from '../stores/hands'
import { useFilterStore } from '../stores/filter'

const handsStore = useHandsStore()
const filterStore = useFilterStore()

const hands = computed(() => handsStore.hands)
const isLoading = computed(() => handsStore.isLoading)

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  const { dateFrom, dateTo } = filterStore.getDateRangeParams
  handsStore.loadHands({
    hero_name: filterStore.heroName,
    date_from: dateFrom,
    date_to: dateTo,
    limit: 100
  })
})
</script>
