import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import type { SpreadsheetBody } from '@/lib/sheet/sheetModel'
import { chartDataOf, formatRange, isEmptyChart, parseRange, readRange, type ChartData } from '@/lib/present/sheetRange'
import { IcX } from '@/components/Icons'

/**
 * Insert a chart from a sheet range (19E.4).
 *
 * The data is **captured**, not subscribed to: the deck holds the numbers it
 * was given, plus a note of where they came from and which revision that was.
 * Everything after that — noticing the source moved, deciding to update — is
 * the linked-content panel's business, and always a deliberate act.
 */
export function ChartInsertDialog({
  onInsert,
  onClose,
}: {
  onInsert: (args: {
    data: ChartData
    chart: 'bar' | 'line'
    title: string
    sheetId: string
    range: string
    rev: number
  }) => void
  onClose: () => void
}) {
  const sheets = useStore((s) => s.sheetDocs)
  const list = Object.values(sheets)
  const [sheetId, setSheetId] = useState(list[0]?.id ?? '')
  const [range, setRange] = useState('A1:C4')
  const [chart, setChart] = useState<'bar' | 'line'>('bar')
  const [body, setBody] = useState<SpreadsheetBody | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sheetId) return
    let alive = true
    setLoading(true)
    void storage
      .getDocument(sheetId)
      .then((raw) => alive && setBody(raw as SpreadsheetBody | null))
      .catch(() => alive && setBody(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sheetId])

  const parsed = parseRange(range)
  const sheetData =
    body?.sheets?.find((s) => !parsed?.sheet || s.name === parsed.sheet) ?? body?.sheets?.[0]
  const data = parsed && sheetData ? chartDataOf(readRange(sheetData, parsed)) : null
  const empty = !data || isEmptyChart(data)
  const meta = sheets[sheetId]

  return (
    <div
      className="absolute top-2 left-2 z-20 w-[21rem] rounded-xl border border-bord bg-panel shadow-xl"
      role="dialog"
      aria-label="Insert a chart from a sheet"
    >
      <div className="flex items-center gap-2 border-b border-bord px-3 py-2">
        <span className="flex-1 text-[12px] font-semibold">Chart from a sheet</span>
        <button className="icon-btn" aria-label="Close chart picker" onClick={onClose}>
          <IcX size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {list.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted">
            This project has no spreadsheets yet. A chart on a slide reads its
            numbers from one, so there is nothing to point at.
          </p>
        ) : (
          <>
            <label className="text-[10px] text-muted uppercase">
              Sheet
              <select
                className="field mt-0.5 h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
                aria-label="Source sheet"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[10px] text-muted uppercase">
              Range
              <input
                className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
                aria-label="Range"
                placeholder="Revenue!B2:E8"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              />
            </label>

            <div className="flex gap-1">
              {(['bar', 'line'] as const).map((c) => (
                <button
                  key={c}
                  className="btn flex-1"
                  aria-pressed={chart === c}
                  onClick={() => setChart(c)}
                >
                  {c === 'bar' ? 'Bar' : 'Line'}
                </button>
              ))}
            </div>

            {/* what it read, before anything is inserted */}
            <div className="rounded-lg border border-bord bg-panel2 p-2 text-[10.5px] text-muted">
              {loading ? (
                'Reading the sheet…'
              ) : !parsed ? (
                <>“{range}” is not a range. Try something like <code>B2:E8</code>.</>
              ) : empty ? (
                'That range has no numbers in it.'
              ) : (
                <>
                  {data!.series.length} {data!.series.length === 1 ? 'series' : 'series'} ×{' '}
                  {data!.categories.length} categories — {data!.series.map((s) => s.name).join(', ')}
                </>
              )}
            </div>

            <button
              className="btn w-full !border-accent !text-accent"
              disabled={empty || !parsed || loading}
              onClick={() =>
                onInsert({
                  data: data!,
                  chart,
                  title: meta?.title ?? 'Chart',
                  sheetId,
                  range: formatRange(parsed!),
                  rev: meta?.updatedAt ?? 0,
                })
              }
            >
              Insert chart
            </button>
            <p className="text-[10px] leading-relaxed text-muted">
              The numbers are copied into the slide. The deck remembers where
              they came from, and tells you when the sheet moves on — it never
              refreshes itself.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
