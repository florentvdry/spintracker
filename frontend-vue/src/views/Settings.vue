<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Paramètres</h1>
      <p class="text-gray-400 mt-1">Configurez l'application</p>
    </div>

    <div class="grid grid-cols-1 gap-6">
      <div class="bg-dark-800 rounded-lg p-6 border border-dark-700">
        <h3 class="text-lg font-semibold mb-4">Backend</h3>
        
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <div>
              <div class="text-white">Statut de connexion</div>
              <div class="text-sm text-gray-400">Backend Python FastAPI</div>
            </div>
            <span :class="isConnected ? 'text-green-500' : 'text-red-500'">
              {{ isConnected ? 'Connecté' : 'Déconnecté' }}
            </span>
          </div>

          <div class="flex justify-between items-center">
            <div>
              <div class="text-white">URL du serveur</div>
              <div class="text-sm text-gray-400">http://localhost:5050</div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-dark-800 rounded-lg p-6 border border-dark-700">
        <h3 class="text-lg font-semibold mb-4">Base de données</h3>
        
        <div class="space-y-4">
          <button
            @click="resetDatabase"
            :disabled="isResetting"
            class="bg-red-600 hover:bg-red-500 disabled:bg-dark-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {{ isResetting ? 'Réinitialisation...' : 'Réinitialiser la base de données' }}
          </button>
          
          <p class="text-sm text-gray-500">
            Cette action supprimera toutes les données importées.
          </p>
        </div>
      </div>

      <div class="bg-dark-800 rounded-lg p-6 border border-dark-700">
        <h3 class="text-lg font-semibold mb-4">À propos</h3>
        
        <div class="space-y-2 text-gray-400">
          <p>SpinTracker - Frontend VueJS</p>
          <p>Backend: Python FastAPI</p>
          <p>Version: 1.0.0</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiService } from '../services/api'

const isConnected = ref(false)
const isResetting = ref(false)

async function checkConnection() {
  try {
    await apiService.checkHealth()
    isConnected.value = true
  } catch (e) {
    isConnected.value = false
  }
}

async function resetDatabase() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser la base de données ?')) {
    return
  }

  isResetting.value = true
  try {
    await apiService.resetDatabase()
    alert('Base de données réinitialisée')
  } catch (e) {
    alert('Erreur: ' + e.message)
  } finally {
    isResetting.value = false
  }
}

onMounted(() => {
  checkConnection()
})
</script>
