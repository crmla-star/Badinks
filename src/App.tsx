import { Card, Logo } from './components/ui'
import { ToastHost } from './components/ToastHost'
import { isConfigured } from './lib/supabase'
import { usePath } from './lib/router'
import { HomePage } from './pages/HomePage'
import { SessionPage } from './pages/SessionPage'

export default function App() {
  const path = usePath()

  if (!isConfigured) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
        <Card>
          <Logo />
          <p className="mt-4 font-bold">Supabase is not configured.</p>
          <p className="mt-1 text-court-800/80">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in your project URL and anon key,
            then restart the dev server.
          </p>
        </Card>
      </div>
    )
  }

  const match = path.match(/^\/s\/([A-Za-z0-9]{6})\/?$/)
  return (
    <>
      {match ? <SessionPage key={match[1].toUpperCase()} code={match[1].toUpperCase()} /> : <HomePage />}
      <ToastHost />
    </>
  )
}
