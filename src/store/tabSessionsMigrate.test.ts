import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The v4 → v5 migration (Phase 11.3.5).
 *
 * Every existing vault arrives at the tab session through `migrate`, exactly
 * once, and that path had no test: a fresh browser never runs it, so the whole
 * suite could stay green while the only users who have data lose what they had
 * open. This seeds storage the way a pre-11.3 build left it and asserts the
 * session the store wakes up with.
 */

const PROJECT = 'proj_default'

/** A vault as a pre-11.3 build persisted it: six slots, plus the code tabs. */
const v4 = {
  version: 4,
  state: {
    workspaces: {
      ws_personal: { id: 'ws_personal', name: 'Personal', projectIds: [PROJECT] },
    },
    activeWorkspaceId: 'ws_personal',
    projects: {
      [PROJECT]: {
        id: PROJECT,
        name: 'My Workspace',
        createdAt: 1,
        updatedAt: 1,
        storageRoot: `projects/${PROJECT}`,
      },
    },
    activeProjectId: PROJECT,
    recentProjectIds: [PROJECT],
    boards: { b_welcome: { id: 'b_welcome', name: 'Main board', cards: [], projectId: PROJECT } },
    boardOrder: ['b_welcome'],
    activeBoardId: 'b_welcome',
    notes: {
      n_welcome: { id: 'n_welcome', title: 'Welcome', content: '', updatedAt: 1, projectId: PROJECT },
    },
    assets: {},
    docs: {},
    codeDocs: {
      c_main: {
        id: 'c_main',
        title: 'main',
        extension: 'ts',
        language: 'typescript',
        updatedAt: 1,
        projectId: PROJECT,
      },
    },
    sheetDocs: {},
    presentDocs: {},
    recents: [],
    folders: {},
    collapsedCategories: [],
    viewMode: 'doc',
    theme: 'dark',
    locale: 'it',
    // what a pre-11.3 build stored about what was open
    activeNoteId: 'n_welcome',
    activeDocId: null,
    activeCodeId: null,
    activeSheetId: null,
    activePresentId: null,
    activeAssetId: null,
    codeTabs: ['c_main'],
  },
}

let store: typeof import('./useStore')

beforeAll(async () => {
  localStorage.setItem('lattice-vault-v1', JSON.stringify(v4))
  // imported AFTER the seed: persist rehydrates when the store is created
  store = await import('./useStore')
})

describe('a pre-11.3 vault keeps what it had open', () => {
  it('folds the code tabs and the open slot into one session', () => {
    const session = store.useStore.getState().tabSessions[PROJECT]
    expect(session?.tabs).toEqual([
      { kind: 'code', id: 'c_main' },
      { kind: 'note', id: 'n_welcome' },
    ])
    expect(session?.activeKey).toBe('note:n_welcome')
  })

  it('survives the prune that runs on rehydrate', () => {
    const session = store.useStore.getState().tabSessions[PROJECT]
    expect(session?.tabs.length).toBeGreaterThan(0)
  })
})
