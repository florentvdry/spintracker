<template>
  <div class="bg-dark-200 rounded-xl p-5 shadow-2xl flex flex-col gap-6 border border-white/5">
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">1</div>
        <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider">{{ $t('analysis.filters.situation') }}</h3>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('analysis.filters.table_size') }}</label>
          <select
            :value="filters.PlayerCount || ''"
            @change="handleChange('PlayerCount', $event.target.value ? parseInt($event.target.value) : null)"
            class="w-full bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white mt-1"
          >
            <option value="">{{ $t('common.any') }}</option>
            <option value="2">Heads-Up</option>
            <option value="3">3-Max</option>
          </select>
        </div>

        <div>
          <label class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('analysis.filters.position') }}</label>
          <select
            :value="filters.Positions?.[0] || ''"
            @change="handleChange('Positions', $event.target.value ? [$event.target.value] : [])"
            class="w-full bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white mt-1"
          >
            <option value="">{{ $t('common.any') }}</option>
            <option value="BTN">BTN</option>
            <option value="SB">SB</option>
            <option value="BB">BB</option>
          </select>
        </div>
      </div>

      <div>
        <label class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('analysis.filters.stack_depth') }}</label>
        <div class="flex items-center gap-2 mt-1">
          <input 
            type="number" 
            :value="filters.MinStackBB || ''"
            @input="handleChange('MinStackBB', $event.target.value ? parseFloat($event.target.value) : null)"
            placeholder="Min"
            class="flex-1 bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
          />
          <span class="text-gray-500">→</span>
          <input 
            type="number" 
            :value="filters.MaxStackBB || ''"
            @input="handleChange('MaxStackBB', $event.target.value ? parseFloat($event.target.value) : null)"
            placeholder="Max"
            class="flex-1 bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-4 pt-4 border-t border-white/5">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white">2</div>
        <h3 class="text-sm font-bold text-gray-300 uppercase tracking-wider">{{ $t('analysis.filters.action') }}</h3>
      </div>

      <div>
        <label class="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{{ $t('analysis.filters.preflop') }}</label>
        <select
          :value="filters.Action || ''"
          @change="handleChange('Action', $event.target.value)"
          class="w-full bg-dark-400 border border-white/5 rounded-lg px-3 py-2 text-sm text-white mt-1"
        >
          <option value="">{{ $t('common.any') }}</option>
          <option value="raise">{{ $t('actions.raise') }}</option>
          <option value="call">{{ $t('actions.call') }}</option>
          <option value="fold">{{ $t('actions.fold') }}</option>
          <option value="check">{{ $t('actions.check') }}</option>
          <option value="all_in">{{ $t('actions.all_in') }}</option>
        </select>
      </div>
    </div>

    <button
      @click="handleReset"
      class="w-full py-2 text-xs text-gray-500 hover:text-white transition-colors"
    >
      {{ $t('common.clear_all') }}
    </button>
  </div>
</template>

<script setup>
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

const handleChange = (key, value) => {
  props.onChange({ [key]: value })
}

const handleReset = () => {
  props.onChange({
    Situation: '',
    Action: '',
    PlayerCount: null,
    MinStackBB: null,
    MaxStackBB: null,
    Positions: [],
    PreflopBtnAction: '',
    PreflopSbAction: '',
    PreflopBbAction: '',
    FlopBtnAction: '',
    FlopSbAction: '',
    FlopBbAction: '',
    TurnBtnAction: '',
    TurnSbAction: '',
    TurnBbAction: '',
    RiverBtnAction: '',
    RiverSbAction: '',
    RiverBbAction: ''
  })
}
</script>
