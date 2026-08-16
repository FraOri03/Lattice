import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { useReadOnly } from '@/lib/collab/useCollab'
import type { PresentationDocMeta } from '@/types/model'
import { normalizePresentBody, type PresentationBody } from '@/lib/present/presentModel'
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  commit as histCommit,
  initHistory,
  redo as histRedo,
  seal as histSeal,
  undo as histUndo,
  type HistoryState,
} from '@/lib/present/history'

/**
 * Deck state with undo/redo (Phase 0). Loads the body from storage, holds it in
 * a bounded history stack with transaction coalescing, and batches persistence
 * so a whole drag or a typed word is one storage write *and* one undo step.
 *
 * Persistence is debounced and fires on commit boundaries (including undo/redo),
 * never per pointer move — this also fixes the audit's PF-1 (full-deck
 * re-serialize on every save was previously coupled to a 700 ms timer per edit).
 */

const SAVE_DEBOUNCE_MS = 600

export type ApplyOptions = { coalesceKey?: string }
export type Patch = (body: PresentationBody) => PresentationBody

export interface DeckHistory {
  body: PresentationBody | null
  apply: (patch: Patch, opts?: ApplyOptions) => void
  undo: () => void
  redo: () => void
  /** close the current coalesce window (call on drag end / text blur) */
  seal: () => void
  /** persist immediately (call before export) */
  flush: () => void
  canUndo: boolean
  canRedo: boolean
  readOnly: boolean
  /**
   * An edit is committed but not yet written to storage (19E.1). The status
   * bar reports it, so "saved" is a fact rather than a reassuring label.
   */
  unsaved: boolean
}

export function useDeckHistory(meta: PresentationDocMeta): DeckHistory {
  const persistPresentBody = useStore((s) => s.persistPresentBody)
  const readOnly = useReadOnly()
  const [unsaved, setUnsaved] = useState(false)

  const [hist, setHist] = useState<HistoryState<PresentationBody> | null>(null)
  const pending = useRef<PresentationBody | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  // load (and reset) when the deck changes
  useEffect(() => {
    let alive = true
    setHist(null)
    pending.current = null
    void storage
      .getDocument(meta.id)
      .then((raw) => alive && setHist(initHistory(normalizePresentBody(raw))))
      .catch(() => alive && setHist(initHistory(normalizePresentBody(undefined))))
    return () => {
      alive = false
    }
  }, [meta.id])

  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current)
    if (pending.current) {
      persistPresentBody(meta.id, pending.current)
      pending.current = null
    }
    setUnsaved(false)
  }, [meta.id, persistPresentBody])

  // flush on unmount
  useEffect(() => () => flush(), [flush])

  const scheduleSave = useCallback(
    (body: PresentationBody) => {
      pending.current = body
      setUnsaved(true)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  const apply = useCallback(
    (patch: Patch, opts?: ApplyOptions) => {
      if (readOnly) return
      setHist((h) => {
        if (!h) return h
        const next = patch(h.present)
        if (Object.is(next, h.present)) return h
        const nh = histCommit(h, next, opts?.coalesceKey)
        scheduleSave(nh.present)
        return nh
      })
    },
    [readOnly, scheduleSave],
  )

  const undo = useCallback(() => {
    setHist((h) => {
      if (!h || !histCanUndo(h)) return h
      const nh = histUndo(h)
      scheduleSave(nh.present)
      return nh
    })
  }, [scheduleSave])

  const redo = useCallback(() => {
    setHist((h) => {
      if (!h || !histCanRedo(h)) return h
      const nh = histRedo(h)
      scheduleSave(nh.present)
      return nh
    })
  }, [scheduleSave])

  const seal = useCallback(() => setHist((h) => (h ? histSeal(h) : h)), [])

  return {
    body: hist?.present ?? null,
    apply,
    undo,
    redo,
    seal,
    flush,
    canUndo: !!hist && histCanUndo(hist),
    canRedo: !!hist && histCanRedo(hist),
    readOnly,
    unsaved,
  }
}
