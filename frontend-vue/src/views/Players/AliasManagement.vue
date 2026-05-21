<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-6 overflow-hidden">
      <!-- Left: Alias List -->
      <div class="flex flex-col bg-dark-200 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        <div class="p-4 border-b border-white/5 bg-dark-300/30 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Users class="w-4 h-4 text-primary-400" />
            <h2 class="text-sm font-bold text-gray-200 uppercase tracking-widest">{{ $t('players.aliases.title') || 'Alias List' }}</h2>
          </div>
          <div class="flex items-center gap-2">
            <button 
              @click="syncPlayers"
              :disabled="syncing"
              class="px-3 py-1 bg-dark-400 hover:bg-dark-100 text-gray-400 rounded-lg text-xs font-medium transition-all border border-white/5 flex items-center gap-2"
              :title="$t('players.aliases.sync_hint') || 'Repopulate player list from hands'"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': syncing }" />
              {{ syncing ? ($t('common.processing') || 'Syncing...') : ($t('players.aliases.sync') || 'Sync Players') }}
            </button>
            <button 
              @click="showCreateModal = true"
              class="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-all shadow-lg shadow-primary-500/20"
            >
              + {{ $t('players.aliases.create') || 'New Alias' }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div v-if="filterStore.aliases.length === 0" class="flex flex-col items-center justify-center h-full text-center space-y-4 p-8">
            <div class="w-16 h-16 rounded-full bg-dark-300 flex items-center justify-center">
              <Users class="w-8 h-8 text-gray-500" />
            </div>
            <div>
              <p class="text-gray-300 font-medium">{{ $t('players.aliases.empty') || 'No aliases yet' }}</p>
              <p class="text-xs text-gray-500 mt-1 max-w-xs">
                {{ $t('players.aliases.empty_description') || 'Create an alias to group multiple player screen names together.' }}
              </p>
            </div>
          </div>

          <div 
            v-for="alias in filterStore.aliases" 
            :key="alias.id"
            class="bg-dark-300 rounded-xl border border-white/5 p-4 space-y-3 hover:border-primary-500/30 transition-all group"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold text-white tracking-tight">{{ alias.name }}</span>
                <span class="px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 text-[10px] font-bold uppercase">
                  {{ alias.players.length }} {{ $t('common.players') || 'Players' }}
                </span>
              </div>
              <button 
                @click="deleteAlias(alias)"
                class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                :title="$t('common.delete')"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>

            <div class="flex flex-wrap gap-2">
              <div 
                v-for="p in alias.players" 
                :key="p.id"
                class="flex items-center gap-2 bg-dark-400 border border-white/5 rounded-lg px-2 py-1 group/player"
              >
                <RoomLogo :room="p.room" class="w-4 h-4" />
                <span class="text-xs text-gray-300">{{ p.name }}</span>
                <button 
                  @click="unlinkPlayer(p.id)"
                  class="text-gray-600 hover:text-red-400"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
              <div v-if="alias.players.length === 0" class="text-xs text-gray-600 italic py-1">
                {{ $t('players.aliases.no_players') || 'No players linked yet' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Link Players -->
      <div class="flex flex-col bg-dark-200 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        <div class="p-4 border-b border-white/5 bg-dark-300/30">
          <div class="flex items-center gap-2 mb-3">
            <LinkIcon class="w-4 h-4 text-primary-400" />
            <h2 class="text-sm font-bold text-gray-200 uppercase tracking-widest">{{ $t('players.aliases.link_players') || 'Link Players' }}</h2>
          </div>
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              v-model="searchTerm"
              :placeholder="$t('players.aliases.search_players') || 'Search players to link...'"
              class="w-full bg-dark-400 border border-dark-100 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <div v-if="searchTerm.length < 2 && availablePlayers.length > 50" class="flex flex-col items-center justify-center h-full text-center p-8">
            <Search class="w-8 h-8 text-gray-700 mb-2" />
            <p class="text-sm text-gray-500">{{ $t('players.aliases.search_hint') || 'Type at least 2 characters to search' }}</p>
          </div>
          
          <div 
            v-for="p in filteredPlayers" 
            :key="p.id"
            class="flex items-center justify-between p-3 rounded-xl hover:bg-dark-300/50 group transition-all"
          >
            <div class="flex items-center gap-3">
              <RoomLogo :room="p.room" />
              <div class="flex flex-col">
                <span class="text-sm font-medium text-gray-200">{{ p.name }}</span>
                <span class="text-[10px] text-gray-500">{{ p.total_hands }} hands</span>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <div v-if="p.alias_id" class="px-2 py-0.5 rounded-lg bg-dark-400 text-[10px] text-gray-500 border border-white/5">
                Linked to {{ getAliasName(p.alias_id) }}
              </div>
              <div class="relative">
                <button 
                  :id="'btn-link-' + p.id"
                  class="px-3 py-1 rounded-lg bg-primary-600/10 text-primary-400 text-xs font-medium hover:bg-primary-600 hover:text-white transition-all"
                  @click.stop="toggleQuickLink(p)"
                >
                  {{ p.alias_id ? $t('players.aliases.change_alias') || 'Change' : $t('players.aliases.link') || 'Link' }}
                </button>
                
                <!-- Quick Link Menu (Fixed Positioning to avoid clipping) -->
                <div 
                  v-if="selectedPlayerToLink?.id === p.id" 
                  ref="dropdownMenu"
                  class="fixed w-48 bg-dark-300 border border-white/10 rounded-xl shadow-2xl z-[999] p-1 flex flex-col animate-in fade-in duration-200"
                  :style="dropdownStyle"
                >
                  <div class="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Select Alias</div>
                  <div class="max-h-48 overflow-y-auto custom-scrollbar">
                    <div 
                      v-for="alias in filterStore.aliases"
                      :key="alias.id"
                      class="px-3 py-2 text-xs text-gray-300 hover:bg-primary-500 hover:text-white rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                      @click="linkPlayer(p.id, alias.id)"
                    >
                      <span>{{ alias.name }}</span>
                      <Check v-if="p.alias_id === alias.id" class="w-3 h-3" />
                    </div>
                  </div>
                  <div v-if="filterStore.aliases.length === 0" class="px-3 py-4 text-center text-[10px] text-gray-600">
                    No aliases found
                  </div>
                  <div class="border-t border-white/5 mt-1 pt-1">
                    <button 
                      @click="selectedPlayerToLink = null"
                      class="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-dark-400 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Alias Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" @click.self="showCreateModal = false">
      <div class="bg-dark-200 rounded-2xl shadow-2xl border border-white/10 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
        <h3 class="text-xl font-bold text-white mb-4">Create New Alias</h3>
        <div class="space-y-4">
          <div>
            <label class="text-xs text-gray-400 block mb-1">Alias Name</label>
            <input 
              type="text" 
              v-model="newAliasName"
              placeholder="e.g. My Global Hero"
              class="w-full bg-dark-400 border border-dark-100 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-primary-500"
              @keyup.enter="createAlias"
              autofocus
            />
          </div>
          <div class="flex gap-3 pt-2">
            <button 
              @click="showCreateModal = false"
              class="flex-1 px-4 py-2 bg-dark-300 hover:bg-dark-100 text-gray-300 rounded-xl text-sm font-medium transition-all"
            >
              Cancel
            </button>
            <button 
              @click="createAlias"
              :disabled="!newAliasName.trim() || creating"
              class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-primary-500/20"
            >
              <Loader2 v-if="creating" class="w-4 h-4 animate-spin mx-auto" />
              <span v-else>Create Alias</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Users, Search, Trash2, X, Link as LinkIcon, Check, Loader2 } from 'lucide-vue-next'
import { useFilterStore } from '@/stores/filterStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { ipcService } from '@/services/ipcService'
import RoomLogo from '@/components/common/RoomLogo.vue'

const filterStore = useFilterStore()
const notificationStore = useNotificationStore()

const searchTerm = ref('')
const showCreateModal = ref(false)
const newAliasName = ref('')
const creating = ref(false)
const syncing = ref(false)
const availablePlayers = ref([])
const selectedPlayerToLink = ref(null)
const dropdownPosition = ref('top')
const dropdownCoords = ref({ top: 0, left: 0 })

const dropdownStyle = computed(() => {
  if (dropdownPosition.value === 'top') {
    return {
      bottom: `${window.innerHeight - dropdownCoords.value.top + 8}px`,
      left: `${dropdownCoords.value.left - 150}px` // Offset to align right
    }
  } else {
    return {
      top: `${dropdownCoords.value.top + 32}px`,
      left: `${dropdownCoords.value.left - 150}px`
    }
  }
})

const filteredPlayers = computed(() => {
  if (searchTerm.value.length < 2) return []
  return availablePlayers.value.filter(p => 
    p.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

const toggleQuickLink = (player) => {
  if (selectedPlayerToLink.value?.id === player.id) {
    selectedPlayerToLink.value = null
    return
  }
  
  selectedPlayerToLink.value = player
  
  // Calculate position
  nextTick(() => {
    const btn = document.getElementById(`btn-link-${player.id}`)
    if (btn) {
      const rect = btn.getBoundingClientRect()
      dropdownCoords.value = { top: rect.top, left: rect.left }
      // If there's less than 250px above, open downwards
      dropdownPosition.value = rect.top < 250 ? 'bottom' : 'top'
    }
  })
}

const syncPlayers = async () => {
  if (syncing.value) return
  syncing.value = true
  try {
    const res = await ipcService.syncPlayers()
    if (res.success) {
      await loadPlayers()
      notificationStore.addNotification({ type: 'success', message: 'Player list synchronized' })
    }
  } catch (e) {
    notificationStore.addNotification({ type: 'error', message: 'Failed to synchronize players' })
  } finally {
    syncing.value = false
  }
}

const loadPlayers = async () => {
  try {
    const res = await ipcService.getPlayers({ limit: 1000 })
    if (res.success) {
      availablePlayers.value = res.data
    }
  } catch (e) {
    console.error('Failed to load players for linking', e)
  }
}

const getAliasName = (id) => {
  const alias = filterStore.aliases.find(a => a.id === id)
  return alias ? alias.name : 'Unknown'
}

const createAlias = async () => {
  if (!newAliasName.value.trim() || creating.value) return
  creating.value = true
  try {
    const res = await ipcService.createAlias({ name: newAliasName.value.trim() })
    if (res.success) {
      await filterStore.fetchAliases()
      showCreateModal.value = false
      newAliasName.value = ''
      notificationStore.addNotification({ type: 'success', message: 'Alias created successfully' })
    }
  } catch (e) {
    notificationStore.addNotification({ type: 'error', message: 'Failed to create alias' })
  } finally {
    creating.value = false
  }
}

const deleteAlias = async (alias) => {
  if (!confirm(`Are you sure you want to delete alias "${alias.name}"? Players will be unlinked but their data won't be deleted.`)) return
  try {
    const res = await ipcService.deleteAlias(alias.id)
    if (res.success) {
      await filterStore.fetchAliases()
      await loadPlayers()
      notificationStore.addNotification({ type: 'success', message: 'Alias deleted' })
    }
  } catch (e) {
    notificationStore.addNotification({ type: 'error', message: 'Failed to delete alias' })
  }
}

const linkPlayer = async (playerId, aliasId) => {
  try {
    const res = await ipcService.linkPlayerToAlias(playerId, { aliasId })
    if (res.success) {
      await filterStore.fetchAliases()
      await loadPlayers()
      selectedPlayerToLink.value = null
      notificationStore.addNotification({ type: 'success', message: 'Player linked to alias' })
    }
  } catch (e) {
    notificationStore.addNotification({ type: 'error', message: 'Failed to link player' })
  }
}

const unlinkPlayer = async (playerId) => {
  try {
    const res = await ipcService.unlinkPlayerFromAlias(playerId)
    if (res.success) {
      await filterStore.fetchAliases()
      await loadPlayers()
      notificationStore.addNotification({ type: 'success', message: 'Player unlinked' })
    }
  } catch (e) {
    notificationStore.addNotification({ type: 'error', message: 'Failed to unlink player' })
  }
}

onMounted(() => {
  filterStore.fetchAliases()
  loadPlayers()
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
