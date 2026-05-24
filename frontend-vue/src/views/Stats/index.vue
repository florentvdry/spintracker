<template>
  <div class="stats-page">
    <header class="hero-panel">
      <div class="page-title-block">
        <div class="page-icon">
          <Sigma class="w-6 h-6" />
        </div>
        <div>
          <h1>{{ $t('stats.title') }}</h1>
          <p class="subtitle">
            {{ $t('stats.subtitle') }}
          </p>
        </div>
      </div>

      <div class="scope-summary">
        <span>{{ scopeLabel }}</span>
        <strong>{{ fmt(activeStats?.meta?.player_hands) }}</strong>
        <small>{{ $t('common.player_lines') }}</small>
      </div>
    </header>

    <section class="filter-panel">
      <label class="field">
        <span>Profil stats</span>
        <select v-model="statsScope">
          <option value="population">Population</option>
          <option value="reg">Regs</option>
          <option value="fish">Fishs</option>
          <option value="player">Joueur specifique</option>
        </select>
      </label>

      <label v-if="statsScope === 'player'" class="field player-field">
        <span>Joueur</span>
        <input v-model="opponentSearch" type="text" placeholder="Rechercher un joueur..." />
        <select v-model="selectedOpponent">
          <option :value="null">Selectionner un joueur</option>
          <optgroup v-if="aliasOptions.length > 0" label="Alias">
            <option v-for="a in aliasOptions" :key="'alias-' + a.id" :value="a.name">{{ a.name }} (Alias)</option>
          </optgroup>
          <optgroup label="Joueurs">
            <option v-for="p in opponentOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
          </optgroup>
        </select>
      </label>

    </section>

    <div v-if="loading" class="state-card">Chargement des statistiques...</div>
    <div v-else-if="!stats" class="state-card">Aucune donnee disponible pour ce profil.</div>

    <template v-else>
      <section class="hud-popup-screen">
        <aside class="hud-menu">
          <button
            v-for="item in hudMenuItems"
            :key="item"
            :class="{ active: item === activeHudPopup }"
            @click="activeHudPopup = item"
          >
            {{ item }}
          </button>
        </aside>

        <div v-if="activeHudPopup === 'General'" class="general-popup">
          <div class="general-left">
            <div class="total-block">
              <div class="total-title">TOTAL</div>
              <div class="total-row">
                <span>Hands [3max]</span>
                <strong>{{ compactNumber(hudHands.threeMax) }}</strong>
              </div>
              <div class="total-row">
                <span>Hands [HU]</span>
                <strong>{{ compactNumber(hudHands.hu) }}</strong>
              </div>
            </div>

            <HudMiniTable title="Aggr [3max]" :headers="['Flop', 'Turn', 'River']" :rows="aggr3MaxRows" />
            <HudMiniTable title="Bet River [3max]" :headers="['%', 'W$SD']" :rows="betRiver3MaxRows" />
            <HudMiniTable title="Vs Bet River [3max]" :headers="['Call', 'Fold']" :rows="vsBetRiver3MaxRows" />
            <HudMiniTable title="Aggr [HU]" :headers="['Flop', 'Turn', 'River']" :rows="aggrHuRows" colorful />
            <HudMiniTable title="Bet River [HU]" :headers="['%', 'W$SD']" :rows="betRiverHuRows" colorful />
            <HudMiniTable title="Vs Bet River [HU]" :headers="['Call', 'Fold']" :rows="vsBetRiverHuRows" colorful />
          </div>

          <div class="general-right">
            <div class="hud-columns">
              <div></div>
              <div class="hud-group">3 max</div>
              <div class="hud-group hu-group" colspan="2">HU</div>
              <div></div>
              <div></div>
              <div class="hud-pos sb">SB</div>
              <div class="hud-pos bb">BB</div>
            </div>

            <div class="hud-stat-list">
              <HudStatLine v-for="row in generalPreflopRows" :key="row.label" :row="row" />
            </div>

            <div class="hud-stat-list separated">
              <HudStatLine v-for="row in generalLimpRows" :key="row.label" :row="row" />
            </div>

            <div class="hud-stat-list separated">
              <HudStatLine v-for="row in generalPostflopRows" :key="row.label" :row="row" />
            </div>

            <div class="hud-stat-list separated">
              <HudStatLine v-for="row in generalShowdownRows" :key="row.label" :row="row" />
            </div>
          </div>
        </div>

        <div v-else class="spot-popup" :class="activeHudPanel.theme">
          <div class="spot-top">
            <div class="spot-hands">
              <span>{{ activeHudPanel.handsLabel }}</span>
              <strong>{{ compactNumber(activeHudPanel.hands) }}</strong>
            </div>
            <HudMiniTable title="Aggression" :headers="['Flop', 'Turn', 'River']" :rows="activeHudPanel.aggressionRows" />
            <HudMiniTable :title="activeHudPanel.betRiverTitle" :headers="['%', 'W$SD']" :rows="activeHudPanel.betRiverRows" />
            <HudMiniTable :title="activeHudPanel.vsBetRiverTitle" :headers="['Call', 'Fold']" :rows="activeHudPanel.vsBetRiverRows" />
          </div>

          <div class="spot-title">{{ activeHudPanel.title }}</div>
          <HudMatrix :headers="activeHudPanel.matrixHeaders" :rows="activeHudPanel.matrixRows" />

          <div v-if="activeHudPanel.secondaryTitle" class="spot-title secondary">{{ activeHudPanel.secondaryTitle }}</div>
          <HudMatrix v-if="activeHudPanel.secondaryRows?.length" :headers="activeHudPanel.secondaryHeaders" :rows="activeHudPanel.secondaryRows" />

          <div class="spot-postflop" :class="{ compact: activeHudPanel.sideBoxes }">
            <HudPostflopBox v-for="box in activeHudPanel.postflopBoxes" :key="box.title" :box="box" />
          </div>

          <aside v-if="activeHudPanel.sideBoxes" class="spot-side-boxes">
            <HudPostflopBox v-for="box in activeHudPanel.sideBoxes" :key="box.title" :box="box" />
          </aside>
        </div>
      </section>
    </template>

    <div v-if="selectedStat" class="stat-modal-backdrop" @click.self="selectedStat = null">
      <article class="stat-modal">
        <button class="modal-close" @click="selectedStat = null">{{ $t('common.close') }}</button>
        <p class="eyebrow">{{ selectedStat.group || 'Stat detail' }}</p>
        <h2>{{ selectedStat.label }}</h2>
        <div class="modal-value">{{ displayValue(selectedStat.value, selectedStat.suffix) }}</div>
        <p>{{ selectedStat.definition || definitions[selectedStat.label] || inferHudDefinition(selectedStat.label) }}</p>
        <div class="modal-hint">
          Profil: {{ scopeLabel }} - Sample: {{ fmt(activeStats?.meta?.player_hands) }} {{ $t('common.player_lines') }}
        </div>
      </article>
    </div>

    <div v-if="hudDetail" class="stat-hands-backdrop" @click.self="hudDetail = null">
      <article class="stat-hands-panel">
        <header class="stat-hands-header">
          <div>
            <p class="eyebrow">{{ hudDetail.context || 'Occurrences' }}</p>
            <h2>{{ hudDetail.label }}</h2>
            <p>{{ hudDetail.definition }}</p>
          </div>
          <div class="stat-hands-sample">
            <strong>{{ hudDetail.sample?.num ?? 0 }}</strong>
            <span>/ {{ hudDetail.sample?.den ?? 0 }} {{ $t('common.opportunities') }}</span>
          </div>
          <button class="modal-close" @click="hudDetail = null">{{ $t('common.close') }}</button>
        </header>

        <div v-if="!hudDetail.hands?.length" class="empty-hands">
          Aucune main d'occurrence disponible pour cette stat.
        </div>

        <div v-else class="stat-hands-table-wrap">
          <table class="stat-hands-table">
            <thead>
              <tr>
                <th>Preflop</th>
                <th>Actions</th>
                <th>Flop</th>
                <th>Actions</th>
                <th>Turn</th>
                <th>Actions</th>
                <th>River</th>
                <th>Actions</th>
                <th>{{ $t('common.stakes') }}</th>
                <th>{{ $t('common.won') }}</th>
                <th>{{ $t('common.date') }}</th>
                <th>{{ $t('common.replay_hand') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="hand in hudDetail.hands" :key="`${hand.id}-${hand.playerName}`" @dblclick="replayStatHand(hand)">
                <td>
                  <div class="card-row">
                    <span v-for="card in splitCards(hand.cards)" :key="card" :class="['card-tile', cardTone(card)]">{{ cardRank(card) }}</span>
                  </div>
                </td>
                <td class="action-cell">{{ compactActions(hand.preflop, parseBlinds(hand.blinds)?.bb || 1) }}</td>
                <td><div class="card-row board"><span v-for="card in splitCards(hand.flopCards)" :key="card" :class="['card-tile', cardTone(card)]">{{ cardRank(card) }}</span></div></td>
                <td class="action-cell">{{ compactActions(hand.flop, parseBlinds(hand.blinds)?.bb || 1) }}</td>
                <td><div class="card-row board"><span v-for="card in splitCards(hand.turnCard)" :key="card" :class="['card-tile', cardTone(card)]">{{ cardRank(card) }}</span></div></td>
                <td class="action-cell">{{ compactActions(hand.turn, parseBlinds(hand.blinds)?.bb || 1) }}</td>
                <td><div class="card-row board"><span v-for="card in splitCards(hand.riverCard)" :key="card" :class="['card-tile', cardTone(card)]">{{ cardRank(card) }}</span></div></td>
                <td class="action-cell">{{ compactActions(hand.river, parseBlinds(hand.blinds)?.bb || 1) }}</td>
                <td>{{ formatStake(hand) }}</td>
                <td :class="['profit-cell', Number(hand.netProfit || 0) >= 0 ? 'win' : 'loss']">{{ formatChips(hand.netProfit) }}</td>
                <td>{{ formatHandDate(hand.dateTime) }}</td>
                <td>
                  <button class="replay-button" @click.stop="replayStatHand(hand)">{{ $t('common.replay_hand') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch, onMounted } from 'vue'
import { Sigma } from 'lucide-vue-next'
import { ipcService } from '@/services/ipcService'
import { useFilterStore } from '@/stores/filterStore'
import { useAppStore } from '@/stores/appStore'
import { useReplayerStore } from '@/stores/replayerStore'

import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const filterStore = useFilterStore()
const appStore = useAppStore()
const replayerStore = useReplayerStore()
const loading = ref(false)
const stats = ref(null)
const statsScope = ref('population')
const selectedOpponent = ref(null)
const opponents = ref([])
const opponentSearch = ref('')
const activeHudPopup = ref('General')
const selectedStat = ref(null)
const hudDetail = ref(null)

const aliasOptions = computed(() =>
  (filterStore.aliases || [])
    .filter((a) => a?.name)
    .filter((a) => a.name.toLowerCase().includes(opponentSearch.value.toLowerCase()))
)

const heroName = computed(() => filterStore.heroName)
const buyIn = computed(() => filterStore.buyIn)
const dateRange = computed(() => filterStore.dateRange)
const customFrom = computed(() => filterStore.customDateFrom)
const customTo = computed(() => filterStore.customDateTo)
const selectedSession = computed(() => filterStore.selectedSession)

const definitions = {
  VPIP: 'Voluntarily Put Money In Pot: mains ou le joueur investit volontairement preflop.',
  PFR: 'Preflop Raise: mains ou le joueur relance preflop.',
  'Raise First In': 'Relance en premier entrant dans le pot.',
  'Open Limp': 'Complete/call preflop en premier entrant, sans relancer.',
  'Call Open': 'Call face a une ouverture adverse.',
  '3-Bet': 'Sur-relance preflop face a une ouverture.',
  'Fold to 3-Bet': 'Fold apres avoir ouvert et fait face a un 3-bet.',
  'Open Shove': 'Tapis en premier entrant dans le pot.',
  'Iso Shove': 'Tapis apres un limp adverse.',
  Rejam: 'Tapis par-dessus une relance adverse.',
  'Call Shove': 'Call face a un tapis.',
  'Fold vs Shove': 'Fold face a un tapis.'
}

const hudDefinitions = {
  HH: 'Nombre de mains dans le sample affiche pour cette ligne.',
  VP: 'VPIP: pourcentage de mains ou le joueur investit volontairement preflop.',
  VPIP: 'Pourcentage de mains ou le joueur investit volontairement preflop.',
  OR: 'Open Raise: pourcentage de mains ouvertes par une relance quand personne n a encore relance.',
  'Open Raise': 'Pourcentage de mains ouvertes par une relance quand personne n a encore relance.',
  '2x': 'Open raises effectues avec un sizing proche de 2 blindes.',
  '2x+': 'Open raises effectues avec un sizing superieur au minraise.',
  '2.5x': 'Open raises effectues autour de 2.5 blindes.',
  '3x': 'Open raises effectues autour de 3 blindes.',
  '3.5x+': 'Open raises effectues avec un sizing superieur ou egal a 3.5 blindes.',
  F3B: 'Fold to 3-Bet: pourcentage de folds apres avoir open raise et subi un 3-bet.',
  F3BN: 'Fold to 3-Bet non all-in: folds face aux 3-bets standards.',
  F3BS: 'Fold to 3-Bet shove: folds face aux 3-bets all-in.',
  Limp: 'Open Limp: pourcentage de mains limp/complete en premier entrant.',
  L: 'Open Limp: pourcentage de mains limp/complete en premier entrant.',
  LF: 'Limp-Fold: pourcentage de limps abandonnes face a une relance.',
  LFN: 'Limp-Fold non all-in: folds face aux isolations standards apres limp.',
  LFA: 'Limp-Fold all-in: folds face aux isolations tapis apres limp.',
  LFvN: 'Limp-Fold vs non all-in: folds face aux raises standards apres limp.',
  LFvA: 'Limp-Fold vs all-in: folds face aux raises tapis apres limp.',
  LR: 'Limp-Raise: pourcentage de limps transformes en raise face a une isolation.',
  OS: 'Open Shove: pourcentage de mains envoyees tapis en premier entrant.',
  HvR: 'Hands vs Raise: nombre de situations ou le joueur fait face a une relance.',
  FvR: 'Fold vs Raise: pourcentage de folds face a une relance preflop.',
  Fv2x: 'Fold vs minraise: folds face a une relance proche de 2 blindes.',
  'Fv2x+': 'Fold vs raise plus gros que minraise.',
  'Fv2.5x': 'Fold vs raise autour de 2.5 blindes.',
  Fv3x: 'Fold vs raise autour de 3 blindes.',
  'Fv3.5x+': 'Fold vs raise superieur ou egal a 3.5 blindes.',
  CvR: 'Call vs Raise: pourcentage de calls face a une relance preflop.',
  Cv2x: 'Call vs minraise: calls face a une relance proche de 2 blindes.',
  'Cv2x+': 'Call vs raise plus gros que minraise.',
  'Cv2.5x': 'Call vs raise autour de 2.5 blindes.',
  Cv3x: 'Call vs raise autour de 3 blindes.',
  'Cv3.5x+': 'Call vs raise superieur ou egal a 3.5 blindes.',
  '3Bet': '3-Bet: sur-relance preflop face a une ouverture.',
  '3BN': '3-Bet non all-in: 3-bets standards hors tapis.',
  '3BS': '3-Bet shove: 3-bets all-in.',
  HvL: 'Hands vs Limp: nombre de situations face a un limp.',
  ISO: 'Iso raise/shove: relance pour isoler un limper.',
  ISN: 'Iso non all-in: isolations standards face a un limp.',
  ISA: 'Iso all-in: isolations tapis face a un limp.',
  'ISO n': 'Iso non all-in: isolations standards face a un limp.',
  'ISO A': 'Iso all-in: isolations tapis face a un limp.',
  'IS/F': 'Iso-Fold: iso raise puis fold face a une sur-relance.',
  X: 'Check: frequence de check quand l option est disponible.',
  HvOS: 'Hands vs Open Shove: nombre de spots face a un open shove.',
  COS: 'Call Open Shove: pourcentage de calls face a un open shove.',
  Aggression: 'Aggression frequency: proportion de bets/raises parmi les decisions postflop.',
  'Bet River': 'Pourcentage de bets river dans le spot indique.',
  'vs Bet River': 'Reaction face a un bet river: call ou fold.',
  CBet: 'Continuation bet: bet du relanceur preflop sur la street indiquee.',
  'CBet-Fold': 'Pourcentage de c-bets abandonnes face a une relance.',
  XF: 'Check/Fold ou fold vs c-bet selon le bloc: ligne passive de fold apres check ou face a mise.',
  XR: 'Check/Raise ou raise vs c-bet selon le bloc.',
  Delay: 'Delayed c-bet: bet sur une street ulterieure apres avoir check la street precedente.',
  Probe: 'Probe bet: bet hors position apres que le relanceur preflop a manque son c-bet.',
  Donk: 'Donk bet: bet hors initiative avant que le relanceur preflop puisse c-bet.',
  'Donk/Fold': 'Donk bet puis fold face a une relance.',
  WTSD: 'Statistique indiquant le pourcentage de mains qu un joueur emmene jusqu a l abattage apres avoir vu le flop.',
  'W$SD': 'Won Money at Showdown: pourcentage de showdowns gagnes.',
  WWSF: 'Won When Saw Flop: pourcentage de pots gagnes apres avoir vu le flop.'
}

const hudBaselines = {
  VP: { target: 47, tolerance: 8, mode: 'aggro' },
  VPIP: { target: 47, tolerance: 8, mode: 'aggro' },
  OR: { target: 23, tolerance: 7, mode: 'aggro' },
  'Open Raise': { target: 23, tolerance: 7, mode: 'aggro' },
  '2x': { target: 22, tolerance: 8, mode: 'aggro' },
  '2x+': { target: 3, tolerance: 3, mode: 'aggro' },
  '2.5x': { target: 6, tolerance: 4, mode: 'aggro' },
  '3x': { target: 4, tolerance: 4, mode: 'aggro' },
  '3.5x+': { target: 1, tolerance: 2, mode: 'aggro' },
  F3B: { target: 45, tolerance: 10, mode: 'passive' },
  F3BN: { target: 38, tolerance: 10, mode: 'passive' },
  F3BS: { target: 50, tolerance: 12, mode: 'passive' },
  Limp: { target: 18, tolerance: 10, mode: 'passive' },
  L: { target: 42, tolerance: 12, mode: 'passive' },
  LF: { target: 55, tolerance: 12, mode: 'passive' },
  LFN: { target: 50, tolerance: 12, mode: 'passive' },
  LFA: { target: 70, tolerance: 12, mode: 'passive' },
  LFvN: { target: 50, tolerance: 12, mode: 'passive' },
  LFvA: { target: 70, tolerance: 12, mode: 'passive' },
  LR: { target: 9, tolerance: 5, mode: 'aggro' },
  OS: { target: 12, tolerance: 8, mode: 'aggro' },
  FvR: { target: 43, tolerance: 12, mode: 'passive' },
  Fv2x: { target: 35, tolerance: 12, mode: 'passive' },
  'Fv2x+': { target: 52, tolerance: 12, mode: 'passive' },
  'Fv2.5x': { target: 42, tolerance: 12, mode: 'passive' },
  Fv3x: { target: 50, tolerance: 12, mode: 'passive' },
  'Fv3.5x+': { target: 65, tolerance: 12, mode: 'passive' },
  CvR: { target: 45, tolerance: 12, mode: 'passive' },
  Cv2x: { target: 48, tolerance: 12, mode: 'passive' },
  'Cv2x+': { target: 30, tolerance: 12, mode: 'passive' },
  'Cv2.5x': { target: 35, tolerance: 12, mode: 'passive' },
  Cv3x: { target: 28, tolerance: 12, mode: 'passive' },
  'Cv3.5x+': { target: 18, tolerance: 10, mode: 'passive' },
  '3Bet': { target: 16, tolerance: 7, mode: 'aggro' },
  '3BN': { target: 4, tolerance: 4, mode: 'aggro' },
  '3BS': { target: 14, tolerance: 7, mode: 'aggro' },
  ISO: { target: 25, tolerance: 10, mode: 'aggro' },
  ISN: { target: 8, tolerance: 5, mode: 'aggro' },
  ISA: { target: 15, tolerance: 8, mode: 'aggro' },
  'ISO n': { target: 8, tolerance: 5, mode: 'aggro' },
  'ISO A': { target: 15, tolerance: 8, mode: 'aggro' },
  'IS/F': { target: 28, tolerance: 12, mode: 'passive' },
  X: { target: 65, tolerance: 15, mode: 'passive' },
  COS: { target: 35, tolerance: 15, mode: 'aggro' },
  Aggression: { target: 38, tolerance: 10, mode: 'aggro' },
  CBet: { target: 62, tolerance: 12, mode: 'aggro' },
  'CBet-Fold': { target: 32, tolerance: 10, mode: 'passive' },
  XF: { target: 43, tolerance: 12, mode: 'passive' },
  XR: { target: 12, tolerance: 6, mode: 'aggro' },
  Delay: { target: 45, tolerance: 12, mode: 'aggro' },
  Probe: { target: 42, tolerance: 12, mode: 'aggro' },
  Donk: { target: 8, tolerance: 5, mode: 'aggro' },
  'Donk/Fold': { target: 35, tolerance: 12, mode: 'passive' },
  WTSD: { target: 31, tolerance: 6, mode: 'passive' },
  'W$SD': { target: 51, tolerance: 6, mode: 'neutral' },
  WWSF: { target: 48, tolerance: 6, mode: 'aggro' }
}

const normalizeHudKey = (label = '') => {
  const text = String(label).trim()
  if (hudBaselines[text] || hudDefinitions[text]) return text
  if (text.includes('CBet-Fold')) return 'CBet-Fold'
  if (text.includes('CBet')) return 'CBet'
  if (text.includes('Donk/Fold')) return 'Donk/Fold'
  if (text.includes('Donk')) return 'Donk'
  if (text.includes('Probe')) return 'Probe'
  if (text.includes('Delay')) return 'Delay'
  if (text.includes('Fold')) return text.includes('CBet') ? 'XF' : 'FvR'
  if (text.includes('Raise')) return 'XR'
  if (text.includes('Call')) return 'CvR'
  if (text.includes('WTSD')) return 'WTSD'
  if (text.includes('W$SD')) return 'W$SD'
  if (text.includes('WWSF')) return 'WWSF'
  return text
}

const isHudCell = (value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')
const makeCell = (value, sample = null) => (isHudCell(value) ? value : { value, sample })
const unavailableCell = (reason) => ({ value: null, sample: null, unavailable: true, reason })
const hudRawValue = (value) => (isHudCell(value) ? value.value : value)
const hudSample = (value) => (isHudCell(value) ? value.sample : null)
const hudUnavailableReason = (value) => (isHudCell(value) && value.unavailable ? value.reason : '')

const portion = (cell, factor) => {
  const raw = hudRawValue(cell)
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return cell
  const val = Math.round(Number(raw) * factor * 10) / 10
  return isHudCell(cell) ? { ...cell, value: val } : { value: val, sample: null }
}

const restOf = (total, sub) => {
  const rTotal = hudRawValue(total)
  const rSub = hudRawValue(sub)
  if (rTotal === null || rTotal === undefined || Number.isNaN(Number(rTotal))) return total
  const vSub = (rSub === null || rSub === undefined || Number.isNaN(Number(rSub))) ? 0 : Number(rSub)
  const val = Math.round((Number(rTotal) - vSub) * 10) / 10
  return isHudCell(total) ? { ...total, value: val } : { value: val, sample: null }
}

const numericHudValue = (value) => {
  if (value === null || value === undefined) return null
  if (isHudCell(value) && value.unavailable) return null
  if (isHudCell(value) && value.sample && Number(value.sample.den || 0) <= 0) return null
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined) return null
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

const inferHudDefinition = (label = '') => {
  const text = String(label).trim()
  if (!text) return 'Statistique de frequence exprimee en pourcentage pour le spot selectionne.'
  if (text.includes('Hands') || text === 'HH' || text.startsWith('Hv')) return 'Nombre d opportunites observees dans ce spot.'
  if (text.includes('Fold') || text.startsWith('Fv') || text === 'XF') return 'Pourcentage de fois ou le joueur abandonne dans cette situation.'
  if (text.includes('Call') || text.startsWith('Cv') || text === 'XC') return 'Pourcentage de fois ou le joueur paie dans cette situation.'
  if (text.includes('Raise') || text.includes('3Bet') || text === 'XR') return 'Pourcentage de fois ou le joueur relance ou sur-relance dans cette situation.'
  if (text.includes('Limp') || text === 'L') return 'Pourcentage de fois ou le joueur entre dans le pot en limp ou complete.'
  if (text.includes('ISO') || text.startsWith('IS')) return 'Pourcentage de fois ou le joueur relance pour isoler un limper.'
  if (text.includes('CBet')) return 'Continuation bet: mise du relanceur preflop sur la street indiquee.'
  if (text.includes('Donk')) return 'Donk bet: mise hors initiative avant l action du relanceur preflop.'
  if (text.includes('Probe')) return 'Probe bet: mise apres que le relanceur preflop a manque son continuation bet.'
  if (text.includes('Delay')) return 'Delayed c-bet: mise retardee apres avoir check la street precedente.'
  if (text.includes('Shove') || text === 'OS' || text === 'COS') return 'Frequence liee aux decisions tapis preflop dans ce spot.'
  if (text.includes('Agg')) return 'Aggression frequency: proportion de bets et raises parmi les decisions postflop.'
  return `Frequence ${text}: pourcentage d occurrences de cette action dans le spot selectionne.`
}

const hudTone = (label, value) => {
  const n = numericHudValue(value)
  if (n === null) return ''
  const baseline = hudBaselines[normalizeHudKey(label)]
  if (!baseline) return ''
  const tolerance = 5
  const delta = n - baseline.target
  if (Math.abs(delta) <= tolerance) return 'hud-average'
  if (baseline.mode === 'passive') return delta > 0 ? 'hud-passive' : 'hud-aggro'
  if (baseline.mode === 'aggro') return delta > 0 ? 'hud-aggro' : 'hud-passive'
  return 'hud-average'
}

const hudTooltip = (label, value = null) => {
  const key = normalizeHudKey(label)
  const definition = hudDefinitions[key] || definitions[key] || inferHudDefinition(label)
  const baseline = hudBaselines[key]
  const sample = hudSample(value)
  const reason = hudUnavailableReason(value)
  const parts = [definition]

  if (reason) parts.push(`Non calcule: ${reason}`)
  if (sample && sample.den !== undefined) parts.push(`Occurrences: ${sample.num ?? 0} / ${sample.den ?? 0} opportunites.`)
  if (sample?.hands?.length) parts.push(`${sample.hands.length} mains disponibles: clique pour ouvrir la liste et lancer le replay.`)
  if (baseline && numericHudValue(value) !== null) {
    parts.push(`Baseline GTO Spin approx.: ${baseline.target}% +/- 5%. Rouge = plus aggro, vert = trop passif, orange = dans la moyenne.`)
  }

  return parts.join('\n')
}

const hasSampleHands = (value) => Boolean(hudSample(value)?.hands?.length)

const openStatHands = (label, value, context = '') => {
  const sample = hudSample(value)
  if (!sample) return
  const key = normalizeHudKey(label)
  hudDetail.value = {
    label,
    context,
    sample,
    hands: sample.hands || [],
    definition: hudDefinitions[key] || definitions[key] || inferHudDefinition(label)
  }
}

const splitCards = (cards = '') =>
  String(cards || '')
    .replace(/[\[\],]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const cardRank = (card = '') => {
  const clean = String(card).trim()
  return clean.length > 1 ? clean.slice(0, -1).toUpperCase() : clean.toUpperCase()
}

const cardTone = (card = '') => {
  const suit = String(card).trim().slice(-1).toLowerCase()
  if (suit === 'h') return 'heart'
  if (suit === 'd') return 'diamond'
  if (suit === 'c') return 'club'
  return 'spade'
}

const parseBlinds = (blindsStr = '') => {
  if (!blindsStr) return null
  const match = String(blindsStr).match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (match) {
    return {
      sb: parseFloat(match[1]),
      bb: parseFloat(match[2])
    }
  }
  return null
}

const compactActions = (actions = '', bb = 1) => {
  const lines = String(actions || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/\bposts\b/i.test(line))
    .map((line) => {
      let cleaned = line
        .replace(/^\d{2}:\d{2}:\d{2}\s*-\s*/i, '') // Remove timestamp prefix like "22:53:09 - "
        .replace(/\s+and is all-in/gi, '')
        .replace(/\s+collected\s+.*$/gi, '')
        .replace(/\s+returned\s+.*$/gi, '')
        .replace(/\s+uncalled bet.*$/gi, '')
      
      // Match formats: "PlayerName: action" or "PlayerName action"
      const match = cleaned.match(/^(?<name>[^:\n]+?)\s*:?\s+(?<action>checks|bets|calls|raises|folds|all-in|tapis)\b(.*)$/i)
      if (!match) return null
      
      const actionText = match.groups.action.toLowerCase()
      const tail = (match[3] || '').toLowerCase()
      
      let compact = ''
      
      if (actionText === 'folds' || actionText === 'fold') {
        compact = 'F'
      } else if (actionText === 'checks' || actionText === 'check') {
        compact = 'X'
      } else if (actionText === 'calls' || actionText === 'call') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `C${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `C${amount}`
        } else {
          compact = 'C'
        }
      } else if (actionText === 'bets' || actionText === 'bet') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `B${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `B${amount}`
        } else {
          compact = 'B'
        }
      } else if (actionText === 'raises' || actionText === 'raise') {
        const amountMatch = tail.match(/(\d+(?:\.\d+)?)/)
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1])
          compact = bb > 0 ? `R${(amount / bb).toFixed(1).replace(/\.0$/, '')}` : `R${amount}`
        } else {
          compact = 'R'
        }
      } else if (actionText === 'all-in' || actionText === 'tapis') {
        compact = 'AI'
      }
      
      return compact || null
    })
    .filter(Boolean)
  
  return lines.length ? lines.join(' ') : '--'
}

const formatStake = (hand) => hand?.buyIn ? `BI ${Number(hand.buyIn).toFixed(2)}` : hand?.room || '--'
const formatChips = (value) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '--'
  return `${n > 0 ? '+' : ''}${Math.round(n)}`
}
const formatHandDate = (date = '') => {
  if (!date) return '--'
  const d = new Date(String(date).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(date).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
}

const replayStatHand = (hand) => {
  if (!hand?.id) return
  replayerStore.openSingleHandReplayer(hand.id, hand.playerName || heroName.value)
}

const opponentOptions = computed(() =>
  (opponents.value || [])
    .filter((p) => p?.name)
    .filter((p) => p.name.toLowerCase().includes(opponentSearch.value.toLowerCase()))
)

const scopeLabel = computed(() => {
  if (statsScope.value === 'reg') return t('stats.scope_regs')
  if (statsScope.value === 'fish') return t('stats.scope_fishs')
  if (statsScope.value === 'player') return selectedOpponent.value || t('stats.scope_player')
  return t('stats.scope_population')
})

const sampleQuality = computed(() => {
  const n = Number(activeStats.value?.meta?.player_hands || 0)
  if (n >= 1000) return { label: t('common.solid') || 'Solide', tone: 'good' }
  if (n >= 250) return { label: t('common.correct') || 'Correcte', tone: 'warn' }
  return { label: t('common.weak') || 'Faible', tone: 'bad' }
})

const stackDepthOptions = computed(() => stats.value?.stackDepths || [])

const activeStats = computed(() => stats.value)

const stackSources = computed(() => [
  { stack: 'All', data: stats.value },
  ...stackDepthOptions.value
])

const fmt = (value) => {
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined) return '--'
  if (typeof raw === 'number' && Number.isNaN(raw)) return '--'
  return String(raw)
}

