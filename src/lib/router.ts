import { useEffect, useState } from 'react'

// Tiny router: "/" and "/s/:code". No dependency needed.
export function navigate(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path
}

export const sessionUrl = (code: string) => `${window.location.origin}/s/${code}`
