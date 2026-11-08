export type PlayerState = 'waiting' | 'playing'
/** fair_random: fewest games first, ties random · fifo: 4 off, 4 on */
export type RotationMode = 'fair_random' | 'fifo'

export interface Player {
  id: string
  name: string
  state: PlayerState
  queue_pos: number
  joined_at: string
  games_played: number
  /** 1-2 = team 1, 3-4 = team 2 while on court */
  court_slot: number | null
}

export interface Session {
  id: string
  code: string
  name: string
  status: 'open' | 'closed'
  is_paused: boolean
  round_count: number
  rotation_mode: RotationMode
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
