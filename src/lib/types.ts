export type PlayerState = 'waiting' | 'playing'

export interface Player {
  id: string
  name: string
  state: PlayerState
  queue_pos: number
  joined_at: string
}

export interface Session {
  id: string
  code: string
  name: string
  status: 'open' | 'closed'
  is_paused: boolean
  round_count: number
  version: number
  created_at: string
}

export interface Round {
  round_number: number
  player_names: string[]
  started_at: string
  ended_at?: string | null
}

export interface SessionState {
  session: Session
  players: Player[]
  current_round: Round | null
  recent_rounds: Round[]
}
