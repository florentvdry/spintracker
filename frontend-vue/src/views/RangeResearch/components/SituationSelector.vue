<template>
  <div class="bg-dark-200 rounded-xl p-5 shadow-2xl flex flex-col gap-6 border border-white/5 relative overflow-hidden">
    <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary-500/5 blur-3xl rounded-full"></div>
    
    <div class="flex flex-wrap items-center gap-6 pb-5 border-b border-white/5">
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('range_analysis.filters.table_size') }}</span>
        <div class="flex bg-dark-400 rounded-lg p-1 border border-white/5">
          <button
            v-for="count in [2, 3]"
            :key="count"
            @click="handlePlayerCountChange(count)"
            :class="[
              'px-4 py-1.5 text-xs font-bold rounded-md transition-all duration-200',
              filters.PlayerCount === count ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:text-white'
            ]"
          >
            {{ count === 2 ? 'Heads-Up' : '3-Max' }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('range_analysis.filters.target_player') }}</span>
        <div class="relative">
          <div 
            class="flex items-center gap-3 cursor-pointer bg-dark-400 border border-white/5 rounded-lg px-4 py-2 text-sm text-white hover:border-primary-500/50 transition-all min-w-[200px] shadow-inner"
            @click="isDropdownOpen = !isDropdownOpen"
          >
            <User class="w-4 h-4 text-primary-400" />
            <span class="flex-1 truncate font-medium">{{ filters.HeroName || $t('range_analysis.filters.population') }}</span>
            <ChevronDown :class="['w-4 h-4 text-gray-500 transition-transform', isDropdownOpen && 'rotate-180']" />
          </div>

          <div v-if="isDropdownOpen" class="fixed inset-0 z-40" @click="isDropdownOpen = false"></div>
          <div v-if="isDropdownOpen" class="absolute top-full left-0 mt-2 w-72 bg-dark-300 border border-white/10 rounded-xl shadow-2xl z-50 flex flex-col max-h-80 overflow-hidden">
            <div class="p-3 border-b border-white/5 bg-dark-400/50">
              <div class="relative">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                  type="text" 
                  :placeholder="$t('common.search')" 
                  class="w-full bg-dark-500 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-xs text-gray-200 focus:outline-none focus:border-primary-500/50"
                  v-model="searchTerm"
                  @click.stop
                  autofocus
                />
              </div>
            </div>
            <div class="overflow-y-auto flex-1 custom-scrollbar p-1">
              <div 
                :class="[
                  'px-4 py-3 text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3',
                  !filters.HeroName ? 'bg-primary-500/20 text-primary-400 font-bold' : 'text-gray-300 hover:bg-white/5'
                ]"
                @click="handleSelectPlayer('')"
              >
                <div class="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center">
                  <Layers class="w-4 h-4" />
                </div>
                <span>{{ $t('range_analysis.filters.population') }}</span>
              </div>

              <!-- Aliases Section -->
              <div v-if="filteredAliases.length > 0" class="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">
                {{ $t('common.aliases') || 'Aliases' }}
              </div>
              <div 
                v-for="a in filteredAliases" 
                :key="'alias-' + a.id" 
                :class="[
                  'px-4 py-2.5 text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3',
                  filters.HeroName === a.name ? 'bg-primary-500/20 text-primary-400 font-bold' : 'text-gray-300 hover:bg-white/5'
                ]"
                @click="handleSelectPlayer(a.name)"
              >
                <div class="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-400 border border-primary-500/20">
                  <Users class="w-4 h-4" />
                </div>
                <div class="flex flex-col">
                  <span>{{ a.name }}</span>
                  <span class="text-[10px] text-gray-500 font-normal">{{ a.players.length }} {{ $t('common.players') }}</span>
                </div>
              </div>

              <!-- Players Section -->
              <div v-if="filteredPlayers.length > 0" class="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-2">
                {{ $t('common.players') }}
              </div>
              <div 
                v-for="p in filteredPlayers" 
                :key="p.name" 
                :class="[
                  'px-4 py-2.5 text-sm cursor-pointer rounded-lg mx-1 my-0.5 transition-colors flex items-center gap-3',
                  filters.HeroName === p.name ? 'bg-primary-500/20 text-primary-400 font-bold' : 'text-gray-300 hover:bg-white/5'
                ]"
                @click="handleSelectPlayer(p.name)"
              >
                <div class="w-8 h-8 rounded-full bg-dark-500 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-white/5">
                  {{ p.name.substring(0, 2).toUpperCase() }}
                </div>
                <div class="flex flex-col">
                  <span>{{ p.name }}</span>
                  <span class="text-[10px] text-gray-500 font-normal">{{ (p.total_hands || 0).toLocaleString() }} {{ $t('common.hands') }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('range_analysis.filters.stack_depth') }}</span>
        <div class="flex items-center gap-2 bg-dark-400 border border-white/5 rounded-lg px-3 py-1.5 shadow-inner">
          <Layers class="w-4 h-4 text-gray-500" />
          <input 
            type="number" 
            placeholder="Min"
            :value="filters.MinStackBB || ''"
            @input="handleMinStackChange"
            class="bg-transparent border-none p-0 text-sm text-white w-12 focus:ring-0 placeholder:text-gray-600 font-medium"
          />
          <span class="text-gray-600">to</span>
          <input 
            type="number" 
            placeholder="Max"
            :value="filters.MaxStackBB || ''"
            @input="handleMaxStackChange"
            class="bg-transparent border-none p-0 text-sm text-white w-12 focus:ring-0 placeholder:text-gray-600 font-medium"
          />
        </div>
      </div>



      <button 
        @click="handleReset" 
        class="mt-5 ml-auto text-xs text-gray-500 hover:text-white flex items-center gap-2 transition-colors group"
      >
        <RotateCcw class="w-3.5 h-3.5 group-hover:-rotate-45 transition-transform" /> 
        {{ $t('range_analysis.filters.reset') }}
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
          <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider">{{ $t('range_analysis.filters.position') }}</h3>
        </div>
        <div class="grid grid-cols-1 gap-2">
          <button
            v-for="pos in availablePositions"
            :key="pos"
            @click="handlePositionChange(pos)"
            :class="[
              'flex items-center justify-between px-5 py-4 rounded-xl border transition-all duration-200 text-left',
              selectedPosition === pos 
                ? 'bg-primary-500/10 border-primary-500 text-primary-400 shadow-lg shadow-primary-500/5' 
                : 'bg-dark-400/50 border-white/5 text-gray-400 hover:border-white/10 hover:bg-dark-400'
            ]"
          >
            <div class="flex flex-col">
              <span class="text-lg font-bold">{{ pos }}</span>
              <span class="text-[10px] opacity-60 uppercase tracking-tighter">
                {{ pos === 'BTN' ? 'Button / Dealer' : pos === 'SB' ? 'Small Blind' : 'Big Blind' }}
              </span>
            </div>
            <div v-if="selectedPosition === pos" class="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></div>
          </button>
        </div>
      </div>

      <div class="lg:col-span-3 flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">2</div>
          <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider">{{ $t('range_analysis.filters.situation') }}</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            v-for="sit in currentSituations"
            :key="sit.id"
            @click="handleSituationSelect(sit)"
            :class="[
              'flex flex-col gap-2 p-4 rounded-xl border transition-all duration-200 text-left relative overflow-hidden group',
              currentSitId === sit.situationId 
                ? 'bg-white/5 border-primary-500/50 text-white' 
                : 'bg-dark-400/50 border-white/5 text-gray-400 hover:border-white/20 hover:bg-dark-400'
            ]"
          >
            <div v-if="currentSitId === sit.situationId" class="absolute top-0 right-0 p-1">
              <div class="bg-primary-500 text-[8px] font-black px-1.5 py-0.5 rounded text-white uppercase">{{ $t('range_analysis.filters.active') }}</div>
            </div>
            <span :class="['text-sm font-bold transition-colors', currentSitId === sit.situationId ? 'text-primary-400' : 'group-hover:text-gray-200']">
              {{ sit.label }}
            </span>
            
            <div class="flex items-center gap-1.5 flex-wrap">
              <span v-if="sit.sequence.length === 0" class="text-[9px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 font-bold uppercase">{{ $t('range_analysis.filters.first_to_act') }}</span>
              <template v-for="(step, i) in sit.sequence" :key="i">
                <div class="flex items-center gap-1">
                  <div class="flex items-center gap-1 bg-dark-500 px-2 py-0.5 rounded border border-white/5">
                    <span class="text-[9px] font-bold text-gray-300">{{ step.split(':')[0] }}</span>
                    <span :class="['text-[9px] font-black uppercase', getActionColorClass(step.split(':')[1])]">{{ step.split(':')[1] }}</span>
                  </div>
                  <span v-if="i < sit.sequence.length - 1" class="text-[10px] text-gray-600">→</span>
                </div>
              </template>
            </div>
          </button>
        </div>
        
        <div class="mt-2 flex items-center gap-2 text-[11px] text-gray-500 bg-blue-500/5 border border-blue-500/10 p-3 rounded-lg">
          <Info class="w-4 h-4 text-blue-400 shrink-0" />
          <div v-html="$t('range_analysis.filters.info_tip', { position: selectedPosition, player: filters.HeroName || $t('range_analysis.filters.population') })"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { User, RotateCcw, Layers, Search, ChevronDown, Info, Users } from 'lucide-vue-next'
