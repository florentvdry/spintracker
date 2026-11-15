import { create } from 'zustand'
import { ipcService } from '@/services/ipcService'
import type { Response } from '@/utils/ranges'
import { logError } from '@/utils/log'
import { SESSION_LENGTH, type QuizQuestion, type QuizSource, type QuizVerdict, type SessionEntry } from '@/utils/training'

interface TrainingState {
  source: QuizSource
  spotId: number | null
  programId: number | null
  /** Restricts the "my deviations" source to one range. */
  deviationScenarioId: number | null
  prioritizeBorderline: boolean
  question: QuizQuestion | null
  verdict: QuizVerdict | null
  /** The action and the answer to a raise given on the current question. */
  pickedActionId: number | null
  pickedResponse: Response | null
  session: SessionEntry[]
  /** Questions answered in this session, wrapping at the session length. */
  answered: number
  loading: boolean
  /** The source holds nothing to ask. */
  empty: boolean
  setSource: (source: QuizSource, options?: { spotId?: number | null; programId?: number | null; scenarioId?: number | null }) => void
  setPrioritizeBorderline: (value: boolean) => void
  pick: (actionId: number) => void
  pickResponse: (response: Response) => void
  /** Draws the next question. */
  next: (heroName: string | null) => Promise<void>
  /** Sends the answer, when it is complete. */
  submit: (heroName: string | null) => Promise<void>
}

// Only the answer to the latest request is kept.
let questionRequest = 0

export const useTrainingStore = create<TrainingState>((set, get) => ({
  source: 'program',
  spotId: null,
  programId: null,
  deviationScenarioId: null,
  prioritizeBorderline: true,
  question: null,
  verdict: null,
  pickedActionId: null,
  pickedResponse: null,
  session: [],
  answered: 0,
  loading: false,
  empty: false,

  setSource: (source, options = {}) =>
    set({
      source,
      spotId: options.spotId ?? get().spotId,
      programId: options.programId ?? get().programId,
      deviationScenarioId: source === 'deviation' ? (options.scenarioId ?? null) : null,
      question: null,
      verdict: null,
      session: [],
      answered: 0,
    }),

  setPrioritizeBorderline: (value) => set({ prioritizeBorderline: value }),
  pick: (actionId) => set({ pickedActionId: actionId, pickedResponse: null }),
  pickResponse: (response) => set({ pickedResponse: response }),

  next: async (heroName) => {
    const request = ++questionRequest
    const { source, spotId, programId, deviationScenarioId, prioritizeBorderline, answered } = get()
    set({ loading: true, verdict: null, pickedActionId: null, pickedResponse: null, answered: answered >= SESSION_LENGTH ? 0 : answered, session: answered >= SESSION_LENGTH ? [] : get().session })
    try {
      const result = await ipcService.getQuizQuestion({ source, spotId, programId, scenarioId: deviationScenarioId, heroName, prioritizeBorderline })
      if (request !== questionRequest) return
      const question = result.success && result.data ? (result.data as QuizQuestion) : null
      set({ question, empty: question === null })
    } catch (error) {
      logError('Failed to draw a quiz question:', error)
    } finally {
      if (request === questionRequest) set({ loading: false })
    }
  },

  submit: async () => {
    const { question, pickedActionId, pickedResponse, verdict } = get()
    if (!question || pickedActionId === null || verdict) return
    const result = await ipcService.checkQuizAnswer({
      scenarioId: question.scenarioId,
      handClass: question.handClass,
      source: question.source,
      handId: question.handId,
      answerActionId: pickedActionId,
      answerResponse: pickedResponse,
    })
    if (!result.success) return
    const answer = result.data as QuizVerdict
    set((state) => ({
      verdict: answer,
      session: [...state.session, { handClass: answer.handClass, correct: answer.correct }],
      answered: state.answered + 1,
    }))
  },
}))