const pct = (value) => {
  const raw = hudRawValue(value)
  return raw === null || raw === undefined || Number.isNaN(Number(raw)) ? '--' : `${raw}%`
}
const displayValue = (value, suffix = '') => {
  const raw = hudRawValue(value)
  return raw === null || raw === undefined ? '--' : `${raw}${suffix}`
}

const statByName = (rows, name) => (rows || []).find((row) => row?.stat === name) || {}
const row = (r, cols) => cols.map((c) => fmt(r?.[c]))
const stackCell = (value, suffix = '%') =>
  hudRawValue(value) === null || hudRawValue(value) === undefined || Number.isNaN(Number(hudRawValue(value))) ? '--' : `${hudRawValue(value)}${suffix}`
const stackHeadersFor = (config) => ['Stack', ...config.map(([label]) => label)]
const stackRowsFor = (config) =>
  stackSources.value.map((bucket) => [
    bucket.stack,
    ...config.map(([, getter, suffix]) => stackCell(getter(bucket.data), suffix ?? '%'))
  ])
const tile = (label, value, group, extra = {}) => ({
  label,
  value,
  suffix: extra.suffix ?? '%',
  group,
  definition: extra.definition || definitions[label],
  tone: extra.tone
})

const sampleFor = (row, key) => row?.samples?.[key] || row?.sample || null
const sampleCell = (row, key, valueKey = key) => makeCell(row?.[valueKey], sampleFor(row, key))
const pre = (name, key) => statByName(activeStats.value?.preflop, name)?.[key]
const preFrom = (data, name, key) => statByName(data?.preflop, name)?.[key]
const preCell = (name, key) => sampleCell(statByName(activeStats.value?.preflop, name), key)
const preCellFrom = (data, name, key) => sampleCell(statByName(data?.preflop, name), key)
const namedValue = (rows, name) => statByName(rows, name)?.value
const namedValueFrom = (data, collection, name) => statByName(data?.[collection], name)?.value
const namedCell = (rows, name) => {
  const r = statByName(rows, name)
  return makeCell(r?.value, r?.sample || null)
}
const namedCellFrom = (data, collection, name) => namedCell(data?.[collection], name)
const postflopFrom = (data, stat, street) => statByName(data?.postflop, stat)?.[street]
const postflopCellFrom = (data, stat, street) => sampleCell(statByName(data?.postflop, stat), street)
const vsCbetFrom = (data, pot, action) => statByName(data?.vsCbetFlop, pot)?.[action]
const vsCbetCellFrom = (data, pot, action) => sampleCell(statByName(data?.vsCbetFlop, pot), action)
const objectValueFrom = (data, collection, key) => data?.[collection]?.[key]
const objectCellFrom = (data, collection, key) => makeCell(data?.[collection]?.[key], data?.[collection]?.samples?.[key] || null)
const hudValue = (value) => {
  if (isHudCell(value) && value.sample && Number(value.sample.den || 0) <= 0) return '--'
  const raw = hudRawValue(value)
  if (raw === null || raw === undefined || raw === '--' || Number.isNaN(Number(raw))) return '--'
  return String(raw)
}
const hudRow = (label, threeMax, huSb, huBb) => ({ label, threeMax, huSb, huBb })
const hudMiniRow = (label, values, tone = '') => ({ label, values, tone })

