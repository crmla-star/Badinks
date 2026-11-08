import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ConfirmDialog, type ConfirmRequest } from '../components/ConfirmDialog'
import { OrganizerPanel } from '../components/OrganizerPanel'
import { JoinCard, MyStatusCard } from '../components/PlayerCard'
import { QueueBoard } from '../components/QueueBoard'
import { Button, Card, Logo, Spinner } from '../components/ui'
import { useAction } from '../hooks/useAction'
import { useSessionState, type LiveStatus } from '../hooks/useSessionState'
import { api, type ApiError } from '../lib/api'
import { describeMe, gamePhase, splitQueue, type GamePhase } from '../lib/queue'
import { navigate, sessionUrl } from '../lib/router'
import { copyLink, shareLink } from '../lib/share'
import { storage, type MyPlayer } from '../lib/storage'
import { showToast } from '../lib/toast'

export function SessionPage({ code }: { code: string }) {
  const { state, status, error, live, refresh, fetchedAt } = useSessionState(code)
  const { pending, run, fire } = useAction(refresh)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [savedMe, setMe] = useState<(MyPlayer & { since: number }) | null>(() => {
    const p = storage.getPlayer(code)
    return p ? { ...p, since: 0 } : null
  })
  const adminKey = useOrganizerKey(code)

  // If our saved player is gone (removed, reset), forget it — but only judge
  // using a snapshot fetched AFTER we joined.
  const meGone = Boolean(
    state && savedMe && fetchedAt > savedMe.since && !state.players.some((p) => p.id === savedMe.id),
  )
  const me = meGone ? null : savedMe
  useEffect(() => {
    if (!meGone) return
    storage.setPlayer(code, null)
    showToast("You're no longer in the queue.", 'info')
  }, [meGone, code])

  const view = useMemo(() => splitQueue(state?.players ?? []), [state])

  if (status === 'loading') return <FullScreen><Spinner className="size-8 text-court-700" /></FullScreen>
  if (status === 'notFound') {
    return (
      <FullScreen>
        <Card className="max-w-sm text-center">
          <p className="text-xl font-bold">Game not found</p>
          <p className="mt-2 text-court-800/75">The code <b>{code}</b> doesn't match any game session.</p>
          <Button className="mt-5" block onClick={() => navigate('/')}>Go home</Button>
        </Card>
      </FullScreen>
    )
  }
  if (status === 'error' || !state) {
    return (
      <FullScreen>
        <Card className="max-w-sm text-center">
          <p className="text-xl font-bold">Couldn't load the game</p>
          <p className="mt-2 text-court-800/75">{error}</p>
          <Button className="mt-5" block onClick={() => void refresh()}>Try again</Button>
        </Card>
      </FullScreen>
    )
  }

  const { session } = state
  const phase = gamePhase(state)
  const closed = session.status === 'closed'
  const myInfo = describeMe(view, me?.id ?? null, phase.kind === 'playing')

  const join = async (name: string) => {
    setJoinError(null)
    try {
      const since = Date.now()
      const res = await run('join', () => api.join(code, name), undefined, ['NAME_TAKEN', 'INVALID_NAME'])
      if (!res) return
      const p = { id: res.player_id, token: res.player_token, name: name.trim() }
      storage.setPlayer(code, p)
      storage.setLastName(p.name)
      setMe({ ...p, since })
      showToast(`You're in, ${p.name}!`, 'success')
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'NAME_TAKEN' || err.code === 'INVALID_NAME') setJoinError(err.message)
    }
  }

  const leave = () =>
    setConfirm({
      title: 'Leave the queue?',
      body: "You'll lose your spot. You can rejoin later at the back of the line.",
      confirmLabel: 'Leave',
      onConfirm: () => {
        if (!me) return
        fire('leave', async () => {
          await api.leave(code, me.id, me.token)
          storage.setPlayer(code, null)
          setMe(null)
        }, 'You left the queue')
      },
    })

  const admin = adminKey
    ? {
        busy: pending !== null,
        onSkip: (p: { id: string; name: string }) =>
          fire('skip', () => api.skipPlayer(code, adminKey, p.id), `${p.name} moved back one spot`),
        onRemove: (p: { id: string; name: string }) =>
          setConfirm({
            title: `Remove ${p.name}?`,
            body: `${p.name} will be taken out of the queue. They can rejoin at the back.`,
            confirmLabel: 'Remove',
            onConfirm: () => fire('remove', () => api.removePlayer(code, adminKey, p.id), `${p.name} removed`),
          }),
      }
    : null

  return (
    <div className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28 lg:max-w-5xl">
      <header className="flex items-center justify-between">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }} aria-label="Badinks home">
          <Logo />
        </a>
        <LiveBadge live={live} />
      </header>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Lobby column */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl leading-tight font-black tracking-tight break-words">{session.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <PhaseBadge phase={phase} />
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-court-800 ring-1 ring-court-200">
                {view.total} player{view.total === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-white px-3 py-1 font-mono font-semibold tracking-widest text-court-800 ring-1 ring-court-200">
                {session.code}
              </span>
            </div>
          </div>

          {!closed && (
            <Button variant="outline" block onClick={() => void shareLink(sessionUrl(code), session.name)}>
              <ShareIcon /> Share game link
            </Button>
          )}

          {closed && (
            <Card className="bg-court-50!">
              <p className="font-bold">This session is closed.</p>
              <p className="text-court-800/75">Joining is turned off. Thanks for playing!</p>
            </Card>
          )}

          {adminKey && (
            <OrganizerPanel
              phase={phase}
              paused={session.is_paused}
              pending={pending}
              onStart={() => fire('start', () => api.startGame(code, adminKey), 'Game on! 🎉')}
              onEnd={() => {
                const round = state.current_round?.round_number
                if (round === undefined) return
                fire('end', async () => {
                  const r = await api.endGame(code, adminKey, round)
                  showToast(r.next_started ? 'Next four are on court!' : 'Game ended', 'success')
                })
              }}
              onTogglePause={() =>
                fire('pause', () => api.setPaused(code, adminKey, !session.is_paused),
                  session.is_paused ? 'Queue resumed' : 'Queue paused')
              }
              onCopyOrganizerLink={() =>
                void copyLink(`${sessionUrl(code)}#key=${encodeURIComponent(adminKey)}`,
                  'Organizer link copied — keep it private!')
              }
              onReset={() =>
                setConfirm({
                  title: 'Reset this session?',
                  body: 'Everyone will be removed from the queue and the current game ends. This cannot be undone.',
                  confirmLabel: 'Reset',
                  onConfirm: () => fire('reset', () => api.resetSession(code, adminKey), 'Session reset'),
                })
              }
              onClose={() =>
                setConfirm({
                  title: 'Close this session?',
                  body: 'The current game ends and nobody can join anymore. You can reopen it later with Reset.',
                  confirmLabel: 'Close session',
                  onConfirm: () => fire('close', () => api.closeSession(code, adminKey), 'Session closed'),
                })
              }
            />
          )}
          {!closed && (myInfo ? (
            <MyStatusCard info={myInfo} onLeave={leave} busy={pending === 'leave'} />
          ) : (
            <JoinCard
              defaultName={storage.getLastName()}
              playerCount={view.total}
              onJoin={(n) => void join(n)}
              busy={pending === 'join'}
              error={joinError}
            />
          ))}

        </div>

        {/* Live queue column */}
        <div className="mt-6 lg:mt-0">
          <QueueBoard view={view} phase={phase} meId={me?.id ?? null} admin={admin} />

          {state.recent_rounds.length > 0 && (
            <details className="mt-4 rounded-3xl bg-white px-5 py-1 ring-1 ring-court-900/5">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold text-court-800">
                Recent games
                <span aria-hidden="true">▾</span>
              </summary>
              <ol className="space-y-2 pb-4">
                {state.recent_rounds.map((r) => (
                  <li key={r.round_number} className="text-sm">
                    <span className="font-bold text-court-800">Game {r.round_number}:</span>{' '}
                    <span className="text-court-900/80">{r.player_names.join(', ') || '—'}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

/**
 * Organizer key: taken from the private organizer link (#key=...) or from this
 * device's storage, then verified with the server. The server re-checks it on
 * every organizer action, so this only decides whether to show the panel.
 */
function useOrganizerKey(code: string) {
  const [key, setKey] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.hash.slice(1)).get('key')
    if (fromUrl) {
      storage.setAdminKey(code, fromUrl)
      window.history.replaceState(null, '', window.location.pathname) // keep it out of shared URLs
    }
    const candidate = fromUrl ?? storage.getAdminKey(code)
    if (!candidate) return
    let cancelled = false
    api.verifyOrganizer(code, candidate)
      .then((ok) => {
        if (cancelled) return
        if (ok) {
          setKey(candidate)
          if (fromUrl) showToast('Organizer mode on', 'success')
        } else {
          storage.setAdminKey(code, null)
          if (fromUrl) showToast('That organizer link is not valid.', 'error')
        }
      })
      .catch(() => {
        // offline: show the panel anyway; the server still validates every action
        if (!cancelled) setKey(candidate)
      })
    return () => { cancelled = true }
  }, [code])

  return key
}

function PhaseBadge({ phase }: { phase: GamePhase }) {
  const map: Record<GamePhase['kind'], [string, string]> = {
    playing: [phase.kind === 'playing' ? `Game ${phase.round} in progress` : '', 'bg-court-700 text-white'],
    paused: ['Paused', 'bg-amber-100 text-amber-900'],
    ready: ['Ready to start', 'bg-ball-300 text-court-900'],
    needPlayers: ['Waiting for players', 'bg-court-100 text-court-800'],
    closed: ['Closed', 'bg-gray-200 text-gray-700'],
  }
  const [label, cls] = map[phase.kind]
  return <span className={`rounded-full px-3 py-1 font-semibold ${cls}`}>{label}</span>
}

function LiveBadge({ live }: { live: LiveStatus }) {
  const cfg = {
    live: ['Live', 'bg-court-500'],
    connecting: ['Connecting…', 'bg-amber-400'],
    offline: ['Reconnecting…', 'bg-red-500'],
  }[live]
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-court-800 ring-1 ring-court-200" role="status">
      <span className={`size-2 rounded-full ${cfg[1]} ${live === 'live' ? '' : 'animate-pulse'}`} aria-hidden="true" />
      {cfg[0]}
    </span>
  )
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center px-4">{children}</div>
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
)
