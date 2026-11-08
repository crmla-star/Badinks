import { useToast } from '../lib/toast'

export function ToastHost() {
  const toast = useToast()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {toast && (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`pop-in pointer-events-auto max-w-md rounded-2xl px-5 py-3.5 text-base font-semibold shadow-lg ${
            toast.tone === 'error' ? 'bg-red-700 text-white'
            : toast.tone === 'success' ? 'bg-court-800 text-ball-300'
            : 'bg-ink text-white'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
