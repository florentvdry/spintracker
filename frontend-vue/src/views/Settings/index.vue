<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h1 class="text-2xl font-bold text-white">{{ $t('settings.title') }}</h1>
      <p class="text-gray-400 mt-1">{{ $t('settings.subtitle') }}</p>
    </div>

    <Card :title="$t('settings.general.title')">
      <SettingRow
        :icon="Globe"
        :title="$t('settings.general.language')"
        :description="$t('settings.general.language_desc')"
      >
        <div class="flex bg-dark-200 rounded-lg p-1 border border-dark-100/50">
          <button
            @click="changeLanguage('en')"
            :class="[
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              locale.startsWith('en') 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
            ]"
          >
            English
          </button>
          <button
            @click="changeLanguage('fr')"
            :class="[
              'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              locale.startsWith('fr') 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white'
            ]"
          >
            Français
          </button>
        </div>
      </SettingRow>
    </Card>

    <Card :title="$t('settings.database.multiple.title')" :subtitle="$t('settings.database.multiple.desc')">
      <div class="space-y-4">
        <div class="flex items-center gap-3 py-3 border-b border-dark-100/30">
          <div class="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
            <Plus class="w-5 h-5 text-gray-400" />
          </div>
          <div class="flex-1">
            <input
              type="text"
              v-model="newDbName"
              :placeholder="$t('settings.database.multiple.name')"
              class="w-full bg-dark-200 border border-dark-100/50 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              @keydown.enter="handleCreateDatabase"
            />
          </div>
          <button
            @click="handleCreateDatabase"
            :disabled="!newDbName.trim() || creatingDb"
            class="btn-primary flex items-center gap-2"
          >
            <Loader v-if="creatingDb" class="w-4 h-4 animate-spin" />
            <Plus v-else class="w-4 h-4" />
            {{ $t('settings.database.multiple.create') }}
          </button>
        </div>

        <div v-if="loadingDatabases" class="flex items-center justify-center py-8">
          <Loader class="w-6 h-6 animate-spin text-gray-400" />
        </div>
        <div v-else v-for="db in databases" :key="db.id" class="flex items-center gap-3 py-3 border-b border-dark-100/30 last:border-b-0">
          <div class="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
            <Database :class="['w-5 h-5', db.isActive ? 'text-green-400' : 'text-gray-400']" />
          </div>
          <div class="flex-1 min-w-0">
            <div v-if="editingDbId === db.id" class="flex items-center gap-2">
              <input
                type="text"
                v-model="editingDbName"
                class="flex-1 bg-dark-200 border border-dark-100/50 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                @keydown.enter="handleRenameDatabase(db)"
                @keydown.escape="cancelEditing"
                ref="editInput"
              />
              <button @click="handleRenameDatabase(db)" class="p-1.5 text-green-400 hover:text-green-300">
                <Check class="w-4 h-4" />
              </button>
              <button @click="cancelEditing" class="p-1.5 text-gray-400 hover:text-gray-300">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div v-else>
              <div class="flex items-center gap-2">
                <p class="text-white font-medium truncate">{{ db.name }}</p>
                <span v-if="db.isActive" class="badge badge-success text-xs">{{ $t('settings.database.multiple.active') }}</span>
              </div>
              <p class="text-sm text-gray-400">
                {{ $t('settings.database.multiple.created', { date: new Date(db.createdAt).toLocaleDateString() }) }}
              </p>
            </div>
          </div>
          <div v-if="!db.isActive" class="flex items-center gap-2">
            <button
              @click="startEditing(db)"
              class="p-2 text-gray-400 hover:text-white transition-colors"
              :title="$t('common.edit')"
            >
              <Edit2 class="w-4 h-4" />
            </button>
            <button
              @click="handleSetActiveDatabase(db.id)"
              class="btn-secondary flex items-center gap-2 text-sm"
            >
              <Check class="w-4 h-4" />
              {{ $t('settings.database.multiple.set_active') }}
            </button>
            <button
              @click="handleDeleteDatabase(db)"
              class="p-2 text-red-400 hover:text-red-300 transition-colors"
              :title="$t('common.delete')"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Card>

    <Card :title="$t('settings.database.title')" :subtitle="$t('settings.database.subtitle')">
      <div class="space-y-4">
        <SettingRow
          :icon="Download"
          :title="$t('settings.database.export.title')"
          :description="$t('settings.database.export.desc')"
        >
          <button 
            @click="handleExport"
            :disabled="exportLoading"
            class="btn-secondary flex items-center gap-2"
          >
            <Loader v-if="exportLoading" class="w-4 h-4 animate-spin" />
            <Download v-else class="w-4 h-4" />
            {{ exportLoading ? $t('common.loading') : $t('settings.database.export.button') }}
          </button>
        </SettingRow>

        <SettingRow
          :icon="Trash2"
          :title="$t('settings.database.delete.title')"
          :description="$t('settings.database.delete.desc')"
        >
          <button
            @click="handleDeleteAll"
            class="btn-danger flex items-center gap-2"
          >
            <Trash2 class="w-4 h-4" />
            {{ $t('settings.database.delete.button') }}
          </button>
        </SettingRow>
      </div>
    </Card>

    <Card :title="$t('settings.server.title')" :subtitle="$t('settings.server.subtitle')">
      <SettingRow
        :icon="Database"
        :title="$t('settings.server.status.title')"
        :description="$t('settings.server.status.desc')"
      >
        <span :class="['badge', serverStatus === 'active' ? 'badge-success' : 'badge-danger']">
          {{ serverStatus === 'active' ? $t('settings.server.status.active') : $t('settings.server.status.inactive') }}
        </span>
      </SettingRow>
    </Card>

    <Card :title="$t('settings.maintenance.title')">
      <SettingRow
        :icon="FolderOpen"
        :title="$t('settings.maintenance.logs.title')"
        :description="$t('settings.maintenance.logs.desc')"
      >
        <button
          @click="handleOpenLogs"
          class="btn-secondary flex items-center gap-2"
        >
          <FolderOpen class="w-4 h-4" />
          {{ $t('settings.maintenance.logs.button') }}
        </button>
      </SettingRow>
    </Card>

    <Card :title="$t('settings.about.title')">
      <div class="space-y-2 text-sm text-gray-400">
        <p><span class="text-white">SpinTracker</span> v{{ appVersion }}</p>
        <p>{{ $t('settings.about.description') }}</p>
      </div>
    </Card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, Database, Download, Globe, FolderOpen, Loader, Plus, Check, X, Edit2 } from 'lucide-vue-next'
