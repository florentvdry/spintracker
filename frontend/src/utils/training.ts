/** Shapes and rules of the range quiz. "Wrong" only means "not what your range says". */

import type { HandMap, Response } from '@/utils/ranges'

/** Questions in one session. */
export const SESSION_LENGTH = 30

export type QuizSource = 'scenario' | 'program' | 'deviation'

export interface QuizChoice {
  actionId: number
  label: string
  color: string
  immediate: string
  response: Response
}

export interface QuizSeat {
  position: string
  isHero: boolean
  stackBb: number
  action: 'fold' | 'call' | 'raise' | 'allin' | null
  betBb: number
}

export interface QuizQuestion {
  scenarioId: number
  spotId: number
  name: string
  format: 'hu' | '3max'
  heroPosition: string
  line: string
  opponent: 'any' | 'reg'
  stackBb: number
  handClass: string
  cards: [string, string]
  choices: QuizChoice[]
  table: { potBb: number; seats: QuizSeat[] }
  source: QuizSource
  handId: string | null
}

export interface QuizVerdict {
  correct: boolean
  immediateCorrect: boolean
  /** Only judged when the action was right and the range plans an answer to a raise. */
  responseCorrect: boolean | null
  expectedActionId: number
  expectedResponse: Response | null
  answeredActionId: number
  handClass: string
  scenarioId: number
  hands: HandMap
  borderline: boolean
  neighbor: string | null
}

export interface SessionEntry {
  handClass: string
  correct: boolean
}

/** The answers to a raise the player can give, for the chosen action's range. */
export function responseOptions(choices: readonly QuizChoice[]): Exclude<Response, 'none'>[] {
  const planned = new Set(choices.map((c) => c.response))
  const options: Exclude<Response, 'none'>[] = ['call', 'fold']
  if (planned.has('allin')) options.push('allin')
  return options
}

/** Whether the chosen action asks for an answer to a raise before the answer can be sent. */
export function needsResponse(choice: QuizChoice | undefined): boolean {
  return choice !== undefined && choice.response !== 'none'
}

/** The choice a number key stands for (1 = first action). */
export function choiceForKey(key: string, choices: readonly QuizChoice[]): QuizChoice | undefined {
  const index = Number(key) - 1
  return Number.isInteger(index) && index >= 0 ? choices[index] : undefined
}

/** The answer to a raise a key stands for: C call, F fold, A all-in. */
export function responseForKey(key: string): Exclude<Response, 'none'> | undefined {
  switch (key.toLowerCase()) {
    case 'c':
      return 'call'
    case 'f':
      return 'fold'
    case 'a':
      return 'allin'
    default:
      return undefined
  }
}

/** Which part of a compound answer was wrong, for the correction. */
export function wrongPart(verdict: QuizVerdict): 'none' | 'action' | 'response' {
  if (verdict.correct) return 'none'
  return verdict.immediateCorrect ? 'response' : 'action'
}

export function score(session: readonly SessionEntry[]): { right: number; total: number } {
  return { right: session.filter((s) => s.correct).length, total: session.length }
}

/** The label of a seat: the position, plus "Reg" for a reg variant. */
export function seatLabel(position: string, opponent: 'any' | 'reg', isHero: boolean): string {
  return !isHero && opponent === 'reg' ? `${position} · Reg` : position
}

/** Whether a call in front of the hero is a limp (nobody raised before it). */
export function isLimp(seats: readonly QuizSeat[], seat: QuizSeat): boolean {
  const index = seats.indexOf(seat)
  return seat.action === 'call' && !seats.slice(0, index).some((s) => s.action === 'raise' || s.action === 'allin')
}
