import { useEffect, useRef } from 'react'
import { Button } from './ui'

export interface ConfirmRequest {
  title: string
  body: string
  confirmLabel: string
  /** 'danger' (red) for destructive actions, 'court' (green) for normal ones */
  tone?: 'danger' | 'court'
  onConfirm: () => void
}

/** Native <dialog> based confirmation — accessible, no extra dependency. */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (request && !d.open) d.showModal()
    if (!request && d.open) d.close()
  }, [request])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,26rem)] rounded-3xl bg-white p-0 text-ink shadow-xl"
    >
      {request && (
        <div className="p-6">
          <h2 className="text-xl font-bold">{request.title}</h2>
          <p className="mt-2 text-court-900/75">{request.body}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={onClose} autoFocus>Cancel</Button>
            <Button
              className={request.tone === 'court' ? '' : 'bg-red-600! text-white! ring-0! hover:bg-red-700!'}
              variant={request.tone === 'court' ? 'court' : 'danger'}
              onClick={() => {
                request.onConfirm()
                onClose()
              }}
            >
              {request.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
