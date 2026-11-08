import { useState, type FormEvent } from 'react'
import type { describeMe } from '../lib/queue'
import { Button, Card, Field, inputClass } from './ui'

/** Shown before you join: name input + big Join button. */
export function JoinCard({
  defaultName, playerCount, onJoin, busy, error,
}: {
  defaultName: string
  playerCount: number
  onJoin: (name: string) => void
  busy: boolean
  error: string | null
}) {
  const [name, setName] = useState(defaultName)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onJoin(name)
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Your name"
          error={error}
          hint={playerCount === 0 ? 'Be the first one in line!' : `${playerCount} player${playerCount === 1 ? '' : 's'} already joined`}
        >
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            placeholder="e.g. Sam"
            aria-invalid={Boolean(error)}
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!name.trim()}>
          Join queue
        </Button>
      </form>
    </Card>
  )
}

/** Shown after you join: your status at a glance + Leave. */
export function MyStatusCard({
  info, onLeave, busy,
}: {
  info: NonNullable<ReturnType<typeof describeMe>>
  onLeave: () => void
  busy: boolean
}) {
  const playing = info.tone === 'playing'
  const next = info.tone === 'next'
  return (
    <Card
      className={
        playing ? 'bg-ball-400! ring-ball-600/30!'
        : next ? 'bg-court-700! text-white ring-0!'
        : ''
      }
    >
      <div className="flex items-center gap-4">
        <div
          className={`grid size-16 shrink-0 place-items-center rounded-2xl text-3xl font-black tabular-nums ${
            playing ? 'bg-court-800 text-ball-300' : next ? 'bg-ball-400 text-court-900' : 'bg-court-50 text-court-800'
          }`}
          aria-hidden="true"
        >
          {playing ? '🏓' : `#${info.player.position}`}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${next ? 'text-court-100' : 'text-court-800/80'}`}>
            {info.player.name}
          </p>
          <p className={`text-xl leading-tight font-bold ${playing ? 'text-court-900' : ''}`}>
            {playing ? info.text : `You're #${info.player.position} in line`}
          </p>
          {!playing && <p className={`text-sm ${next ? 'text-ball-300' : 'text-court-800/80'}`}>{info.text}</p>}
        </div>
      </div>
      <Button
        variant={next ? 'ghost' : 'outline'}
        size="sm"
        block
        className={`mt-4 ${next ? 'text-white! hover:bg-white/10!' : ''} ${playing ? 'bg-white/60!' : ''}`}
        onClick={onLeave}
        loading={busy}
      >
        Leave queue
      </Button>
    </Card>
  )
}
