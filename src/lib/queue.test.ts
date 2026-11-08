import { describe, expect, it } from 'vitest'
import { describeMe, gamePhase, splitQueue } from './queue'
import type { Player, SessionState } from './types'

const mk = (name: string, pos: number, state: Player['state'] = 'waiting'): Player => ({
  id: name, name, state, queue_pos: pos, joined_at: '',
})

const session = (over: Partial<SessionState['session']> = {}): SessionState['session'] => ({
  id: 's', code: 'ABCDEF', name: 'Test', status: 'open', is_paused: false,
  round_count: 0, version: 1, created_at: '', ...over,
})

describe('splitQueue', () => {
  it('orders by queue position and splits playing / up next / waiting', () => {
    const players = [
      mk('I', 9), mk('A', 1, 'playing'), mk('E', 5), mk('B', 2, 'playing'),
      mk('C', 3, 'playing'), mk('D', 4, 'playing'), mk('F', 6), mk('G', 7), mk('H', 8),
    ]
    const v = splitQueue(players)
    expect(v.playing.map((p) => p.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(v.upNext.map((p) => p.name)).toEqual(['E', 'F', 'G', 'H'])
    expect(v.waiting.map((p) => [p.name, p.position])).toEqual([['I', 5]])
    expect(v.upNext[0].position).toBe(1)
    expect(v.total).toBe(9)
  })

  it('handles rotated positions (finished players at the back)', () => {
    // after round 1: A-D moved behind I
    const v = splitQueue([
      mk('E', 5, 'playing'), mk('F', 6, 'playing'), mk('G', 7, 'playing'), mk('H', 8, 'playing'),
      mk('I', 9), mk('A', 10), mk('B', 11), mk('C', 12), mk('D', 13),
    ])
    expect(v.upNext.map((p) => p.name)).toEqual(['I', 'A', 'B', 'C'])
    expect(v.waiting.map((p) => p.name)).toEqual(['D'])
  })

  it('handles an empty queue', () => {
    expect(splitQueue([])).toEqual({ playing: [], upNext: [], waiting: [], total: 0 })
  })
})

describe('gamePhase', () => {
  it('needs players when fewer than four are waiting', () => {
    expect(gamePhase({ session: session(), players: [mk('A', 1)], current_round: null, recent_rounds: [] }))
      .toEqual({ kind: 'needPlayers', missing: 3 })
  })
  it('is ready with four waiting', () => {
    const players = ['A', 'B', 'C', 'D'].map((n, i) => mk(n, i + 1))
    expect(gamePhase({ session: session(), players, current_round: null, recent_rounds: [] }).kind).toBe('ready')
  })
  it('reports paused, playing and closed', () => {
    const base = { players: [], current_round: null, recent_rounds: [] }
    expect(gamePhase({ ...base, session: session({ is_paused: true }) }).kind).toBe('paused')
    expect(gamePhase({ ...base, session: session({ status: 'closed' }) }).kind).toBe('closed')
    expect(gamePhase({
      ...base, session: session(), players: [mk('A', 1, 'playing')],
      current_round: { round_number: 3, player_names: ['A'], started_at: '' },
    })).toEqual({ kind: 'playing', round: 3, short: true })
  })
})

describe('describeMe', () => {
  const v = splitQueue([
    mk('A', 1, 'playing'), mk('B', 2, 'playing'), mk('C', 3, 'playing'), mk('D', 4, 'playing'),
    ...'EFGHIJKLM'.split('').map((n, i) => mk(n, i + 5)),
  ])
  it('knows when you are playing, next, or waiting', () => {
    expect(describeMe(v, 'A', true)?.tone).toBe('playing')
    expect(describeMe(v, 'E', true)?.tone).toBe('next')
    expect(describeMe(v, 'I', true)?.text).toBe('About 2 games to wait')
    expect(describeMe(v, 'M', true)?.text).toBe('About 3 games to wait')
    expect(describeMe(v, 'nobody', true)).toBeNull()
    expect(describeMe(v, null, true)).toBeNull()
  })
})

describe('normalizeSupabaseUrl', async () => {
  const { normalizeSupabaseUrl } = await import('./supabase')
  it('accepts common paste variants', () => {
    for (const v of [
      'https://abc.supabase.co', 'abc.supabase.co', '  https://abc.supabase.co/ ', '"https://abc.supabase.co"',
      'https://abc.supabase.co/rest/v1/',
    ]) expect(normalizeSupabaseUrl(v)).toBe('https://abc.supabase.co')
  })
  it('rejects garbage', () => {
    expect(normalizeSupabaseUrl('')).toBeNull()
    expect(normalizeSupabaseUrl(undefined)).toBeNull()
    expect(normalizeSupabaseUrl('eyJhbGciOi')).toBeNull()
    expect(normalizeSupabaseUrl('not a url')).toBeNull()
  })
})
