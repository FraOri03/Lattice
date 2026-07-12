import { IcCube } from '@/components/Icons'

/**
 * Dimensionally-stable placeholder for a 3D card (PERF-1/PERF-2). Doubles as
 * the Suspense skeleton while the three.js chunk loads and as the paused
 * state when the card is off-screen or over the live-viewer budget. It never
 * changes the card's size, so edges and layout stay put whether or not the
 * scene is mounted.
 */
export function ThreePlaceholder({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="placeholder absolute inset-0">
      <IcCube size={22} />
      <span className="font-medium text-ink">{label}</span>
      {hint && <span className="text-[11px]">{hint}</span>}
    </div>
  )
}
