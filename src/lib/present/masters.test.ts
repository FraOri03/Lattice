import { describe, expect, it } from 'vitest'
import {
  addMaster,
  assignMaster,
  createMaster,
  furnitureFor,
  masterFor,
  masterTokensFor,
  masterUsage,
  migrateMasters,
  removeMaster,
  setMasterToken,
  updateMaster,
} from './masters'
import { THEME_PRESETS, deckTokens, overriddenTokenKeys, sanitizeTokens } from './theme'
import { createSlide, type PresentationBody } from './presentModel'

const deck = (over: Partial<PresentationBody> = {}): PresentationBody => ({
  app: 'lattice-present',
  version: 4,
  theme: 'plain',
  slides: [createSlide({ id: 's1' }), createSlide({ id: 's2' })],
  ...over,
})

describe('deckTokens', () => {
  it('expands the preset a deck already had', () => {
    expect(deckTokens(deck()).bg).toBe(THEME_PRESETS.plain.bg)
    expect(deckTokens(deck({ theme: 'ink' })).bg).toBe(THEME_PRESETS.ink.bg)
  })

  it('lets the deck override part of the preset and inherit the rest', () => {
    const t = deckTokens(deck({ tokens: { accent: '#ff0000' } }))
    expect(t.accent).toBe('#ff0000')
    expect(t.bg).toBe(THEME_PRESETS.plain.bg)
  })
})

describe('sanitizeTokens', () => {
  it('keeps well-formed values', () => {
    expect(sanitizeTokens({ bg: '#123456', titleSize: 40 })).toEqual({
      bg: '#123456',
      titleSize: 40,
    })
  })

  it('drops what cannot be painted or measured', () => {
    expect(sanitizeTokens({ bg: 'rebeccapurple', titleSize: -4, radius: 'big' })).toBeUndefined()
  })

  it('rejects a chart palette with a bad colour in it, rather than half of one', () => {
    expect(sanitizeTokens({ chartPalette: ['#112233', 'nope'] })).toBeUndefined()
  })
})

describe('masters', () => {
  const m = createMaster('Content', { titleSize: 60 })
  const body = assignMaster(addMaster(deck(), m), 's1', m.id)

  it('paints a slide with its master over the deck', () => {
    expect(masterTokensFor(body, body.slides[0]).titleSize).toBe(60)
    expect(masterTokensFor(body, body.slides[0]).bg).toBe(THEME_PRESETS.plain.bg)
  })

  it('leaves a slide without a master on the deck’s own design', () => {
    expect(masterTokensFor(body, body.slides[1]).titleSize).toBe(THEME_PRESETS.plain.titleSize)
    expect(masterFor(body, body.slides[1])).toBeNull()
  })

  it('counts the slides a master is responsible for', () => {
    expect(masterUsage(body, m.id)).toBe(1)
  })

  it('renames without touching the tokens', () => {
    const next = updateMaster(body, m.id, { name: 'Renamed' })
    expect(next.masters![0]).toMatchObject({ name: 'Renamed', tokens: { titleSize: 60 } })
  })

  it('removes one token override and keeps the others', () => {
    const two = setMasterToken(body, m.id, 'accent', '#00ff00')
    const back = setMasterToken(two, m.id, 'titleSize', undefined)
    expect(back.masters![0].tokens).toEqual({ accent: '#00ff00' })
  })

  it('drops the override object entirely once the last key goes', () => {
    const bare = setMasterToken(body, m.id, 'titleSize', undefined)
    expect(bare.masters![0].tokens).toBeUndefined()
  })

  it('sends a deleted master’s slides back to the deck, not to another master', () => {
    const other = createMaster('Other')
    const two = addMaster(body, other)
    const next = removeMaster(two, m.id)
    expect(next.slides[0].masterId).toBeUndefined()
    expect(next.masters!.map((x) => x.id)).toEqual([other.id])
  })
})

describe('furniture', () => {
  it('reports nothing when a master asks for nothing', () => {
    const m = createMaster('Bare')
    const body = assignMaster(addMaster(deck(), m), 's1', m.id)
    expect(furnitureFor(body, body.slides[0])).toBeNull()
  })

  it('reports what the master does ask for', () => {
    const m = { ...createMaster('Footed'), furniture: { rule: true, slideNumber: true } }
    const body = assignMaster(addMaster(deck(), m), 's1', m.id)
    expect(furnitureFor(body, body.slides[0])).toMatchObject({ rule: true, slideNumber: true })
  })
})

describe('overriddenTokenKeys', () => {
  it('names only the keys that actually differ from what is inherited', () => {
    const inherited = THEME_PRESETS.plain
    expect(
      overriddenTokenKeys(inherited, { accent: '#ff0000', bg: inherited.bg }),
    ).toEqual(['accent'])
  })

  it('says nothing when there is no override at all', () => {
    expect(overriddenTokenKeys(THEME_PRESETS.plain, undefined)).toEqual([])
  })
})

describe('migrateMasters', () => {
  it('keeps usable masters and drops the rest', () => {
    const out = migrateMasters([
      { id: 'a', name: 'Keep' },
      { id: '', name: 'No id' },
      { id: 'a', name: 'Duplicate' },
      'nonsense',
      { id: 'b' },
    ])
    expect(out?.map((m) => m.id)).toEqual(['a', 'b'])
    expect(out?.[1].name).toBe('Master')
  })

  it('sanitises a master’s tokens instead of trusting them', () => {
    const out = migrateMasters([{ id: 'a', name: 'A', tokens: { bg: 'not-a-colour', accent: '#abcdef' } }])
    expect(out?.[0].tokens).toEqual({ accent: '#abcdef' })
  })

  it('returns nothing for a deck that has no masters', () => {
    expect(migrateMasters(undefined)).toBeUndefined()
    expect(migrateMasters([])).toBeUndefined()
  })
})