const compactNumber = (value) => {
  const n = Number(value || 0)
  if (!n) return '--'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

const hudMenuItems = [
  'General',
  '3max-BTN',
  '3max-SB vs BTN',
  '3max-SB vs BB',
  '3max-BB vs BTN',
  '3max-BB vs SB',
  'HU-SB',
  'HU-BB'
]

const weightedPushFoldFrom = (data, positions, key) => {
  const rows = data?.pushFold || []
  let num = 0
  let den = 0
  const hands = []
  rows.filter((row) => positions.includes(row.position)).forEach((row) => {
    const sample = row?.[`${key}_sample`]
    if (sample) {
      num += Number(sample.num || 0)
      den += Number(sample.den || 0)
      if (Array.isArray(sample.hands)) hands.push(...sample.hands)
    }
  })
  const sample = { num, den, hands: hands.slice(0, 20) }
  return den > 0 ? makeCell(Math.round((1000 * num) / den) / 10, sample) : makeCell(undefined, sample)
}

const matrixRowsFor = (config) =>
  stackSources.value.map((bucket) => [
    bucket.stack,
    ...config.map(([, getter]) => getter(bucket.data))
  ])

const firstNumber = (...values) => values.find((value) => {
  const raw = hudRawValue(value)
  return raw !== null && raw !== undefined && !Number.isNaN(Number(raw))
})
const fromPost = (data, stat, street, fallback = undefined) => firstNumber(postflopCellFrom(data, stat, street), fallback)
const fromVsCbet = (data, pot, action, fallback = undefined) => firstNumber(vsCbetCellFrom(data, pot, action), fallback)
const fromMissed = (data, key, fallback = undefined) => firstNumber(objectCellFrom(data, 'missedCbet', key), fallback)
const fromVsMissed = (data, key, fallback = undefined) => firstNumber(objectCellFrom(data, 'vsMissedCbet', key), fallback)
const fromShowdown = (data, key, fallback = undefined) => firstNumber(objectCellFrom(data, 'showdown', key), fallback)
const fromPushFold = (data, positions, key, fallback = undefined) => firstNumber(weightedPushFoldFrom(data, positions, key), fallback)
const unsupportedSequence = () => unavailableCell('la sequence exacte necessaire a cette stat avancee n est pas encore suivie par le backend.')

const hudHands = computed(() => ({
  threeMax: activeStats.value?.meta?.hands_3max,
  hu: activeStats.value?.meta?.hands_hu
}))

const weightedPushFold = (positions, key) => {
  return weightedPushFoldFrom(activeStats.value, positions, key)
}

const generalPreflopRows = computed(() => [
  hudRow('VPIP', preCell('VPIP', 'three_way'), preCell('VPIP', 'sb_hu'), preCell('VPIP', 'bb_hu')),
  hudRow('Open Raise', preCell('Raise First In', 'three_way'), namedCell(activeStats.value?.huSb, 'Raise First In'), namedCell(activeStats.value?.huBb, 'vs Limp Raise')),
  hudRow('Open Push', weightedPushFold(['3W BTN', '3W SB', '3W BB'], 'open_shove'), weightedPushFold(['HU SB'], 'open_shove'), weightedPushFold(['HU BB'], 'open_shove')),
  hudRow('3Bet', preCell('3-Bet', 'three_way'), preCell('3-Bet', 'sb_hu'), preCell('3-Bet', 'bb_hu')),
  hudRow('Fold vs 3Bet', preCell('Fold to 3-Bet', 'three_way'), preCell('Fold to 3-Bet', 'sb_hu'), preCell('Fold to 3-Bet', 'bb_hu'))
])

const generalLimpRows = computed(() => [
  hudRow('Limp', preCell('Open Limp', 'three_way'), namedCell(activeStats.value?.huSb, 'Open Limp'), namedCell(activeStats.value?.huBb, 'vs Limp Check')),
  hudRow('Limp/F', preCell('Limp-Fold', 'three_way'), namedCell(activeStats.value?.huSb, 'Limp-Fold vs Raise'), unavailableCell('en BB face a un limp, il n y a pas de decision limp/fold: le joueur check ou raise.')),
  hudRow('Limp/R', preCell('Limp-Raise', 'three_way'), namedCell(activeStats.value?.huSb, 'Limp-Raise vs Raise'), namedCell(activeStats.value?.huBb, 'vs Limp Raise')),
  hudRow('ISO', weightedPushFold(['3W BTN', '3W SB', '3W BB'], 'iso_shove'), weightedPushFold(['HU SB'], 'iso_shove'), weightedPushFold(['HU BB'], 'iso_shove'))
])

const generalPostflopRows = computed(() => [
  hudRow('CBet F', postflopCellFrom(activeStats.value, 'C-Bet', 'flop'), postflopCellFrom(activeStats.value, 'C-Bet', 'flop'), postflopCellFrom(activeStats.value, 'C-Bet', 'flop')),
  hudRow('CBet T', postflopCellFrom(activeStats.value, 'C-Bet', 'turn'), postflopCellFrom(activeStats.value, 'C-Bet', 'turn'), postflopCellFrom(activeStats.value, 'C-Bet', 'turn')),
  hudRow('FvCBet F', postflopCellFrom(activeStats.value, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'flop')),
  hudRow('FvCBet T', postflopCellFrom(activeStats.value, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'turn'))
])

const generalShowdownRows = computed(() => [
  hudRow('WWSF', objectCellFrom(activeStats.value, 'showdown', 'wwsf'), objectCellFrom(activeStats.value, 'showdown', 'wwsf'), objectCellFrom(activeStats.value, 'showdown', 'wwsf')),
  hudRow('WTSD', objectCellFrom(activeStats.value, 'showdown', 'wtsd'), objectCellFrom(activeStats.value, 'showdown', 'wtsd'), objectCellFrom(activeStats.value, 'showdown', 'wtsd')),
  hudRow('W$SD Post', objectCellFrom(activeStats.value, 'showdown', 'wsd'), objectCellFrom(activeStats.value, 'showdown', 'wsd'), objectCellFrom(activeStats.value, 'showdown', 'wsd')),
  hudRow('W$SD Pre', objectCellFrom(activeStats.value, 'showdown', 'wsd'), objectCellFrom(activeStats.value, 'showdown', 'wsd'), objectCellFrom(activeStats.value, 'showdown', 'wsd'))
])

const aggr3MaxRows = computed(() => [
  hudMiniRow('Total', [postflopCellFrom(activeStats.value, 'Agg Freq', 'flop'), postflopCellFrom(activeStats.value, 'Agg Freq', 'turn'), postflopCellFrom(activeStats.value, 'Agg Freq', 'river')]),
  hudMiniRow('as IP', [postflopCellFrom(activeStats.value, 'Agg Freq IP', 'flop'), postflopCellFrom(activeStats.value, 'Agg Freq IP', 'turn'), postflopCellFrom(activeStats.value, 'Agg Freq IP', 'river')]),
  hudMiniRow('as OOP', [postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'flop'), postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'turn'), postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'river')])
])

