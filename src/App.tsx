import { Card, Logo } from './components/ui'
import { ToastHost } from './components/ToastHost'
import { configProblem, isConfigured } from './lib/supabase'
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
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-medium break-words text-red-800">{configProblem}</p>
          <p className="mt-3 text-court-800/80">
            On Vercel: Project → Settings → Environment Variables, fix the value, then redeploy.
            Locally: edit <code>.env.local</code> and restart the dev server.
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
