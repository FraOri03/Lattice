import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { IcAlert } from '@/components/Icons'

/**
 * Promise-based in-app dialogs (Phase 7). Replaces window.confirm() and
 * window.prompt(): consistent styling, a proper danger variant for
 * destructive actions, keyboard handling (Esc cancels, Enter confirms)
 * and focus management.
 *
 *   if (await confirmDialog({ title: 'Delete board?', danger: true })) …
 *   const url = await promptDialog({ title: 'Embed a webpage', label: 'URL' })
 */

interface ConfirmRequest {
  kind: 'confirm'
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface PromptRequest {
  kind: 'prompt'
  title: string
  body?: string
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  resolve: (value: string | null) => void
}

type DialogRequest = ConfirmRequest | PromptRequest

interface DialogStore {
  current: DialogRequest | null
  open: (req: DialogRequest) => void
  close: () => void
}

const useDialogStore = create<DialogStore>()((set) => ({
  current: null,
  open: (current) => set({ current }),
  close: () => set({ current: null }),
}))

export function confirmDialog(opts: {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({ kind: 'confirm', ...opts, resolve })
  })
}

export function promptDialog(opts: {
  title: string
  body?: string
  label?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({ kind: 'prompt', ...opts, resolve })
  })
}

/** Dialog host — mounted once in App. */
export function DialogHost() {
  const current = useDialogStore((s) => s.current)
  const close = useDialogStore((s) => s.close)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) return
    setValue(current.kind === 'prompt' ? (current.initialValue ?? '') : '')
    // focus the right control when a dialog opens
    const t = window.setTimeout(() => {
      if (current.kind === 'prompt') inputRef.current?.focus()
      else confirmRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [current])

  if (!current) return null

  const cancel = () => {
    if (current.kind === 'confirm') current.resolve(false)
    else current.resolve(null)
    close()
  }
  const confirm = () => {
    if (current.kind === 'confirm') current.resolve(true)
    else current.resolve(value)
    close()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel()
        if (e.key === 'Enter') confirm()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div className="w-full max-w-sm rounded-xl border border-bord bg-panel p-4 shadow-xl">
        <div className="flex items-start gap-2.5">
          {current.kind === 'confirm' && current.danger && (
            <span className="mt-0.5 flex-none text-[#f24822]">
              <IcAlert size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{current.title}</div>
            {current.body && (
              <div className="mt-1 text-[12px] leading-relaxed text-muted">
                {current.body}
              </div>
            )}
          </div>
        </div>

        {current.kind === 'prompt' && (
          <div className="mt-3">
            {current.label && (
              <label className="mb-1 block text-[11px] font-medium text-muted">
                {current.label}
              </label>
            )}
            <input
              ref={inputRef}
              className="field"
              value={value}
              placeholder={current.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={cancel}>
            {(current.kind === 'confirm' && current.cancelLabel) || 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${
              current.kind === 'confirm' && current.danger
                ? 'border-[#f24822]/50 bg-[#f24822]/15 text-[#f24822] hover:!border-[#f24822]'
                : 'border-accent/50 bg-accent/15 text-accent hover:!border-accent'
            }`}
            onClick={confirm}
          >
            {current.confirmLabel ?? (current.kind === 'confirm' ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  )
}