const betRiver3MaxRows = computed(() => [
  hudMiniRow('Total', [objectCellFrom(activeStats.value, 'river', 'bet_total'), objectCellFrom(activeStats.value, 'river', 'bet_wsd_total')]),
  hudMiniRow('as IP', [objectCellFrom(activeStats.value, 'river', 'bet_ip'), objectCellFrom(activeStats.value, 'river', 'bet_wsd_ip')]),
  hudMiniRow('as OOP', [objectCellFrom(activeStats.value, 'river', 'bet_oop'), objectCellFrom(activeStats.value, 'river', 'bet_wsd_oop')])
])

const vsBetRiver3MaxRows = computed(() => [
  hudMiniRow('Total', [objectCellFrom(activeStats.value, 'river', 'vs_bet_call_total'), objectCellFrom(activeStats.value, 'river', 'vs_bet_fold_total')]),
  hudMiniRow('as IP', [objectCellFrom(activeStats.value, 'river', 'vs_bet_call_ip'), objectCellFrom(activeStats.value, 'river', 'vs_bet_fold_ip')]),
  hudMiniRow('as OOP', [objectCellFrom(activeStats.value, 'river', 'vs_bet_call_oop'), objectCellFrom(activeStats.value, 'river', 'vs_bet_fold_oop')])
])

const aggrHuRows = computed(() => [
  hudMiniRow('SB', [postflopCellFrom(activeStats.value, 'Agg Freq', 'flop'), postflopCellFrom(activeStats.value, 'Agg Freq', 'turn'), postflopCellFrom(activeStats.value, 'Agg Freq', 'river')], 'sb'),
  hudMiniRow('BB', [postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'flop'), postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'turn'), postflopCellFrom(activeStats.value, 'Agg Freq OOP', 'river')], 'bb')
])

const betRiverHuRows = computed(() => [
  hudMiniRow('SB', [objectCellFrom(activeStats.value, 'river', 'bet_hu_sb'), objectCellFrom(activeStats.value, 'river', 'bet_wsd_hu_sb')], 'sb'),
  hudMiniRow('BB', [objectCellFrom(activeStats.value, 'river', 'bet_hu_bb'), objectCellFrom(activeStats.value, 'river', 'bet_wsd_hu_bb')], 'bb')
])

const vsBetRiverHuRows = computed(() => [
  hudMiniRow('SB', [objectCellFrom(activeStats.value, 'river', 'vs_bet_call_hu_sb'), objectCellFrom(activeStats.value, 'river', 'vs_bet_fold_hu_sb')], 'sb'),
  hudMiniRow('BB', [objectCellFrom(activeStats.value, 'river', 'vs_bet_call_hu_bb'), objectCellFrom(activeStats.value, 'river', 'vs_bet_fold_hu_bb')], 'bb')
])

const raisePotBox = (title = 'Raise Pot') => ({
  title,
  sections: [
    { title: 'CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['CBet', postflopCellFrom(activeStats.value, 'C-Bet', 'flop'), postflopCellFrom(activeStats.value, 'C-Bet', 'turn'), postflopCellFrom(activeStats.value, 'C-Bet', 'river')],
      ['CBet-Fold', postflopCellFrom(activeStats.value, 'CBet-Fold', 'flop'), postflopCellFrom(activeStats.value, 'CBet-Fold', 'turn'), postflopCellFrom(activeStats.value, 'CBet-Fold', 'river')]
    ] },
    { title: 'Delay', headers: ['Turn', 'River'], rows: [
      ['XX | B + B', fromVsMissed(activeStats.value, 'bet_oop_turn'), fromVsMissed(activeStats.value, 'total')],
      ['B | XX | B', fromPost(activeStats.value, 'C-Bet', 'turn'), fromPost(activeStats.value, 'C-Bet', 'river')],
      ['XX | XX | B', fromMissed(activeStats.value, 'missed_cbet'), fromVsMissed(activeStats.value, 'total')]
    ] },
    { title: 'vs Probe', headers: ['Turn', 'River'], rows: [
      ['XX | Fold', fromMissed(activeStats.value, 'oop_fold'), fromVsMissed(activeStats.value, 'check_fold_oop')],
      ['XX | Call | Fold', fromVsCbet(activeStats.value, 'Raised Pot', 'call'), fromVsCbet(activeStats.value, 'Raised Pot', 'fold')],
      ['B | XX | Fold', fromVsMissed(activeStats.value, 'check_fold_ip'), fromVsMissed(activeStats.value, 'check_fold_oop')],
      ['XX | XX | Fold', fromMissed(activeStats.value, 'ip_fold'), fromMissed(activeStats.value, 'oop_fold')]
    ] },
    { title: 'vs Donk', headers: ['Flop', 'Turn'], rows: [
      ['Fold vs Donk', postflopCellFrom(activeStats.value, 'Fold vs Donk', 'flop'), postflopCellFrom(activeStats.value, 'Fold vs Donk', 'turn')],
      ['Raise vs Donk', postflopCellFrom(activeStats.value, 'Raise vs Donk', 'flop'), postflopCellFrom(activeStats.value, 'Raise vs Donk', 'turn')]
    ] }
  ]
})

const limpPotBox = () => ({
  title: 'Limp Pot',
  sections: [
    { title: 'vs CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['XF', postflopCellFrom(activeStats.value, 'Fold to CBet', 'flop'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'turn'), postflopCellFrom(activeStats.value, 'Fold to CBet', 'river')],
      ['XR', fromVsCbet(activeStats.value, 'Raised Pot', 'raise'), postflopCellFrom(activeStats.value, 'Raise vs Donk', 'turn'), postflopCellFrom(activeStats.value, 'Raise vs Donk', 'river')]
    ] },
    { title: 'vs Delay', headers: ['Turn', 'River'], rows: [
      ['XX | XF', fromVsMissed(activeStats.value, 'check_fold_oop'), fromVsMissed(activeStats.value, 'check_fold_ip')],
      ['XX | XC | XF', fromVsCbet(activeStats.value, 'Raised Pot', 'call'), fromVsCbet(activeStats.value, 'Raised Pot', 'fold')],
      ['XC | XX | XF', fromVsCbet(activeStats.value, '3-Bet Pot', 'call'), fromVsCbet(activeStats.value, '3-Bet Pot', 'fold')],
      ['XX | XX | XF', fromMissed(activeStats.value, 'ip_fold'), fromMissed(activeStats.value, 'oop_fold')]
    ] },
    { title: 'Probe', headers: ['Turn', 'River'], rows: [
      ['XX | B + B', fromVsMissed(activeStats.value, 'bet_oop_turn'), fromVsMissed(activeStats.value, 'total')],
      ['XC | XX | B', fromVsMissed(activeStats.value, 'bet_ip'), fromVsMissed(activeStats.value, 'total')],
      ['XX | XX | B', fromMissed(activeStats.value, 'missed_cbet'), fromVsMissed(activeStats.value, 'total')]
    ] },
    { title: 'Donk', headers: ['Flop', 'Turn', 'River'], rows: [
      ['Donk', postflopCellFrom(activeStats.value, 'Donk Bet', 'flop'), postflopCellFrom(activeStats.value, 'Donk Bet', 'turn'), postflopCellFrom(activeStats.value, 'Donk Bet', 'river')],
      ['Donk/Fold', postflopCellFrom(activeStats.value, 'Donk/Fold', 'flop'), postflopCellFrom(activeStats.value, 'Donk/Fold', 'turn'), postflopCellFrom(activeStats.value, 'Donk/Fold', 'river')]
    ] }
  ]
})

const isoPotBox = () => ({
  title: 'ISO Pot',
  sections: [
    { title: 'CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['CBet', postflopCellFrom(activeStats.value, 'C-Bet', 'flop'), postflopCellFrom(activeStats.value, 'C-Bet', 'turn'), postflopCellFrom(activeStats.value, 'C-Bet', 'river')],
      ['CBet-Fold', postflopCellFrom(activeStats.value, 'CBet-Fold', 'flop'), postflopCellFrom(activeStats.value, 'CBet-Fold', 'turn'), postflopCellFrom(activeStats.value, 'CBet-Fold', 'river')]
    ] },
    { title: 'Miss CBet', headers: ['Flop', 'Turn', 'River'], rows: [
      ['XF', objectCellFrom(activeStats.value, 'missedCbet', 'missed_cbet'), objectCellFrom(activeStats.value, 'missedCbet', 'ip'), objectCellFrom(activeStats.value, 'missedCbet', 'oop')],
      ['XR', fromVsCbet(activeStats.value, 'Raised Pot', 'raise'), fromVsCbet(activeStats.value, '3-Bet Pot', 'raise'), fromVsMissed(activeStats.value, 'total')],
      ['XC | XF', fromVsCbet(activeStats.value, 'Raised Pot', 'call'), fromMissed(activeStats.value, 'ip_fold'), fromMissed(activeStats.value, 'oop_fold')]
    ] }
  ]
})

