import { create } from 'zustand'
import { IcAlert, IcCheck, IcInfo, IcX } from '@/components/Icons'

/**
 * Global toast system (Phase 7). Replaces the browser alert() calls that
 * were scattered through the app: non-blocking, consistent with the design
 * system, and stackable. Use through the `toast` helper:
 *
 *   toast.success('Version restored')
 *   toast.error('Drive sync failed', 'Sign in again to resume')
 */

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  detail?: string
  /** optional action button (e.g. "Undo", "Retry") */
  action?: { label: string; run: () => void }
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  info: 4000,
  success: 3500,
  warning: 6000,
  error: 8000,
}

function show(kind: ToastKind, title: string, detail?: string, action?: Toast['action']) {
  const id = useToastStore.getState().push({ kind, title, detail, action })
  window.setTimeout(() => useToastStore.getState().dismiss(id), AUTO_DISMISS_MS[kind])
  return id
}

export const toast = {
  info: (title: string, detail?: string, action?: Toast['action']) =>
    show('info', title, detail, action),
  success: (title: string, detail?: string, action?: Toast['action']) =>
    show('success', title, detail, action),
  warning: (title: string, detail?: string, action?: Toast['action']) =>
    show('warning', title, detail, action),
  error: (title: string, detail?: string, action?: Toast['action']) =>
    show('error', title, detail, action),
}

const KIND_COLOR: Record<ToastKind, string> = {
  info: 'var(--accent)',
  success: '#14ae5c',
  warning: '#ffa629',
  error: '#f24822',
}

function KindIcon({ kind }: { kind: ToastKind }) {
  const cls = 'flex-none'
  const style = { color: KIND_COLOR[kind] }
  if (kind === 'success') return <IcCheck size={14} className={cls} style={style} />
  if (kind === 'info') return <IcInfo size={14} className={cls} style={style} />
  return <IcAlert size={14} className={cls} style={style} />
}

/** Toast host — mounted once in App. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div
      className="fixed right-4 bottom-4 z-[90] flex w-80 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in flex items-start gap-2.5 rounded-xl border border-bord bg-panel p-3 shadow-xl"
          style={{ borderLeft: `3px solid ${KIND_COLOR[t.kind]}` }}
        >
          <span className="mt-0.5">
            <KindIcon kind={t.kind} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold">{t.title}</div>
            {t.detail && (
              <div className="mt-0.5 text-[11px] leading-snug text-muted">{t.detail}</div>
            )}
            {t.action && (
              <button
                className="mt-1.5 cursor-pointer text-[11px] font-medium text-accent hover:underline"
                onClick={() => {
                  t.action?.run()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            className="icon-btn h-5 w-5"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            <IcX size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
