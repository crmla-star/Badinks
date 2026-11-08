import type { GamePhase } from '../lib/queue'
import type { RotationMode } from '../lib/types'
import { Button, Card } from './ui'

interface Props {
  phase: GamePhase
  paused: boolean
  rotationMode: RotationMode
  onSetRotation: (mode: RotationMode) => void
  pending: string | null
  onStart: () => void
  onEnd: () => void
  onTogglePause: () => void
  onCopyOrganizerLink: () => void
  onReset: () => void
  onClose: () => void
}

export function OrganizerPanel(p: Props) {
  const busy = p.pending !== null
  const closed = p.phase.kind === 'closed'
  const playing = p.phase.kind === 'playing'

  return (
    <Card className="ring-2! ring-court-700/15!">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-court-700 uppercase">
          <KeyIcon /> Organizer
        </h2>
        <span className="text-xs font-medium text-court-700/70">Only you see this</span>
      </div>

      {!closed && (
        <>
          {p.phase.kind === 'playing' ? (
            <Button variant="court" size="lg" block onClick={p.onEnd} loading={p.pending === 'end'} disabled={busy}>
              End game {p.phase.round}
            </Button>
          ) : (
            <Button
              size="lg"
              block
              onClick={p.onStart}
              loading={p.pending === 'start'}
              disabled={busy || p.phase.kind !== 'ready'}
            >
              Start game
            </Button>
          )}
          <p className="mt-2 min-h-5 text-center text-sm text-court-800/75">
            {playing && (p.paused
              ? 'Queue paused: the next game won’t start automatically.'
              : p.rotationMode === 'fair_random'
                ? 'Ending starts the next 4: fewest games played first, with new teams.'
                : 'Ending moves these 4 to the back and starts the next 4.')}
            {p.phase.kind === 'needPlayers' && `Need ${p.phase.missing} more to start.`}
            {p.phase.kind === 'paused' && 'Resume the queue to start a game.'}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={p.onTogglePause} loading={p.pending === 'pause'} disabled={busy}>
              {p.paused ? 'Resume queue' : 'Pause queue'}
            </Button>
            <Button variant="outline" onClick={p.onCopyOrganizerLink}>
              Organizer link
            </Button>
          </div>
        </>
      )}

      <details className="group mt-4 rounded-2xl bg-court-50 px-4 py-1">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-court-800">
          Session settings
          <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div className="grid gap-2 pt-1 pb-4">
          {!closed && (
            <fieldset className="mb-2">
              <legend className="mb-2 text-sm font-semibold text-court-900">Rotation</legend>
              <div className="grid gap-2">
                {([
                  ['fair_random', 'Mix it up', 'Fewest games played goes next, ties at random. Teams change every game.'],
                  ['fifo', 'Classic 4 off, 4 on', 'The 4 who played go to the back, in order. Best for bigger groups.'],
                ] as const).map(([mode, title, desc]) => {
                  const on = p.rotationMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={on}
                      disabled={busy || on}
                      onClick={() => p.onSetRotation(mode)}
                      className={`rounded-xl p-3 text-left ring-1 ring-inset transition-colors ${
                        on ? 'bg-court-700 text-white ring-court-700' : 'bg-white text-court-900 ring-court-200 hover:bg-court-50'
                      } disabled:cursor-default`}
                    >
                      <span className="block font-semibold">{on ? '● ' : '○ '}{title}</span>
                      <span className={`block text-xs ${on ? 'text-court-100' : 'text-court-800/75'}`}>{desc}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-court-800/70">Changes apply when the current game ends.</p>
            </fieldset>
          )}
          <Button variant="danger" size="sm" onClick={p.onReset} disabled={busy}>
            {closed ? 'Reopen with empty queue' : 'Reset session (clear all players)'}
          </Button>
          {!closed && (
            <Button variant="danger" size="sm" onClick={p.onClose} disabled={busy}>
              Close session
            </Button>
          )}
          <p className="text-xs text-court-800/70">
            Tip: tap ↓ next to a player to move them back one spot, ✕ to remove them.
          </p>
        </div>
      </details>
    </Card>
  )
}

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3" />
  </svg>
)