import { ipcService } from '@/services/ipcService'
import { useNotificationStore } from '@/stores/notificationStore'
import { useAppStore } from '@/stores/appStore'
import { useFilterStore } from '@/stores/filterStore'
import { usePlayersStore } from '@/stores/playersStore'
import Card from '@/components/ui/Card.vue'

const { t, locale } = useI18n()
const notificationStore = useNotificationStore()
const appStore = useAppStore()
const filterStore = useFilterStore()
const playersStore = usePlayersStore()

const serverStatus = ref('checking')
const exportLoading = ref(false)
const appVersion = ref('1.0.0')
const databases = ref([])
const loadingDatabases = ref(true)
const creatingDb = ref(false)
const newDbName = ref('')
const editingDbId = ref(null)
const editingDbName = ref('')
let statusInterval = null

const changeLanguage = (lng) => {
  locale.value = lng
}

const loadVersion = async () => {
  try {
    const version = await ipcService.getAppVersion()
    if (version) appVersion.value = version
  } catch (error) {
    console.error('Failed to load version:', error)
  }
}

const checkStatus = async () => {
  try {
    const result = await ipcService.checkServerStatus()
    serverStatus.value = result.success ? 'active' : 'inactive'
  } catch (error) {
    serverStatus.value = 'inactive'
  }
}

const loadDatabases = async () => {
  try {
    loadingDatabases.value = true
    const result = await ipcService.getDatabases()
    if (result.success) {
      databases.value = result.data || []
    }
  } catch (error) {
    console.error('Failed to load databases:', error)
  } finally {
    loadingDatabases.value = false
  }
}

