import { supabase } from './supabase'
import type { RotationMode, SessionState } from './types'

const MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: "We couldn't find that game. Check the code or link.",
  SESSION_CLOSED: 'This game session has been closed by the organizer.',
  NAME_TAKEN: 'That name is already in the queue. Try adding an initial.',
  INVALID_NAME: 'Please enter a name (up to 24 characters).',
  INVALID_SESSION_NAME: 'Please enter a session name (up to 40 characters).',
  SESSION_FULL: 'This session is full.',
  NOT_AUTHORIZED: "You don't have permission to do that.",
  INVALID_PIN: 'Wrong organizer PIN.',
  PIN_NOT_CONFIGURED: 'No organizer PIN is set up yet — see the README.',
  QUEUE_PAUSED: 'The queue is paused. Resume it first.',
  GAME_IN_PROGRESS: 'A game is already in progress.',
  NOT_ENOUGH_PLAYERS: 'Need at least 4 waiting players to start.',
  ROUND_ALREADY_ENDED: 'That game was already ended.',
  PLAYER_NOT_FOUND: 'That player is no longer in the queue.',
  PLAYER_IS_PLAYING: "That player is on court — they can't be skipped.",
  ALREADY_LAST: 'That player is already last in line.',
}

export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function toApiError(err: { message?: string } | null | undefined): ApiError {
  const code = err?.message ?? 'UNKNOWN'
  if (MESSAGES[code]) return new ApiError(code, MESSAGES[code])
  if (/fetch|network|Failed to/i.test(code)) {
    return new ApiError('NETWORK', "Can't reach the server. Check your connection and try again.")
  }
  return new ApiError('UNKNOWN', 'Something went wrong. Please try again.')
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw toApiError(e as Error)
  }
  if (res.error) throw toApiError(res.error)
  return res.data as T
}

export const api = {
  getState: (code: string) => rpc<SessionState | null>('get_session_state', { p_code: code }),

  createSession: (name: string, pin: string) =>
    rpc<{ code: string; admin_key: string }>('create_session', { p_name: name, p_pin: pin }),

  join: (code: string, name: string) =>
    rpc<{ player_id: string; player_token: string }>('join_queue', { p_code: code, p_name: name }),

  leave: (code: string, playerId: string, token: string) =>
    rpc<void>('leave_queue', { p_code: code, p_player_id: playerId, p_player_token: token }),

  verifyOrganizer: (code: string, key: string) =>
    rpc<boolean>('verify_organizer', { p_code: code, p_admin_key: key }),

  startGame: (code: string, key: string) => rpc<void>('start_game', { p_code: code, p_admin_key: key }),

  endGame: (code: string, key: string, round: number) =>
    rpc<{ next_started: boolean }>('end_game', { p_code: code, p_admin_key: key, p_round_number: round }),

  setPaused: (code: string, key: string, paused: boolean) =>
    rpc<void>('set_paused', { p_code: code, p_admin_key: key, p_paused: paused }),

  skipPlayer: (code: string, key: string, playerId: string) =>
    rpc<void>('skip_player', { p_code: code, p_admin_key: key, p_player_id: playerId }),

  removePlayer: (code: string, key: string, playerId: string) =>
    rpc<void>('remove_player', { p_code: code, p_admin_key: key, p_player_id: playerId }),

  setRotationMode: (code: string, key: string, mode: RotationMode) =>
    rpc<void>('set_rotation_mode', { p_code: code, p_admin_key: key, p_mode: mode }),

  resetSession: (code: string, key: string) => rpc<void>('reset_session', { p_code: code, p_admin_key: key }),

  closeSession: (code: string, key: string) => rpc<void>('close_session', { p_code: code, p_admin_key: key }),
}

/** Errors that just mean "someone already did this" — safe to ignore after a refresh. */
export const BENIGN_ERRORS = new Set(['ROUND_ALREADY_ENDED', 'GAME_IN_PROGRESS', 'PLAYER_NOT_FOUND'])
