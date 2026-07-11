import { describe, expect, it } from 'vitest'
import type { BoardNode, CardData } from '@/types/model'
import {
  createPresentBody,
  digestPresentation,
  normalizePresentBody,
} from './presentModel'

/**
 * Guards the Phase 8 board integration for presentations:
 *  - a presentation card is a first-class board node whose `presentId`
 *    survives the JSON serialization every persistence path uses
 *    (vault export, Google Drive bodies, and the CRDT board snapshot all
 *    serialize node.data as plain JSON);
 *  - the deck body the card lazy-loads for its thumbnail normalizes and
 *    digests deterministically.
 */

describe('presentation board card', () => {
  it('serializes a presentation node preserving type and presentId', () => {
    const data: CardData = {
      type: 'presentation',
      color: 'orange',
      presentId: 'pres_abc123',
      mode: 'compact',
    }
    const node: BoardNode = {
      id: 'card_1',
      type: 'presentation',
      position: { x: 40, y: 80 },
      width: 360,
      height: 260,
      data,
    }

    const roundTripped = JSON.parse(JSON.stringify(node)) as BoardNode
    expect(roundTripped.type).toBe('presentation')
    expect(roundTripped.data.presentId).toBe('pres_abc123')
    expect(roundTripped.data.mode).toBe('compact')
    // the reference points at the editable deck, never a raw asset
    expect(roundTripped.data.assetId).toBeUndefined()
  })

  it('normalizes a fresh deck body and digests its slide count', () => {
    const body = createPresentBody('Quarterly review')
    const digest = digestPresentation(body)
    expect(digest.slideCount).toBe(1)
    expect(digest.snippet).toContain('Quarterly review')

    // the card thumbnail path re-reads whatever storage returns
    const normalized = normalizePresentBody(JSON.parse(JSON.stringify(body)))
    expect(normalized.app).toBe('lattice-present')
    expect(normalized.slides).toHaveLength(1)
  })

  it('falls back to a valid deck when storage returns garbage', () => {
    const normalized = normalizePresentBody({ nonsense: true })
    expect(normalized.slides.length).toBeGreaterThan(0)
    expect(normalized.theme).toBe('plain')
  })
})