import { usePlayersStore } from '@/stores/playersStore'
import { useFilterStore } from '@/stores/filterStore'

const props = defineProps({
  filters: {
    type: Object,
    required: true
  },
  onChange: {
    type: Function,
    required: true
  }
})

const { t } = useI18n()
const playersStore = usePlayersStore()
const filterStore = useFilterStore()

const isDropdownOpen = ref(false)
const searchTerm = ref('')
const selectedPosition = ref(props.filters.Positions?.[0] || '')

const SITUATIONS = computed(() => {
  return {
    3: {
      BTN: [
        { id: 'rfi', situationId: 'rfi', label: t('range_analysis.situations.rfi'), sequence: [], positions: ['BTN'] },
        { id: 'limp', situationId: 'limp', label: t('range_analysis.situations.limp'), sequence: [], positions: ['BTN'] },
      ],
      SB: [
        { id: 'sb_rfi', situationId: 'sb_rfi', label: t('range_analysis.situations.sb_rfi'), sequence: ['BTN:fold'], positions: ['SB'] },
        { id: 'vs_btn_open', situationId: 'vs_btn_open', label: t('range_analysis.situations.vs_btn_open'), sequence: ['BTN:raise'], positions: ['SB'] },
        { id: 'vs_btn_limp', situationId: 'vs_btn_limp', label: t('range_analysis.situations.vs_btn_limp'), sequence: ['BTN:call'], positions: ['SB'] },
      ],
      BB: [
        { id: 'vs_btn_open_sb_fold', situationId: 'vs_btn_open_sb_fold', label: t('range_analysis.situations.vs_btn_open_sb_fold'), sequence: ['BTN:raise', 'SB:fold'], positions: ['BB'] },
        { id: 'vs_sb_open', situationId: 'vs_sb_open', label: t('range_analysis.situations.vs_sb_open'), sequence: ['BTN:fold', 'SB:raise'], positions: ['BB'] },
        { id: 'vs_btn_open_sb_call', situationId: 'vs_btn_open_sb_call', label: t('range_analysis.situations.vs_btn_open_sb_call'), sequence: ['BTN:raise', 'SB:call'], positions: ['BB'] },
        { id: 'vs_sb_limp', situationId: 'vs_sb_limp', label: t('range_analysis.situations.vs_sb_limp'), sequence: ['BTN:fold', 'SB:call'], positions: ['BB'] },
        { id: 'vs_btn_limp_sb_limp', situationId: 'vs_btn_limp_sb_limp', label: t('range_analysis.situations.vs_btn_limp_sb_limp'), sequence: ['BTN:call', 'SB:call'], positions: ['BB'] },
        { id: 'vs_btn_limp_sb_fold', situationId: 'vs_btn_limp_sb_fold', label: t('range_analysis.situations.vs_btn_limp_sb_fold'), sequence: ['BTN:call', 'SB:fold'], positions: ['BB'] },
      ]
    },
    2: {
      SB: [
        { id: 'hu_sb_rfi', situationId: 'hu_sb_rfi', label: t('range_analysis.situations.hu_sb_rfi'), sequence: [], positions: ['SB'] },
        { id: 'hu_sb_limp', situationId: 'hu_sb_limp', label: t('range_analysis.situations.hu_sb_limp'), sequence: [], positions: ['SB'] },
      ],
      BB: [
        { id: 'hu_vs_sb_open', situationId: 'hu_vs_sb_open', label: t('range_analysis.situations.hu_vs_sb_open'), sequence: ['SB:raise'], positions: ['BB'] },
        { id: 'hu_vs_sb_limp', situationId: 'hu_vs_sb_limp', label: t('range_analysis.situations.hu_vs_sb_limp'), sequence: ['SB:call'], positions: ['BB'] },
      ]
    }
  }
})