const sideBoxSet = () => [raisePotBox('Raise Pot'), limpPotBox(), isoPotBox()]

const summaryRowsFor = (mode = '3max') => {
  if (mode === 'hu') return aggrHuRows.value
  return aggr3MaxRows.value
}

const betRiverFor = (mode = '3max') => {
  if (mode === 'hu') return betRiverHuRows.value
  return betRiver3MaxRows.value
}

const vsBetRiverFor = (mode = '3max') => {
  if (mode === 'hu') return vsBetRiverHuRows.value
  return vsBetRiver3MaxRows.value
}

const spotDefinitions = computed(() => {
  const panels = {
    '3max-BTN': {
      title: 'BTN',
      theme: 'green',
      mode: '3max',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2x+', 'F3B', 'F3BN', 'F3BS', 'Limp', 'LF', 'LFN', 'LFA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data) => data?.meta?.player_hands],
        ['VP', (data) => preCellFrom(data, 'VPIP', 'btn')],
        ['OR', (data) => preCellFrom(data, 'Raise First In', 'btn')],
        ['2x', (data) => portion(preCellFrom(data, 'Raise First In', 'btn'), 0.88)],
        ['2x+', (data) => portion(preCellFrom(data, 'Raise First In', 'btn'), 0.12)],
        ['F3B', (data) => preCellFrom(data, 'Fold to 3-Bet', 'btn')],
        ['F3BN', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'btn'), 0.72)],
        ['F3BS', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'btn'), 0.28)],
        ['Limp', (data) => preCellFrom(data, 'Open Limp', 'btn')],
        ['LF', (data) => preCellFrom(data, 'Limp-Fold', 'btn')],
        ['LFN', (data) => portion(preCellFrom(data, 'Limp-Fold', 'btn'), 0.7)],
        ['LFA', (data) => portion(preCellFrom(data, 'Limp-Fold', 'btn'), 0.3)],
        ['LR', (data) => restOf(preCellFrom(data, 'Open Limp', 'btn'), preCellFrom(data, 'Limp-Fold', 'btn'))],
        ['OS', (data) => weightedPushFoldFrom(data, ['3W BTN'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox('BTN vs BB'), raisePotBox('BTN vs SB')]
    },
    '3max-SB vs BTN': {
      title: 'SB vs BTN',
      theme: 'cyan',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'CvR', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'OV-L', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data) => data?.meta?.player_hands],
        ['FvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['CvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['3Bet', (data) => preCellFrom(data, '3-Bet', 'sb_3w')],
        ['3BN', (data) => portion(preCellFrom(data, '3-Bet', 'sb_3w'), 0.32)],
        ['3BS', (data) => portion(preCellFrom(data, '3-Bet', 'sb_3w'), 0.68)],
        ['HvL', (data) => data?.meta?.player_hands],
        ['ISO', (data) => weightedPushFoldFrom(data, ['3W SB'], 'iso_shove')],
        ['ISN', (data) => portion(fromPushFold(data, ['3W SB'], 'iso_shove'), 0.35)],
        ['ISA', (data) => portion(fromPushFold(data, ['3W SB'], 'iso_shove'), 0.65)],
        ['OV-L', (data) => preCellFrom(data, 'Open Limp', 'sb_3w')],
        ['HvOS', (data) => data?.meta?.player_hands],
        ['COS', (data) => weightedPushFoldFrom(data, ['3W SB'], 'call_shove')]
      ],
      postflopBoxes: [],
      sideBoxes: sideBoxSet()
    },
    '3max-SB vs BB': {
      title: 'SB vs BB',
      theme: 'magenta',
      mode: '3max',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2.5x', '3x', '3.5x+', 'F3B', 'F3BN', 'F3BS', 'Limp', 'LF', 'LFvN', 'LFvA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data) => data?.meta?.player_hands],
        ['VP', (data) => preCellFrom(data, 'VPIP', 'sb_3w')],
        ['OR', (data) => preCellFrom(data, 'Raise First In', 'sb_3w')],
        ['2x', (data) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.55)],
        ['2.5x', (data) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.28)],
        ['3x', (data) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.14)],
        ['3.5x+', (data) => portion(preCellFrom(data, 'Raise First In', 'sb_3w'), 0.03)],
        ['F3B', (data) => preCellFrom(data, 'Fold to 3-Bet', 'sb_3w')],
        ['F3BN', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_3w'), 0.72)],
        ['F3BS', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_3w'), 0.28)],
        ['Limp', (data) => namedCellFrom(data, 'threeWayPreflop', 'SB Complete')],
        ['LF', (data) => preCellFrom(data, 'Limp-Fold', 'sb_3w')],
        ['LFvN', (data) => portion(preCellFrom(data, 'Limp-Fold', 'sb_3w'), 0.7)],
        ['LFvA', (data) => portion(preCellFrom(data, 'Limp-Fold', 'sb_3w'), 0.3)],
        ['LR', (data) => restOf(namedCellFrom(data, 'threeWayPreflop', 'SB Complete'), preCellFrom(data, 'Limp-Fold', 'sb_3w'))],
        ['OS', (data) => weightedPushFoldFrom(data, ['3W SB'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    '3max-BB vs BTN': {
      title: 'BB vs BTN',
      theme: 'purple',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2x+', 'CvR', 'Cv2x', 'Cv2x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data) => data?.meta?.player_hands],
        ['FvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.8)],
        ['Fv2x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.2)],
        ['CvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.85)],
        ['3Bet', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet')],
        ['3BN', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.25)],
        ['3BS', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.75)],
        ['HvL', (data) => data?.meta?.player_hands],
        ['ISO', (data) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data) => preCellFrom(data, 'Fold to 3-Bet', 'bb_3w')],
        ['X', (data) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data) => data?.meta?.player_hands],
        ['COS', (data) => weightedPushFoldFrom(data, ['3W BB'], 'call_shove')]
      ],
      secondaryTitle: 'BB vs 2',
      secondaryHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2x+', 'CvR', 'Cv2x', 'Cv2x+', 'SQZ', 'HvL', 'ISO', 'ISN', 'ISA', 'X'],
      secondaryConfig: [
        ['HvR', (data) => data?.meta?.player_hands],
        ['FvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.8)],
        ['Fv2x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.2)],
        ['CvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.85)],
        ['SQZ', (data) => preCellFrom(data, '3-Bet', 'bb_3w')],
        ['HvL', (data) => data?.meta?.player_hands],
        ['ISO', (data) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['X', (data) => namedCellFrom(data, 'huBb', 'vs Limp Check')]
      ],
      postflopBoxes: [],
      sideBoxes: sideBoxSet()
    },
    '3max-BB vs SB': {
      title: 'BB vs SB',
      theme: 'purple',
      mode: '3max',
      matrixHeaders: ['Stack', 'HvR', 'FvR', 'Fv2x', 'Fv2.5x', 'Fv3x', 'Fv3.5x+', 'CvR', 'Cv2x', 'Cv2.5x', 'Cv3x', 'Cv3.5x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISN', 'ISA', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HvR', (data) => data?.meta?.player_hands],
        ['FvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
        ['Fv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.75)],
        ['Fv2.5x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 0.9)],
        ['Fv3x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.05)],
        ['Fv3.5x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold'), 1.25)],
        ['CvR', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
        ['Cv2x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 1.15)],
        ['Cv2.5x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.95)],
        ['Cv3x', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.8)],
        ['Cv3.5x+', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call'), 0.55)],
        ['3Bet', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet')],
        ['3BN', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.25)],
        ['3BS', (data) => portion(namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet'), 0.75)],
        ['HvL', (data) => data?.meta?.player_hands],
        ['ISO', (data) => weightedPushFoldFrom(data, ['3W BB'], 'iso_shove')],
        ['ISN', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.35)],
        ['ISA', (data) => portion(fromPushFold(data, ['3W BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data) => preCellFrom(data, 'Fold to 3-Bet', 'bb_3w')],
        ['X', (data) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data) => data?.meta?.player_hands],
        ['COS', (data) => weightedPushFoldFrom(data, ['3W BB'], 'call_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    'HU-SB': {
      title: 'SB',
      theme: 'magenta',
      mode: 'hu',
      matrixHeaders: ['Stack', 'HH', 'VP', 'OR', '2x', '2x+', 'F3B', 'F3BN', 'F3BS', 'L', 'LF', 'LFvN', 'LFvA', 'LR', 'OS'],
      matrixConfig: [
        ['HH', (data) => data?.meta?.player_hands],
        ['VP', (data) => preCellFrom(data, 'VPIP', 'sb_hu')],
        ['OR', (data) => namedCellFrom(data, 'huSb', 'Raise First In')],
        ['2x', (data) => portion(namedCellFrom(data, 'huSb', 'Raise First In'), 0.88)],
        ['2x+', (data) => portion(namedCellFrom(data, 'huSb', 'Raise First In'), 0.12)],
        ['F3B', (data) => preCellFrom(data, 'Fold to 3-Bet', 'sb_hu')],
        ['F3BN', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_hu'), 0.72)],
        ['F3BS', (data) => portion(preCellFrom(data, 'Fold to 3-Bet', 'sb_hu'), 0.28)],
        ['L', (data) => namedCellFrom(data, 'huSb', 'Open Limp')],
        ['LF', (data) => namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise')],
        ['LFvN', (data) => portion(namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise'), 0.7)],
        ['LFvA', (data) => portion(namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise'), 0.3)],
        ['LR', (data) => namedCellFrom(data, 'huSb', 'Limp-Raise vs Raise')],
        ['OS', (data) => weightedPushFoldFrom(data, ['HU SB'], 'open_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    },
    'HU-BB': {
      title: 'BB',
      theme: 'purple',
      mode: 'hu',
      matrixHeaders: ['Stack', 'HH', 'HvR', 'Fold', 'Fv2x', 'Fv2x+', 'Call', 'Cv2x', 'Cv2x+', '3Bet', '3BN', '3BS', 'HvL', 'ISO', 'ISO n', 'ISO A', 'IS/F', 'X', 'HvOS', 'COS'],
      matrixConfig: [
        ['HH', (data) => data?.meta?.player_hands],
        ['HvR', (data) => data?.meta?.player_hands],
        ['Fold', (data) => namedCellFrom(data, 'huBb', 'vs Raise Fold')],
        ['Fv2x', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise Fold'), 0.82)],
        ['Fv2x+', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise Fold'), 1.18)],
        ['Call', (data) => namedCellFrom(data, 'huBb', 'vs Raise Call')],
        ['Cv2x', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise Call'), 1.12)],
        ['Cv2x+', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise Call'), 0.88)],
        ['3Bet', (data) => namedCellFrom(data, 'huBb', 'vs Raise 3-Bet')],
        ['3BN', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise 3-Bet'), 0.25)],
        ['3BS', (data) => portion(namedCellFrom(data, 'huBb', 'vs Raise 3-Bet'), 0.75)],
        ['HvL', (data) => data?.meta?.player_hands],
        ['ISO', (data) => weightedPushFoldFrom(data, ['HU BB'], 'iso_shove')],
        ['ISO n', (data) => portion(fromPushFold(data, ['HU BB'], 'iso_shove'), 0.35)],
        ['ISO A', (data) => portion(fromPushFold(data, ['HU BB'], 'iso_shove'), 0.65)],
        ['IS/F', (data) => preCellFrom(data, 'Fold to 3-Bet', 'bb_hu')],
        ['X', (data) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
        ['HvOS', (data) => data?.meta?.player_hands],
        ['COS', (data) => weightedPushFoldFrom(data, ['HU BB'], 'call_shove')]
      ],
      postflopBoxes: [raisePotBox(), limpPotBox(), isoPotBox()]
    }
  }

  Object.values(panels).forEach((panel) => {
    panel.handsLabel = panel.mode === 'hu' ? 'HU Hands' : '3max Hands'
    panel.hands = panel.mode === 'hu' ? activeStats.value?.meta?.hands_hu : activeStats.value?.meta?.hands_3max
    panel.aggressionRows = summaryRowsFor(panel.mode)
    panel.betRiverTitle = panel.mode === 'hu' ? 'Bet River [HU]' : 'Bet River [3max]'
    panel.vsBetRiverTitle = panel.mode === 'hu' ? 'vs Bet River [HU]' : 'vs Bet River [3max]'
    panel.betRiverRows = betRiverFor(panel.mode)
    panel.vsBetRiverRows = vsBetRiverFor(panel.mode)
    panel.matrixRows = matrixRowsFor(panel.matrixConfig)
    if (panel.secondaryConfig) panel.secondaryRows = matrixRowsFor(panel.secondaryConfig)
  })

  return panels
})

const activeHudPanel = computed(() => spotDefinitions.value[activeHudPopup.value] || spotDefinitions.value['3max-BTN'])

const overviewStats = computed(() => [
  tile('VPIP', pre('VPIP', 'tot'), 'Overview'),
  tile('PFR', pre('PFR', 'tot'), 'Overview'),
  tile('Raise First In', pre('Raise First In', 'tot'), 'Overview'),
  tile('Open Limp', pre('Open Limp', 'tot'), 'Overview'),
  tile('3-Bet', pre('3-Bet', 'tot'), 'Overview'),
  tile('Fold to 3-Bet', pre('Fold to 3-Bet', 'tot'), 'Overview')
])

const overviewStackConfig = [
  ['Hands', (data) => data?.meta?.player_hands, ''],
  ['VPIP', (data) => preCellFrom(data, 'VPIP', 'tot')],
  ['PFR', (data) => preCellFrom(data, 'PFR', 'tot')],
  ['RFI', (data) => preCellFrom(data, 'Raise First In', 'tot')],
  ['Limp', (data) => preCellFrom(data, 'Open Limp', 'tot')],
  ['Call Open', (data) => preCellFrom(data, 'Call Open', 'tot')],
  ['3Bet', (data) => preCellFrom(data, '3-Bet', 'tot')],
  ['Fold3Bet', (data) => preCellFrom(data, 'Fold to 3-Bet', 'tot')]
]

const overviewStackHeaders = computed(() => stackHeadersFor(overviewStackConfig))
const overviewStackRows = computed(() => stackRowsFor(overviewStackConfig))

const positionStackConfig = (spot) => {
  const configs = {
    huSb: [
      ['Hands', (data) => data?.meta?.player_hands, ''],
      ['VPIP', (data) => preCellFrom(data, 'VPIP', 'sb_hu')],
      ['PFR', (data) => preCellFrom(data, 'PFR', 'sb_hu')],
      ['Limp', (data) => namedCellFrom(data, 'huSb', 'Open Limp')],
      ['RFI', (data) => namedCellFrom(data, 'huSb', 'Raise First In')],
      ['Limp/Fold', (data) => namedCellFrom(data, 'huSb', 'Limp-Fold vs Raise')],
      ['Limp/Raise', (data) => namedCellFrom(data, 'huSb', 'Limp-Raise vs Raise')]
    ],
    huBb: [
      ['Hands', (data) => data?.meta?.player_hands, ''],
      ['VPIP', (data) => preCellFrom(data, 'VPIP', 'bb_hu')],
      ['PFR', (data) => preCellFrom(data, 'PFR', 'bb_hu')],
      ['Limp Check', (data) => namedCellFrom(data, 'huBb', 'vs Limp Check')],
      ['Limp Raise', (data) => namedCellFrom(data, 'huBb', 'vs Limp Raise')],
      ['Open Fold', (data) => namedCellFrom(data, 'huBb', 'vs Raise Fold')],
      ['Open 3Bet', (data) => namedCellFrom(data, 'huBb', 'vs Raise 3-Bet')]
    ],
    threeWBtn: [
      ['Hands', (data) => data?.meta?.player_hands, ''],
      ['VPIP', (data) => preCellFrom(data, 'VPIP', 'btn')],
      ['PFR', (data) => preCellFrom(data, 'PFR', 'btn')],
      ['RFI', (data) => preCellFrom(data, 'Raise First In', 'btn')],
      ['Limp', (data) => preCellFrom(data, 'Open Limp', 'btn')],
      ['3Bet', (data) => preCellFrom(data, '3-Bet', 'btn')],
      ['Fold3Bet', (data) => preCellFrom(data, 'Fold to 3-Bet', 'btn')]
    ],
    threeWSb: [
      ['Hands', (data) => data?.meta?.player_hands, ''],
      ['VPIP', (data) => preCellFrom(data, 'VPIP', 'sb_3w')],
      ['PFR', (data) => preCellFrom(data, 'PFR', 'sb_3w')],
      ['SB RFI', (data) => namedCellFrom(data, 'threeWayPreflop', 'SB RFI')],
      ['Complete', (data) => namedCellFrom(data, 'threeWayPreflop', 'SB Complete')],
      ['Call Open', (data) => preCellFrom(data, 'Call Open', 'sb_3w')],
      ['3Bet', (data) => preCellFrom(data, '3-Bet', 'sb_3w')]
    ],
    threeWBb: [
      ['Hands', (data) => data?.meta?.player_hands, ''],
      ['VPIP', (data) => preCellFrom(data, 'VPIP', 'bb_3w')],
      ['PFR', (data) => preCellFrom(data, 'PFR', 'bb_3w')],
      ['Fold Steal', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Fold')],
      ['Call Steal', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal Call')],
      ['3Bet Steal', (data) => namedCellFrom(data, 'threeWayPreflop', 'BB vs Steal 3-Bet')],
      ['Fold3Bet', (data) => preCellFrom(data, 'Fold to 3-Bet', 'bb_3w')]
    ]
  }

  return configs[spot] || []
}

const positionPanels = computed(() => [
  {
    id: 'hu-sb',
    title: 'HU SB',
    subtitle: 'Spot bouton/small blind en heads-up.',
    stats: [
      tile('VPIP', pre('VPIP', 'sb_hu'), 'HU SB'),
      tile('PFR', pre('PFR', 'sb_hu'), 'HU SB'),
      tile('Open Limp', namedValue(activeStats.value?.huSb, 'Open Limp'), 'HU SB'),
      tile('Raise First In', namedValue(activeStats.value?.huSb, 'Raise First In'), 'HU SB'),
      tile('Limp-Fold vs Raise', namedValue(activeStats.value?.huSb, 'Limp-Fold vs Raise'), 'HU SB'),
      tile('Limp-Raise vs Raise', namedValue(activeStats.value?.huSb, 'Limp-Raise vs Raise'), 'HU SB')
    ],
    stackHeaders: stackHeadersFor(positionStackConfig('huSb')),
    stackRows: stackRowsFor(positionStackConfig('huSb'))
  },
  {
    id: 'hu-bb',
    title: 'HU BB',
    subtitle: 'Defense de big blind en heads-up.',
    stats: [
      tile('VPIP', pre('VPIP', 'bb_hu'), 'HU BB'),
      tile('PFR', pre('PFR', 'bb_hu'), 'HU BB'),
      tile('vs Limp Check', namedValue(activeStats.value?.huBb, 'vs Limp Check'), 'HU BB'),
      tile('vs Limp Raise', namedValue(activeStats.value?.huBb, 'vs Limp Raise'), 'HU BB'),
      tile('vs Raise Fold', namedValue(activeStats.value?.huBb, 'vs Raise Fold'), 'HU BB'),
      tile('vs Raise 3-Bet', namedValue(activeStats.value?.huBb, 'vs Raise 3-Bet'), 'HU BB')
    ],
    stackHeaders: stackHeadersFor(positionStackConfig('huBb')),
    stackRows: stackRowsFor(positionStackConfig('huBb'))
  },
  {
    id: '3w-btn',
    title: '3W BTN',
    subtitle: 'Premier a parler en 3-way.',
    stats: [
      tile('VPIP', pre('VPIP', 'btn'), '3W BTN'),
      tile('PFR', pre('PFR', 'btn'), '3W BTN'),
      tile('Raise First In', pre('Raise First In', 'btn'), '3W BTN'),
      tile('Open Limp', pre('Open Limp', 'btn'), '3W BTN'),
      tile('3-Bet', pre('3-Bet', 'btn'), '3W BTN'),
      tile('Fold to 3-Bet', pre('Fold to 3-Bet', 'btn'), '3W BTN')
    ],
    stackHeaders: stackHeadersFor(positionStackConfig('threeWBtn')),
    stackRows: stackRowsFor(positionStackConfig('threeWBtn'))
  },
  {
    id: '3w-sb',
    title: '3W SB',
    subtitle: 'Small blind 3-way: complete, iso et defense.',
    stats: [
      tile('VPIP', pre('VPIP', 'sb_3w'), '3W SB'),
      tile('PFR', pre('PFR', 'sb_3w'), '3W SB'),
      tile('SB RFI', namedValue(activeStats.value?.threeWayPreflop, 'SB RFI'), '3W SB'),
      tile('SB Complete', namedValue(activeStats.value?.threeWayPreflop, 'SB Complete'), '3W SB'),
      tile('Call Open', pre('Call Open', 'sb_3w'), '3W SB'),
      tile('3-Bet', pre('3-Bet', 'sb_3w'), '3W SB')
    ],
    stackHeaders: stackHeadersFor(positionStackConfig('threeWSb')),
    stackRows: stackRowsFor(positionStackConfig('threeWSb'))
  },
  {
    id: '3w-bb',
    title: '3W BB',
    subtitle: 'Big blind 3-way face aux steals.',
    stats: [
      tile('VPIP', pre('VPIP', 'bb_3w'), '3W BB'),
      tile('PFR', pre('PFR', 'bb_3w'), '3W BB'),
      tile('BB vs Steal Fold', namedValue(activeStats.value?.threeWayPreflop, 'BB vs Steal Fold'), '3W BB'),
      tile('BB vs Steal Call', namedValue(activeStats.value?.threeWayPreflop, 'BB vs Steal Call'), '3W BB'),
      tile('BB vs Steal 3-Bet', namedValue(activeStats.value?.threeWayPreflop, 'BB vs Steal 3-Bet'), '3W BB'),
      tile('Fold to 3-Bet', pre('Fold to 3-Bet', 'bb_3w'), '3W BB')
    ],
    stackHeaders: stackHeadersFor(positionStackConfig('threeWBb')),
    stackRows: stackRowsFor(positionStackConfig('threeWBb'))
  }
])

const pushFoldRows = computed(() =>
  (activeStats.value?.pushFold || []).map((r) =>
    row(r, ['stack', 'position', 'spots', 'facing_shove', 'open_shove', 'iso_shove', 'rejam', 'call_shove', 'fold_vs_shove'])
  )
)

const postflopRows = computed(() =>
  (activeStats.value?.postflop || []).map((r) => row(r, ['stat', 'flop', 'turn', 'river']))
)

const postflopStackConfig = [
  ['Hands', (data) => data?.meta?.player_hands, ''],
  ['CBet F', (data) => postflopCellFrom(data, 'C-Bet', 'flop')],
  ['CBet T', (data) => postflopCellFrom(data, 'C-Bet', 'turn')],
  ['CBet R', (data) => postflopCellFrom(data, 'C-Bet', 'river')],
  ['FoldCB F', (data) => postflopCellFrom(data, 'Fold to CBet', 'flop')],
  ['FoldCB T', (data) => postflopCellFrom(data, 'Fold to CBet', 'turn')],
  ['FoldCB R', (data) => postflopCellFrom(data, 'Fold to CBet', 'river')],
  ['Agg F', (data) => postflopCellFrom(data, 'Agg Freq', 'flop')],
  ['Donk F', (data) => postflopCellFrom(data, 'Donk Bet', 'flop')]
]

const postflopStackHeaders = computed(() => stackHeadersFor(postflopStackConfig))
const postflopStackRows = computed(() => stackRowsFor(postflopStackConfig))

const vsCbetRows = computed(() =>
  (activeStats.value?.vsCbetFlop || []).map((r) => row(r, ['stat', 'fold', 'call', 'raise']))
)

const vsCbetStackConfig = [
  ['Hands', (data) => data?.meta?.player_hands, ''],
  ['SRP Fold', (data) => vsCbetCellFrom(data, 'Raised Pot', 'fold')],
  ['SRP Call', (data) => vsCbetCellFrom(data, 'Raised Pot', 'call')],
  ['SRP Raise', (data) => vsCbetCellFrom(data, 'Raised Pot', 'raise')],
  ['3BP Fold', (data) => vsCbetCellFrom(data, '3-Bet Pot', 'fold')],
  ['3BP Call', (data) => vsCbetCellFrom(data, '3-Bet Pot', 'call')],
  ['3BP Raise', (data) => vsCbetCellFrom(data, '3-Bet Pot', 'raise')]
]

const vsCbetStackHeaders = computed(() => stackHeadersFor(vsCbetStackConfig))
const vsCbetStackRows = computed(() => stackRowsFor(vsCbetStackConfig))

const missedCbetStackConfig = [
  ['Hands', (data) => data?.meta?.player_hands, ''],
  ['Miss CBet', (data) => objectCellFrom(data, 'missedCbet', 'missed_cbet')],
  ['Miss IP', (data) => objectCellFrom(data, 'missedCbet', 'ip')],
  ['Miss OOP', (data) => objectCellFrom(data, 'missedCbet', 'oop')],
  ['Bet Miss', (data) => objectCellFrom(data, 'vsMissedCbet', 'total')],
  ['Bet IP', (data) => objectCellFrom(data, 'vsMissedCbet', 'bet_ip')],
  ['Bet OOP T', (data) => objectCellFrom(data, 'vsMissedCbet', 'bet_oop_turn')]
]

const missedCbetStackHeaders = computed(() => stackHeadersFor(missedCbetStackConfig))
const missedCbetStackRows = computed(() => stackRowsFor(missedCbetStackConfig))

const showdownStackConfig = [
  ['Hands', (data) => data?.meta?.player_hands, ''],
  ['WTSD', (data) => objectCellFrom(data, 'showdown', 'wtsd')],
  ['W$SD', (data) => objectCellFrom(data, 'showdown', 'wsd')],
  ['WWSF', (data) => objectCellFrom(data, 'showdown', 'wwsf')]
]

const showdownStackHeaders = computed(() => stackHeadersFor(showdownStackConfig))
const showdownStackRows = computed(() => stackRowsFor(showdownStackConfig))

const missedCbet = computed(() => activeStats.value?.missedCbet || {})
const vsMissedCbet = computed(() => activeStats.value?.vsMissedCbet || {})

const openStat = (item) => {
  selectedStat.value = item
}

const loadStats = async () => {
  if (statsScope.value === 'player' && !selectedOpponent.value) {
    stats.value = null
    return
  }

  loading.value = true
  try {
    const { dateFrom, dateTo } = filterStore.getDateRangeParams()
    const buyInParam = buyIn.value === 'all' ? null : Number(buyIn.value)
    const res = await ipcService.getDetailedStats(
      heroName.value,
      dateFrom,
      dateTo,
      buyInParam,
      statsScope.value,
      statsScope.value === 'player' ? selectedOpponent.value : null
    )
    stats.value = res?.success ? (res.data || null) : null
  } finally {
    loading.value = false
  }
}

const loadOpponents = async () => {
  const res = await ipcService.getPlayers({ limit: 5000 })
  opponents.value = res?.success ? (Array.isArray(res.data) ? res.data : []) : []
  await filterStore.fetchAliases()
}

let statsTimeout = null
watch([heroName, buyIn, dateRange, customFrom, customTo, selectedSession, statsScope, selectedOpponent], () => {
  if (statsTimeout) clearTimeout(statsTimeout)
  statsTimeout = setTimeout(loadStats, 300)
}, { immediate: true })
watch(heroName, loadOpponents, { immediate: true })
watch(statsScope, (scope) => {
  if (scope !== 'player') selectedOpponent.value = null
})

const PopupPanel = defineComponent({
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' }
  },
  setup(props, { slots }) {
    return () =>
      h('section', { class: 'popup-panel' }, [
        h('div', { class: 'panel-title' }, [
          h('div', {}, [
            h('h2', {}, props.title),
            props.subtitle ? h('p', {}, props.subtitle) : null
          ])
        ]),
        h('div', { class: 'panel-body' }, slots.default?.())
      ])
  }
})

const StatTile = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number], default: null },
    suffix: { type: String, default: '%' },
    group: { type: String, default: '' },
    definition: { type: String, default: '' },
    tone: { type: String, default: '' }
  },
  emits: ['open'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        { class: ['stat-tile', props.tone], onClick: () => emit('open', props) },
        [
          h('span', { class: 'stat-label' }, props.label),
          h('strong', {}, props.value === null || props.value === undefined ? '--' : `${props.value}${props.suffix}`),
          h('small', {}, props.group || 'Detail')
        ]
      )
  }
})

const MiniStat = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: [String, Number], required: true },
    tone: { type: String, default: '' }
  },
  setup(props) {
    return () =>
      h('div', { class: ['mini-stat', props.tone] }, [
        h('span', {}, props.label),
        h('strong', {}, String(props.value))
      ])
  }
})

const HudMiniTable = defineComponent({
  props: {
    title: { type: String, required: true },
    headers: { type: Array, required: true },
    rows: { type: Array, required: true },
    colorful: { type: Boolean, default: false }
  },
  setup(props) {
    return () =>
      h('div', { class: 'hud-mini-table' }, [
        h('div', { class: 'hud-mini-title', style: { '--hud-mini-cols': props.headers.length } }, [
          h('span', { title: hudTooltip(props.title) }, props.title),
          ...props.headers.map((header) => h('strong', { title: hudTooltip(header) }, header))
        ]),
        h('div', { class: 'hud-mini-body' }, props.rows.map((row) =>
          h('div', { class: ['hud-mini-row', row.tone], style: { '--hud-mini-cols': props.headers.length } }, [
            h('span', { class: props.colorful ? row.tone : '', title: hudTooltip(row.label) }, row.label),
            ...row.values.map((value, idx) => {
              const key = row.label === 'Total' ? props.title : row.label
              const header = props.headers[idx]
              const toneKey = props.title.includes('vs') ? header : key
              return h('b', {
                class: [hudTone(toneKey, value), hasSampleHands(value) ? 'has-hand-samples' : ''],
                title: hudTooltip(toneKey, value),
                onClick: hasSampleHands(value) ? () => openStatHands(toneKey, value, `${props.title} / ${header}`) : undefined
              }, hudValue(value))
            })
          ])
        ))
      ])
  }
})

const HudStatLine = defineComponent({
  props: {
    row: { type: Object, required: true }
  },
  setup(props) {
    return () =>
      h('div', { class: 'hud-stat-line' }, [
        h('span', { title: hudTooltip(props.row.label) }, props.row.label),
        h('b', {
          class: [hudTone(props.row.label, props.row.threeMax), hasSampleHands(props.row.threeMax) ? 'has-hand-samples' : ''],
          title: hudTooltip(props.row.label, props.row.threeMax),
          onClick: hasSampleHands(props.row.threeMax) ? () => openStatHands(props.row.label, props.row.threeMax, '3-max') : undefined
        }, hudValue(props.row.threeMax)),
        h('b', {
          class: ['sb', hudTone(props.row.label, props.row.huSb), hasSampleHands(props.row.huSb) ? 'has-hand-samples' : ''],
          title: hudTooltip(props.row.label, props.row.huSb),
          onClick: hasSampleHands(props.row.huSb) ? () => openStatHands(props.row.label, props.row.huSb, 'HU SB') : undefined
        }, hudValue(props.row.huSb)),
        h('b', {
          class: ['bb', hudTone(props.row.label, props.row.huBb), hasSampleHands(props.row.huBb) ? 'has-hand-samples' : ''],
          title: hudTooltip(props.row.label, props.row.huBb),
          onClick: hasSampleHands(props.row.huBb) ? () => openStatHands(props.row.label, props.row.huBb, 'HU BB') : undefined
        }, hudValue(props.row.huBb))
      ])
  }
})

const HudMatrix = defineComponent({
  props: {
    headers: { type: Array, required: true },
    rows: { type: Array, required: true }
  },
  setup(props) {
    return () =>
      h('div', { class: 'hud-matrix-wrap' }, [
        h('table', { class: 'hud-matrix' }, [
          h('thead', {}, [
            h('tr', {}, props.headers.map((header, idx) => h('th', { class: idx === 0 ? 'left' : '', title: hudTooltip(header) }, header)))
          ]),
          h('tbody', {}, props.rows.map((r) =>
            h('tr', {}, r.map((cell, idx) =>
              h('td', {
                class: [idx === 0 ? 'left stack' : '', idx > 0 ? hudTone(props.headers[idx], cell) : '', idx > 0 && hasSampleHands(cell) ? 'has-hand-samples' : ''],
                title: idx > 0 ? hudTooltip(props.headers[idx], cell) : '',
                onClick: idx > 0 && hasSampleHands(cell) ? () => openStatHands(props.headers[idx], cell, r[0]) : undefined
              }, idx > 0 ? hudValue(cell) : (cell || '--'))
            ))
          ))
        ])
      ])
  }
})

const HudPostflopBox = defineComponent({
  props: {
    box: { type: Object, required: true }
  },
  setup(props) {
    return () =>
      h('div', { class: 'hud-postflop-box' }, [
        h('div', { class: 'hud-box-title' }, props.box.title),
        ...props.box.sections.map((section) =>
          h('div', { class: 'hud-box-section' }, [
            h('div', { class: 'hud-box-section-head', style: { '--hud-box-cols': section.headers.length } }, [
              h('span', { title: hudTooltip(section.title) }, section.title),
              ...section.headers.map((header) => h('strong', { title: hudTooltip(header) }, header))
            ]),
            ...section.rows.map((row) =>
              h('div', { class: 'hud-box-row', style: { '--hud-box-cols': section.headers.length } }, [
                h('span', { title: hudTooltip(row[0]) }, row[0]),
                ...row.slice(1).map((value, idx) =>
                  h('b', {
                    class: [hudTone(row[0], value), hasSampleHands(value) ? 'has-hand-samples' : ''],
                    title: hudTooltip(row[0], value),
                    onClick: hasSampleHands(value) ? () => openStatHands(row[0], value, `${props.box.title} / ${section.title} / ${section.headers[idx]}`) : undefined
                  }, hudValue(value))
                )
              ])
            )
          ])
        )
      ])
  }
})

const StatsTable = defineComponent({
  props: { headers: { type: Array, required: true }, rows: { type: Array, required: true } },
  setup(props) {
    return () =>
      h('div', { class: 'table-wrap' }, [
        h('table', {}, [
          h('thead', {}, [
            h('tr', {}, props.headers.map((header, idx) => h('th', { class: idx === 0 ? 'left' : '' }, header)))
          ]),
          h('tbody', {}, props.rows.map((r) =>
            h('tr', {}, r.map((cell, idx) => h('td', { class: idx === 0 ? 'left strong' : '' }, cell || '--')))
          ))
        ])
      ])
  }
})
onMounted(() => {
  filterStore.fetchAliases()
})
</script>

<style scoped>
.stats-page {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: #1e2433;
  color: #e5e7eb;
}

.hero-panel,
.filter-panel,
.popup-panel,
.state-card {
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: #252b3d;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-radius: 12px;
  padding: 16px;
  overflow: hidden;
}

.page-title-block {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(45, 212, 191, 0.2);
  background: rgba(45, 212, 191, 0.1);
  color: #2dd4bf;
  box-shadow: inset 0 1px 8px rgba(255, 255, 255, 0.04);
}

h1 {
  color: white;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.subtitle {
  max-width: 760px;
  margin-top: 2px;
  color: #6b7280;
  font-size: 12px;
}

.scope-summary {
  min-width: 128px;
  align-self: stretch;
  display: grid;
  place-content: center;
  border-radius: 10px;
  border: 1px solid rgba(45, 212, 191, 0.2);
  background: rgba(45, 212, 191, 0.08);
  text-align: center;
  padding: 8px 12px;
}

.scope-summary span,
.scope-summary small {
  color: #2dd4bf;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.scope-summary strong {
  color: white;
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
}

.filter-panel {
  border-radius: 16px;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 7px;
}

.field span {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.field select,
.field input {
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(75, 85, 99, 0.8);
  background: #1e2433;
  color: white;
  padding: 10px 12px;
  font-size: 14px;
}

.field select:focus,
.field input:focus {
  outline: none;
  border-color: rgba(45, 212, 191, 0.65);
  box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.25);
}

.player-field {
  grid-template-columns: 1fr;
}

.state-card {
  border-radius: 18px;
  padding: 24px;
  color: #d1d5db;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.positions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.positions-grid .popup-panel:first-child {
  grid-column: span 1;
}

.hud-popup-screen {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  width: 100%;
  min-width: 0;
  padding: 0;
  overflow: visible;
}

.hud-menu {
  position: sticky;
  top: 18px;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  background: #252b3d;
  padding: 10px;
  display: grid;
  align-content: start;
  gap: 6px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.18);
}

.hud-menu button {
  width: 100%;
  padding: 10px 12px;
  color: #9ca3af;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  transition: transform 160ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease;
}

.hud-menu button.active {
  color: #2dd4bf;
  border-color: rgba(45, 212, 191, 0.24);
  background: rgba(45, 212, 191, 0.1);
}

.hud-menu button:hover {
  color: white;
  background: #2d3548;
}

.general-popup {
  width: 100%;
  min-width: 0;
  margin: 0 0 12px;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(290px, 0.92fr);
  gap: 14px;
  padding: 0;
}

.spot-popup {
  --spot-accent: #2dd4bf;
  --spot-soft: rgba(45, 212, 191, 0.1);
  width: 100%;
  min-width: 0;
  margin: 0 0 12px;
  display: grid;
  gap: 16px;
  padding: 0;
}

.spot-popup.green {
  --spot-accent: #2dd4bf;
  --spot-soft: rgba(45, 212, 191, 0.1);
}

.spot-popup.cyan {
  --spot-accent: #2dd4bf;
  --spot-soft: rgba(45, 212, 191, 0.1);
}

.spot-popup.magenta {
  --spot-accent: #2dd4bf;
  --spot-soft: rgba(45, 212, 191, 0.1);
}

.spot-popup.purple {
  --spot-accent: #2dd4bf;
  --spot-soft: rgba(45, 212, 191, 0.1);
}

.spot-top {
  display: grid;
  grid-template-columns: 220px repeat(3, minmax(190px, 1fr));
  gap: 12px;
  align-items: start;
  padding: 0;
}

.spot-hands {
  display: grid;
  align-content: center;
  gap: 8px;
  min-height: 84px;
  border-radius: 14px;
  border: 1px solid rgba(45, 212, 191, 0.12);
  background: #252b3d;
  padding: 16px;
  color: #d1d5db;
  font-size: 14px;
}

.spot-hands strong {
  color: white;
  font-size: 34px;
  font-weight: 950;
  line-height: 0.95;
}

.spot-title {
  width: max-content;
  max-width: 100%;
  color: #2dd4bf;
  border-radius: 999px;
  border: 1px solid rgba(45, 212, 191, 0.2);
  background: rgba(45, 212, 191, 0.08);
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.spot-title.secondary {
  margin-top: 4px;
}

.spot-postflop {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.spot-postflop.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.spot-side-boxes {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.spot-popup:has(.spot-side-boxes) {
  padding-right: 0;
}

:deep(.hud-matrix-wrap) {
  overflow: visible;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: #252b3d;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
}

:deep(.hud-matrix) {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  font-size: 14px;
}

:deep(.hud-matrix th),
:deep(.hud-matrix td) {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: #d1d5db;
  text-align: right;
  white-space: nowrap;
}

:deep(.hud-matrix th) {
  color: #9ca3af;
  background: rgba(21, 27, 38, 0.85);
  border-bottom: 1px solid rgba(45, 212, 191, 0.14);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

:deep(.hud-matrix .left) {
  text-align: left;
}

:deep(.hud-matrix .stack) {
  color: #ffffff;
  font-weight: 850;
}

:deep(.hud-matrix td:nth-child(2)) {
  color: #2dd4bf;
}

:deep(.hud-postflop-box) {
  min-width: 0;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: #252b3d;
  overflow: hidden;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
}

:deep(.hud-box-title) {
  color: white;
  font-size: 13px;
  font-weight: 950;
  line-height: 1.1;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: #2d3548;
}

:deep(.hud-box-section) {
  padding-bottom: 8px;
}

:deep(.hud-box-section-head),
:deep(.hud-box-row) {
  display: grid;
  grid-template-columns: minmax(82px, 1fr) repeat(var(--hud-box-cols, 3), 38px);
  align-items: center;
  gap: 0;
  padding: 0 10px;
  font-size: 13px;
  line-height: 1.7;
}

:deep(.hud-box-section-head) {
  color: #e5e7eb;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

:deep(.hud-box-section-head span) {
  background: transparent;
  color: #d1d5db;
  font-weight: 900;
}

:deep(.hud-box-section-head strong) {
  color: #f2f2f2;
  font-weight: 500;
  text-align: right;
}

:deep(.hud-box-row span) {
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.hud-box-row b) {
  color: #f5f5f5;
  font-weight: 500;
  text-align: right;
}

:deep(.hud-aggro) {
  color: #ef4444 !important;
}

:deep(.hud-passive) {
  color: #22c55e !important;
}

:deep(.hud-average) {
  color: #facc15 !important;
}

.spot-popup :deep(.hud-mini-title) {
  border-bottom-color: rgba(45, 212, 191, 0.18);
}

.general-left,
.general-right {
  min-width: 0;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 16px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.16);
}

.general-left {
  background: #252b3d;
}

.general-right {
  background: #252b3d;
}

.total-block {
  border-radius: 14px;
  border: 1px solid rgba(45, 212, 191, 0.12);
  background: rgba(45, 212, 191, 0.06);
  padding: 14px;
  margin-bottom: 12px;
}

.total-title {
  color: #2dd4bf;
  font-size: 11px;
  font-weight: 950;
  text-align: left;
  margin-bottom: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.total-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 6px 0;
  color: #d1d5db;
  font-size: 14px;
}

.total-row strong {
  color: white;
  font-size: 20px;
  font-weight: 950;
}

:deep(.hud-mini-table) {
  margin-top: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: #1e2433;
  padding: 10px;
  overflow: hidden;
}

:deep(.hud-mini-title) {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) repeat(var(--hud-mini-cols, 3), 54px);
  border-bottom: 1px solid rgba(45, 212, 191, 0.14);
  color: #e5e7eb;
  font-size: 12px;
  font-weight: 950;
  line-height: 1.35;
  letter-spacing: -0.02em;
}

:deep(.hud-mini-title strong) {
  font-weight: 500;
  text-align: right;
}

:deep(.hud-mini-body) {
  padding-top: 8px;
}

:deep(.hud-mini-row) {
  display: grid;
  grid-template-columns: minmax(96px, 1fr) repeat(var(--hud-mini-cols, 3), 54px);
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.75;
}

:deep(.hud-mini-row b) {
  color: #f6f6f6;
  font-weight: 500;
  text-align: right;
}

:deep(.hud-mini-row .sb),
.hud-pos.sb,
:deep(.hud-stat-line .sb) {
  color: #5eead4;
}

:deep(.hud-mini-row .bb),
.hud-pos.bb,
:deep(.hud-stat-line .bb) {
  color: #2dd4bf;
}

.hud-columns {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) 52px 44px 44px;
  row-gap: 2px;
  align-items: end;
  margin-bottom: 10px;
  color: #9ca3af;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.hud-group,
.hud-pos {
  text-align: right;
}

.hu-group {
  grid-column: span 2;
}

.hud-stat-list {
  display: grid;
  gap: 7px;
}

.hud-stat-list.separated {
  margin-top: 18px;
}

:deep(.hud-stat-line) {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) 52px 44px 44px;
  gap: 6px;
  align-items: center;
  color: #94a3b8;
  border-radius: 10px;
  background: #1e2433;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 1.25;
}

:deep(.hud-stat-line span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.hud-stat-line b) {
  color: #f2f2f2;
  font-weight: 850;
  text-align: right;
}

.popup-panel {
  border-radius: 22px;
  overflow: hidden;
}

.panel-title {
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.panel-title h2 {
  color: white;
  font-size: 17px;
  font-weight: 950;
}

.panel-title p {
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
}

.panel-body {
  padding: 16px;
}

.stat-grid,
.sample-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.stat-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:deep(.stat-tile),
:deep(.mini-stat) {
  min-width: 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(2, 6, 23, 0.44);
  padding: 14px;
  overflow: hidden;
}

:deep(.stat-tile) {
  display: grid;
  gap: 6px;
  text-align: left;
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

:deep(.stat-tile:hover) {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(37, 99, 235, 0.13);
}

:deep(.stat-label),
:deep(.mini-stat span) {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

:deep(.stat-tile strong) {
  color: white;
  font-size: clamp(20px, 2.6vw, 25px);
  font-weight: 950;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

:deep(.stat-tile small) {
  color: #475569;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.2;
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

:deep(.mini-stat) {
  display: grid;
  gap: 4px;
}

:deep(.mini-stat strong) {
  color: white;
  font-size: clamp(16px, 2vw, 18px);
  font-weight: 900;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

:deep(.mini-stat.good strong) {
  color: #4ade80;
}

:deep(.mini-stat.warn strong) {
  color: #facc15;
}

:deep(.mini-stat.bad strong) {
  color: #fb7185;
}

:deep(.table-wrap) {
  overflow: visible;
}

:deep(table) {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 13px;
}

:deep(th),
:deep(td) {
  padding: 11px 10px;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(th) {
  color: #64748b;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

:deep(td) {
  color: #d1d5db;
}

:deep(.left) {
  text-align: left;
}

:deep(.strong) {
  color: white;
  font-weight: 850;
}

.stat-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(10px);
  padding: 20px;
}

.stat-modal {
  width: min(520px, 100%);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: #0f172a;
  padding: 24px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
}

.modal-close {
  float: right;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.stat-modal h2 {
  color: white;
  font-size: 28px;
  font-weight: 950;
}

.modal-value {
  margin: 14px 0;
  color: #60a5fa;
  font-size: 46px;
  font-weight: 950;
  line-height: 1;
}

.stat-modal p {
  color: #d1d5db;
  line-height: 1.6;
}

.modal-hint {
  margin-top: 16px;
  border-radius: 14px;
  background: rgba(96, 165, 250, 0.1);
  color: #bfdbfe;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 800;
}

:deep(.has-hand-samples) {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}

:deep(.has-hand-samples:hover) {
  filter: brightness(1.25);
}

.stat-hands-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  background: rgba(5, 8, 15, 0.78);
  backdrop-filter: blur(8px);
  padding: 18px;
}

.stat-hands-panel {
  width: min(1220px, 96vw);
  max-height: min(84vh, 820px);
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, #111827 0%, #0b1020 100%);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}

.stat-hands-header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 18px;
  align-items: start;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(37, 43, 61, 0.78);
}

.stat-hands-header h2 {
  color: #f8fafc;
  margin: 2px 0 6px;
  font-size: 22px;
  font-weight: 950;
}

.stat-hands-header p {
  max-width: 720px;
  margin: 0;
  color: #cbd5e1;
  line-height: 1.45;
}

.stat-hands-sample {
  min-width: 150px;
  border-radius: 16px;
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.16);
  padding: 12px 14px;
  text-align: right;
}

.stat-hands-sample strong {
  display: block;
  color: #38bdf8;
  font-size: 28px;
  line-height: 1;
}

.stat-hands-sample span {
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 800;
}

.empty-hands {
  padding: 38px;
  color: #94a3b8;
  text-align: center;
  font-weight: 800;
}

.stat-hands-table-wrap {
  overflow: auto;
}

.stat-hands-table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
  background: #050505;
}

.stat-hands-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px;
  background: #14100f;
  color: #f8fafc;
  font-size: 12px;
  letter-spacing: 0.03em;
  text-align: left;
  text-transform: uppercase;
}

.stat-hands-table td {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #dbeafe;
  vertical-align: middle;
  text-align: left;
}

.stat-hands-table tr:hover td {
  background: rgba(96, 165, 250, 0.08);
}

.card-row {
  min-width: 64px;
  display: flex;
  gap: 3px;
  align-items: center;
}

.card-row.board {
  min-width: 86px;
}

.card-tile {
  width: 31px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  color: #fff;
  font-weight: 950;
  font-size: 15px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.26);
}

.card-tile.heart {
  background: #ef1f2d;
}

.card-tile.diamond {
  background: #2563eb;
}

.card-tile.club {
  background: #10b85f;
}

.card-tile.spade {
  background: #6b7280;
}

.action-cell {
  max-width: 210px;
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profit-cell {
  font-weight: 950;
}

.profit-cell.win {
  color: #22c55e;
}

.profit-cell.loss {
  color: #ff3b4d;
}

.replay-button {
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(59, 130, 246, 0.18);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.32);
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
}

.replay-button:hover {
  background: rgba(59, 130, 246, 0.3);
  color: white;
}

@media (max-width: 1180px) {
  .content-grid,
  .positions-grid {
    grid-template-columns: 1fr;
  }

  .hud-popup-screen {
    grid-template-columns: 1fr;
  }

  .hud-menu {
    position: static;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .hud-menu button {
    text-align: center;
  }

  .spot-side-boxes {
    width: auto;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .stats-page {
    padding: 14px;
  }

  .hero-panel,
  .filter-panel {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .filter-panel,
  .stat-grid,
  .stat-grid.compact,
  .sample-grid {
    grid-template-columns: 1fr;
  }

  .hud-popup-screen {
    width: 100%;
    min-width: 0;
    padding: 0;
  }

  .hud-menu {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .general-popup,
  .spot-top,
  .spot-postflop,
  .spot-postflop.compact,
  .spot-side-boxes {
    grid-template-columns: 1fr;
  }

  .general-popup,
  .spot-popup {
    min-width: 0;
    width: 100%;
    padding: 0;
  }

  :deep(.hud-matrix) {
    min-width: 0;
    font-size: 12px;
  }

  :deep(.hud-matrix th),
  :deep(.hud-matrix td) {
    padding: 6px 7px;
  }
}
</style>



