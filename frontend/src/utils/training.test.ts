import { describe, expect, it } from 'vitest'
import { choiceForKey, isLimp, needsResponse, responseForKey, responseOptions, score, seatLabel, wrongPart, type QuizChoice, type QuizSeat, type QuizVerdict } from './training'

const choice = (actionId: number, response: QuizChoice['response'] = 'none'): QuizChoice => ({ actionId, label: `A${actionId}`, color: '#5b8def', immediate: 'raise', response })

const verdict = (over: Partial<QuizVerdict>): QuizVerdict => ({
  correct: false,
  immediateCorrect: false,
  responseCorrect: null,
  expectedActionId: 1,
  expectedResponse: null,
  answeredActionId: 2,
  handClass: 'K9o',
  scenarioId: 1,
  hands: {},
  borderline: false,
  neighbor: null,
  ...over,
})

describe('answering', () => {
  const choices = [choice(1), choice(2, 'fold'), choice(3)]

  it('maps number keys to actions and letters to answers', () => {
    expect(choiceForKey('2', choices)?.actionId).toBe(2)
    expect(choiceForKey('9', choices)).toBeUndefined()
    expect(choiceForKey('0', choices)).toBeUndefined()
    expect(choiceForKey('x', choices)).toBeUndefined()
    expect(responseForKey('C')).toBe('call')
    expect(responseForKey('f')).toBe('fold')
    expect(responseForKey('z')).toBeUndefined()
  })

  it('asks for an answer to a raise only when the action plans one', () => {
    expect(needsResponse(choices[1])).toBe(true)
    expect(needsResponse(choices[0])).toBe(false)
    expect(needsResponse(undefined)).toBe(false)
  })

  it('offers all-in only when a range plans it', () => {
    expect(responseOptions(choices)).toEqual(['call', 'fold'])
    expect(responseOptions([choice(4, 'allin')])).toEqual(['call', 'fold', 'allin'])
  })

  it('says which part of a compound answer was wrong', () => {
    expect(wrongPart(verdict({ correct: true, immediateCorrect: true }))).toBe('none')
    expect(wrongPart(verdict({ immediateCorrect: true, responseCorrect: false }))).toBe('response')
    expect(wrongPart(verdict({}))).toBe('action')
  })
})

describe('the session and the table', () => {
  it('scores right answers over all answers', () => {
    expect(score([{ handClass: 'AA', correct: true }, { handClass: '72o', correct: false }, { handClass: 'KK', correct: true }])).toEqual({ right: 2, total: 3 })
    expect(score([])).toEqual({ right: 0, total: 0 })
  })

  it('marks the seats of a reg variant but never the hero', () => {
    expect(seatLabel('SB', 'reg', false)).toBe('SB · Reg')
    expect(seatLabel('BB', 'reg', true)).toBe('BB')
    expect(seatLabel('SB', 'any', false)).toBe('SB')
  })

  it('tells a limp from a call', () => {
    const seat = (position: string, action: QuizSeat['action']): QuizSeat => ({ position, isHero: false, stackBb: 10, action, betBb: 1 })
    const limp = [seat('BTN', 'fold'), seat('SB', 'call')]
    expect(isLimp(limp, limp[1])).toBe(true)
    const call = [seat('BTN', 'raise'), seat('SB', 'call')]
    expect(isLimp(call, call[1])).toBe(false)
  })
})
