// Small, failure-tolerant wrappers around localStorage (private mode etc.).

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — the app still works for this visit */
  }
}

export interface MyPlayer {
  id: string
  token: string
  name: string
}

export interface HostedSession {
  code: string
  name: string
}

export const storage = {
  getPlayer: (code: string) => read<MyPlayer>(`pbq:player:${code}`),
  setPlayer: (code: string, p: MyPlayer | null) => write(`pbq:player:${code}`, p),

  getLastName: () => read<string>('pbq:lastName') ?? '',
  setLastName: (name: string) => write('pbq:lastName', name),

  getAdminKey: (code: string) => read<string>(`pbq:admin:${code}`),
  setAdminKey: (code: string, key: string | null) => write(`pbq:admin:${code}`, key),

  getHosted: () => read<HostedSession[]>('pbq:hosted') ?? [],
  addHosted: (s: HostedSession) =>
    write('pbq:hosted', [s, ...(read<HostedSession[]>('pbq:hosted') ?? []).filter((h) => h.code !== s.code)].slice(0, 10)),
}