const filteredAliases = computed(() => {
  return filterStore.aliases.filter(a => 
    a.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

const filteredPlayers = computed(() => {
  return playersStore.players.filter(p => 
    p.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

const availablePositions = computed(() => {
  return props.filters.PlayerCount === 2 ? ['SB', 'BB'] : ['BTN', 'SB', 'BB']
})

const currentSituations = computed(() => {
  if (!selectedPosition.value) return []
  return SITUATIONS.value[props.filters.PlayerCount]?.[selectedPosition.value] || []
})

const currentSitId = computed(() => {
  return props.filters.SituationId || ''
})

watch(() => props.filters.Positions, (newPositions) => {
  if (newPositions?.[0]) {
    selectedPosition.value = newPositions[0]
  }
})

const handleSelectPlayer = (name) => {
  props.onChange({ ...props.filters, HeroName: name })
  isDropdownOpen.value = false
}

const handleMinStackChange = (e) => {
  props.onChange({ ...props.filters, MinStackBB: e.target.value ? parseFloat(e.target.value) : null })
}

const handleMaxStackChange = (e) => {
  props.onChange({ ...props.filters, MaxStackBB: e.target.value ? parseFloat(e.target.value) : null })
}



const handleReset = () => {
  selectedPosition.value = ''
  props.onChange({
    ...props.filters,
    HeroName: undefined,
    MinStackBB: null,
    MaxStackBB: null,
    Positions: [],
    ActionSequence: [],
    SituationId: ''
  })
}

const handleSituationSelect = (sit) => {
  props.onChange({
    ...props.filters,
    Positions: sit.positions,
    ActionSequence: sit.sequence,
    SituationId: sit.situationId
  })
}

const handlePositionChange = (pos) => {
  selectedPosition.value = pos
  const firstSit = SITUATIONS.value[props.filters.PlayerCount]?.[pos]?.[0]
  if (firstSit) {
    handleSituationSelect(firstSit)
  }
}

const handlePlayerCountChange = (count) => {
  selectedPosition.value = ''
  props.onChange({
    ...props.filters,
    PlayerCount: count,
    Positions: [],
    ActionSequence: [],
    SituationId: ''
  })
}

const getActionColorClass = (action) => {
  if (action === 'raise') return 'text-red-400'
  if (action === 'call') return 'text-green-400'
  return 'text-blue-400'
}
</script>
