<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Calculateur d'équité</h1>
      <p class="text-gray-400 mt-1">Calculez l'équité de votre main</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-dark-800 rounded-lg p-6 border border-dark-700 space-y-4">
        <h3 class="text-lg font-semibold">Cartes</h3>
        
        <div>
          <label class="block text-sm text-gray-400 mb-2">Main du héros (ex: Ah Kh)</label>
          <input
            v-model="heroCards"
            type="text"
            placeholder="Ex: Ah Kh"
            class="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-2">Adversaire 1 (ex: 7s 7d)</label>
          <input
            v-model="villainCards"
            type="text"
            placeholder="Ex: 7s 7d"
            class="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-2">Adversaire 2 (optionnel)</label>
          <input
            v-model="villain2Cards"
            type="text"
            placeholder="Ex: Jc Tc"
            class="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-2">Board (optionnel)</label>
          <input
            v-model="board"
            type="text"
            placeholder="Ex: Ad 7s 2c Kd 4h"
            class="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <button
          @click="calculateEquity"
          :disabled="isCalculating"
          class="w-full bg-primary-600 hover:bg-primary-500 disabled:bg-dark-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {{ isCalculating ? 'Calcul en cours...' : 'Calculer' }}
        </button>
      </div>

      <div class="bg-dark-800 rounded-lg p-6 border border-dark-700">
        <h3 class="text-lg font-semibold mb-4">Résultat</h3>
        
        <div v-if="error" class="text-red-500">
          {{ error }}
        </div>
        
        <div v-else-if="result" class="space-y-4">
          <div class="text-center">
            <div class="text-4xl font-bold text-primary-400">
              {{ (result.hero_equity * 100).toFixed(2) }}%
            </div>
            <div class="text-gray-400 mt-1">Équité du héros</div>
          </div>

          <div class="space-y-2 mt-4">
            <div v-if="result.villain_equity" class="flex justify-between">
              <span class="text-gray-400">Adversaire 1</span>
              <span class="text-white">{{ (result.villain_equity * 100).toFixed(2) }}%</span>
            </div>
            <div v-if="result.villain2_equity" class="flex justify-between">
              <span class="text-gray-400">Adversaire 2</span>
              <span class="text-white">{{ (result.villain2_equity * 100).toFixed(2) }}%</span>
            </div>
            <div v-if="result.tie_equity" class="flex justify-between">
              <span class="text-gray-400">Split</span>
              <span class="text-white">{{ (result.tie_equity * 100).toFixed(2) }}%</span>
            </div>
          </div>

          <div class="pt-4 border-t border-dark-700">
            <div class="text-xs text-gray-500">
              Méthode: Énumération exacte
            </div>
          </div>
        </div>

        <div v-else class="text-gray-500 text-center py-8">
          Entrez vos cartes et cliquez sur calculer
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { apiService } from '../services/api'

const heroCards = ref('')
const villainCards = ref('')
const villain2Cards = ref('')
const board = ref('')
const isCalculating = ref(false)
const result = ref(null)
const error = ref(null)

async function calculateEquity() {
  if (!heroCards.value || !villainCards.value) {
    error.value = 'Veuillez entrer au moins la main du héros et un adversaire'
    return
  }

  isCalculating.value = true
  error.value = null
  result.value = null

  try {
    const response = await apiService.calculateEquity({
      hero_cards: heroCards.value,
      villain_cards: villainCards.value,
      villain2_cards: villain2Cards.value || null,
      board: board.value || '',
      iterations: 1000
    })
    result.value = response.data
  } catch (e) {
    error.value = e.response?.data?.detail || e.message
  } finally {
    isCalculating.value = false
  }
}
</script>
