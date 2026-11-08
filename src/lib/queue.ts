import type { Player, SessionState } from './types'

export const PLAYERS_PER_GAME = 4

export interface QueuedPlayer extends Player {
  /** 1-based position among waiting players (null while on court) */
  position: number | null
}

export interface QueueView {
  playing: QueuedPlayer[]
  upNext: QueuedPlayer[]
  waiting: QueuedPlayer[]
  total: number
}

/** Splits the players into NOW PLAYING / UP NEXT / WAITING, in FIFO order. */
export function splitQueue(players: Player[]): QueueView {
  const sorted = [...players].sort((a, b) => a.queue_pos - b.queue_pos)
  const playing = sorted
    .filter((p) => p.state === 'playing')
    .map((p) => ({ ...p, position: null }))
  const inLine = sorted
    .filter((p) => p.state === 'waiting')
    .map((p, i) => ({ ...p, position: i + 1 }))
  return {
    playing,
    upNext: inLine.slice(0, PLAYERS_PER_GAME),
    waiting: inLine.slice(PLAYERS_PER_GAME),
    total: players.length,
  }
}

export type GamePhase =
  | { kind: 'closed' }
  | { kind: 'playing'; round: number; short: boolean }
  | { kind: 'paused' }
  | { kind: 'ready' }
  | { kind: 'needPlayers'; missing: number }

/** One status for the whole session, used for the badge and banners. */
export function gamePhase(state: SessionState): GamePhase {
  const { session, current_round, players } = state
  if (session.status === 'closed') return { kind: 'closed' }
  if (current_round) {
    const onCourt = players.filter((p) => p.state === 'playing').length
    return { kind: 'playing', round: current_round.round_number, short: onCourt < PLAYERS_PER_GAME }
  }
  if (session.is_paused) return { kind: 'paused' }
  const waiting = players.filter((p) => p.state === 'waiting').length
  if (waiting >= PLAYERS_PER_GAME) return { kind: 'ready' }
  return { kind: 'needPlayers', missing: PLAYERS_PER_GAME - waiting }
}

/** What a specific player should see about themselves. */
export function describeMe(view: QueueView, playerId: string | null, gameRunning: boolean) {
  if (!playerId) return null
  const onCourt = view.playing.find((p) => p.id === playerId)
  if (onCourt) return { player: onCourt, text: "You're on court!", tone: 'playing' as const }
  const inLine = [...view.upNext, ...view.waiting].find((p) => p.id === playerId)
  if (!inLine || inLine.position === null) return null
  const pos = inLine.position
  if (pos <= PLAYERS_PER_GAME) {
    return {
      player: inLine,
      text: gameRunning ? "You're up next — get ready!" : "You're in the first group",
      tone: 'next' as const,
    }
  }
  const gamesAway = Math.ceil(pos / PLAYERS_PER_GAME) - (gameRunning ? 0 : 1)
  return {
    player: inLine,
    text: `About ${gamesAway} game${gamesAway === 1 ? '' : 's'} to wait`,
    tone: 'waiting' as const,
  }
}
