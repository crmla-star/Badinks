import { useState, type FormEvent } from 'react'
import { Button, Card, Field, inputClass, Logo } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { navigate } from '../lib/router'
import { storage } from '../lib/storage'

export function HomePage() {
  const hosted = storage.getHosted()

  return (
    <div className="mx-auto max-w-md px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16">
      <header className="flex flex-col items-center pt-6 pb-8 text-center">
        <Logo size="lg" />
        <p className="mt-3 text-lg text-court-800/80">One court. Fair rotation. Zero arguing.</p>
      </header>

      <div className="space-y-4">
        <JoinByCode />
        {hosted.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xs font-bold tracking-[0.14em] text-court-700 uppercase">Your sessions</h2>
            <ul className="space-y-2">
              {hosted.map((h) => (
                <li key={h.code}>
                  <button
                    onClick={() => navigate(`/s/${h.code}`)}
                    className="flex h-14 w-full items-center justify-between rounded-2xl bg-court-50 px-4 text-left font-semibold hover:bg-court-100"
                  >
                    <span className="truncate">{h.name}</span>
                    <span className="font-mono text-sm tracking-widest text-court-700">{h.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <CreateSession />
      </div>
    </div>
  )
}

function JoinByCode() {
  const [code, setCode] = useState('')
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (clean.length === 6) navigate(`/s/${clean}`)
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Join a game" hint="Got a link? Just open it. Or type the 6-letter code.">
          <input
            className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em] uppercase`}
            value={clean}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC123"
            aria-label="Game code"
          />
        </Field>
        <Button type="submit" size="lg" block disabled={clean.length !== 6}>Find game</Button>
      </form>
    </Card>
  )
}

function CreateSession() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.createSession(name, pin)
      storage.setAdminKey(res.code, res.admin_key)
      storage.addHosted({ code: res.code, name: name.trim() })
      navigate(`/s/${res.code}`)
    } catch (err) {
      setError((err as ApiError).message)
      setBusy(false)
    }
  }

  return (
    <details className="group rounded-3xl bg-white shadow-sm ring-1 ring-court-900/5">
      <summary className="flex h-16 cursor-pointer list-none items-center justify-between px-5 font-bold text-court-800">
        Organize a game
        <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <form onSubmit={submit} className="space-y-4 px-5 pb-5">
        <Field label="Session name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Sunday Morning Dinks"
            required
          />
        </Field>
        <Field label="Organizer PIN" error={error} hint="The PIN set up for this app (see README).">
          <input
            className={inputClass}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="court" size="lg" block loading={busy} disabled={!name.trim() || !pin}>
          Create session
        </Button>
      </form>
    </details>
  )
}
