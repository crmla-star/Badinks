import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
}

let current: Toast | null = null
let timer: number | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showToast(text: string, tone: Toast['tone'] = 'info') {
  current = { id: Date.now(), text, tone }
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    current = null
    emit()
  }, tone === 'error' ? 5000 : 2800)
  emit()
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
