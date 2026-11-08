import type { ReactNode } from 'react'
import type { GamePhase, QueuedPlayer, QueueView } from '../lib/queue'
import { PLAYERS_PER_GAME } from '../lib/queue'
import { Card, SectionLabel } from './ui'

interface AdminRowActions {
  onSkip: (p: QueuedPlayer) => void
  onRemove: (p: QueuedPlayer) => void
  busy: boolean
}

interface Props {
  view: QueueView
  phase: GamePhase
  meId: string | null
  admin: AdminRowActions | null
}

export function QueueBoard({ view, phase, meId, admin }: Props) {
  return (
    <div className="space-y-4">
      <NowPlaying view={view} phase={phase} meId={meId} admin={admin} />

      <Card className="bg-ball-200! ring-ball-400/50!">
        <SectionLabel count={view.upNext.length}>Up next</SectionLabel>
        {view.upNext.length === 0 ? (
          <Empty>No one waiting yet. Share the link to fill the court!</Empty>
        ) : (
          <ol className="space-y-2">
            {view.upNext.map((p) => (
              <PlayerRow key={p.id} player={p} me={p.id === meId} admin={admin} tone="next" />
            ))}
          </ol>
        )}
        {view.upNext.length > 0 && view.upNext.length < PLAYERS_PER_GAME && (
          <p className="mt-3 text-sm font-medium text-court-800">
            {PLAYERS_PER_GAME - view.upNext.length} more needed for the next game
          </p>
        )}
      </Card>

      <Card>
        <SectionLabel count={view.waiting.length}>Waiting</SectionLabel>
        {view.waiting.length === 0 ? (
          <Empty>Nobody else in line.</Empty>
        ) : (
          <ol className="space-y-2">
            {view.waiting.map((p) => (
              <PlayerRow key={p.id} player={p} me={p.id === meId} admin={admin} tone="waiting" />
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}

function NowPlaying({ view, phase, meId, admin }: Props) {
  const seats = Array.from({ length: PLAYERS_PER_GAME }, (_, i) => view.playing[i] ?? null)
  const active = phase.kind === 'playing'

  return (
    <section
      aria-label="Now playing"
      className="overflow-hidden rounded-3xl bg-court-800 p-5 text-white shadow-lg shadow-court-900/20"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-ball-300 uppercase">
          {active && <span className="size-2.5 animate-pulse rounded-full bg-ball-400" aria-hidden="true" />}
          Now playing
        </h2>
        {active && <span className="text-sm font-semibold text-court-100">Game {phase.round}</span>}
      </div>

      {active ? (
        <>
          <ul className="court-lines grid grid-cols-2 gap-px overflow-hidden rounded-2xl border-2 border-white/30 bg-court-600">
            {seats.map((p, i) => (
              <li key={p?.id ?? `empty-${i}`} className="flex min-h-20 items-center justify-between gap-1 p-3">
                {p ? (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate text-xl font-bold leading-tight">{p.name}</span>
                      {p.id === meId && (
                        <span className="mt-1 inline-block rounded-full bg-ball-400 px-2 py-0.5 text-xs font-bold text-court-900">You</span>
                      )}
                    </span>
                    {admin && (
                      <IconButton label={`Remove ${p.name}`} onClick={() => admin.onRemove(p)} disabled={admin.busy} light>
                        <XIcon />
                      </IconButton>
                    )}
                  </>
                ) : (
                  <span className="text-base font-medium text-court-100/70">Open seat</span>
                )}
              </li>
            ))}
          </ul>
          {phase.short && (
            <p className="mt-3 text-sm text-court-100">
              A seat is open — the next player to join fills it automatically.
            </p>
          )}
        </>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-white/25 px-4 py-6 text-center">
          <p className="text-xl font-bold">{idleTitle(phase)}</p>
          <p className="mt-1 text-court-100">{idleBody(phase)}</p>
        </div>
      )}
    </section>
  )
}

function idleTitle(phase: GamePhase) {
  switch (phase.kind) {
    case 'closed': return 'Session closed'
    case 'paused': return 'Queue paused'
    case 'ready': return 'Court is free'
    case 'needPlayers': return 'Waiting for players'
    default: return ''
  }
}

function idleBody(phase: GamePhase) {
  switch (phase.kind) {
    case 'closed': return 'Thanks for playing!'
    case 'paused': return 'The organizer will resume the rotation soon.'
    case 'ready': return 'Waiting for the organizer to start the game.'
    case 'needPlayers':
      return `Need ${phase.missing} more player${phase.missing === 1 ? '' : 's'} to start a game.`
    default: return ''
  }
}

function PlayerRow({
  player, me, admin, tone,
}: { player: QueuedPlayer; me: boolean; admin: AdminRowActions | null; tone: 'next' | 'waiting' }) {
  return (
    <li
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ${
        me ? 'bg-court-700 text-white' : tone === 'next' ? 'bg-white/70' : 'bg-court-50'
      }`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-bold tabular-nums ${
          me ? 'bg-ball-400 text-court-900' : tone === 'next' ? 'bg-court-700 text-white' : 'bg-white text-court-800 ring-1 ring-court-200'
        }`}
        aria-label={`Position ${player.position}`}
      >
        {player.position}
      </span>
      <span className="min-w-0 flex-1 truncate text-lg font-semibold">
        {player.name}
        {me && <span className="ml-2 rounded-full bg-ball-400 px-2 py-0.5 align-middle text-xs font-bold text-court-900">You</span>}
      </span>
      {admin && (
        <span className="flex shrink-0 gap-1">
          <IconButton label={`Move ${player.name} back one spot`} onClick={() => admin.onSkip(player)} disabled={admin.busy} light={me}>
            <DownIcon />
          </IconButton>
          <IconButton label={`Remove ${player.name}`} onClick={() => admin.onRemove(player)} disabled={admin.busy} light={me}>
            <XIcon />
          </IconButton>
        </span>
      )}
    </li>
  )
}

function IconButton({
  label, onClick, disabled, light, children,
}: { label: string; onClick: () => void; disabled?: boolean; light?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors disabled:opacity-40 ${
        light ? 'text-white/80 hover:bg-white/15' : 'text-court-700 hover:bg-court-100'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl px-1 py-2 text-court-800/70">{children}</p>
}

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const DownIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
)