const handleDeleteAll = async () => {
  try {
    const result = await ipcService.deleteAllHands()
    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: 'Données supprimées',
        message: result.message || 'Toutes les mains ont été supprimées. Les stats et profils par défaut ont été restaurés.',
      })
      await appStore.refreshAll()
      filterStore.setHeroName(null)
      await playersStore.loadPlayers()
      window.location.reload()
    } else {
      if (result.message && result.message.includes('annulée')) {
        return 
      }
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message || 'Une erreur inconnue est survenue',
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur critique',
      message: error.message || 'Impossible de contacter le serveur',
    })
  }
}

const handleOpenLogs = async () => {
  try {
    const result = await ipcService.openLogsFolder()
    if (!result.success) {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.error || 'Impossible d\'ouvrir le dossier des logs'
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      message: error.message
    })
  }
}

const handleCreateDatabase = async () => {
  if (!newDbName.value.trim()) return
  
  try {
    creatingDb.value = true
    const result = await ipcService.createDatabase(newDbName.value.trim())
    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: 'Base de données créée',
        message: `La base de données "${newDbName.value}" a été créée`
      })
      newDbName.value = ''
      await loadDatabases()
    } else {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message || 'Impossible de créer la base de données'
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: error.message
    })
  } finally {
    creatingDb.value = false
  }
}

const handleSetActiveDatabase = async (dbId) => {
  try {
    const result = await ipcService.setActiveDatabase(dbId)
    if (result.success) {
      notificationStore.addNotification({
        type: 'info',
        title: 'Base de données activée',
        message: 'L\'application va redémarrer avec la nouvelle base de données...'
      })
      await loadDatabases()
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    } else {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message || 'Impossible de changer de base de données'
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: error.message
    })
  }
}

const handleDeleteDatabase = async (db) => {
  if (databases.value.length <= 1) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: t('settings.database.multiple.cannot_delete_last')
    })
    return
  }

  if (db.isActive) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: t('settings.database.multiple.cannot_delete_active')
    })
    return
  }

  const confirmed = window.confirm(
    `${t('settings.database.multiple.confirm_delete')}\n\n${t('settings.database.multiple.delete_warning')}`
  )

  if (!confirmed) return

  try {
    const result = await ipcService.deleteDatabase(db.id)
    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: 'Base de données supprimée',
        message: `La base de données "${db.name}" a été supprimée`
      })
      await loadDatabases()
    } else {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message || 'Impossible de supprimer la base de données'
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: error.message
    })
  }
}

const handleRenameDatabase = async (db) => {
  if (!editingDbName.value.trim()) return

  try {
    const result = await ipcService.renameDatabase(db.id, editingDbName.value.trim())
    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: 'Base de données renommée',
        message: `La base de données a été renommée en "${editingDbName.value}"`
      })
      editingDbId.value = null
      editingDbName.value = ''
      await loadDatabases()
    } else {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message || 'Impossible de renommer la base de données'
      })
    }
  } catch (error) {
    notificationStore.addNotification({
      type: 'error',
      title: 'Erreur',
      message: error.message
    })
  }
}

const startEditing = (db) => {
  editingDbId.value = db.id
  editingDbName.value = db.name
}

const cancelEditing = () => {
  editingDbId.value = null
  editingDbName.value = ''
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const result = await ipcService.exportData()
    if (result.success) {
      notificationStore.addNotification({
        type: 'success',
        title: 'Export réussi',
        message: result.message
      })
    } else if (result.message !== 'Export cancelled') {
      notificationStore.addNotification({
        type: 'error',
        title: 'Erreur',
        message: result.message
      })
    }
  } finally {
    exportLoading.value = false
  }
}

const SettingRow = {
  props: ['icon', 'title', 'description'],
  components: { Trash2, Database, Download, Globe, FolderOpen, Loader, Plus, Check, X, Edit2 },
  template: `
    <div class="flex items-center justify-between py-3 border-b border-dark-100/30 last:border-b-0">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-lg bg-dark-200 flex items-center justify-center">
          <component :is="icon" class="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <p class="text-white font-medium">{{ title }}</p>
          <p class="text-sm text-gray-400">{{ description }}</p>
        </div>
      </div>
      <slot></slot>
    </div>
  `
}

onMounted(() => {
  checkStatus()
  loadVersion()
  loadDatabases()
  statusInterval = setInterval(checkStatus, 30000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
  }
})
</script>
