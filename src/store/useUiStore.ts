import { create } from 'zustand'

/** Ephemeral UI state (dialogs, palettes) — never persisted. */
interface UiState {
  paletteOpen: boolean
  githubDialogOpen: boolean
  projectDialogOpen: boolean
  /** import progress: null when idle */
  importProgress: { done: number; total: number; current: string } | null

  setPaletteOpen: (open: boolean) => void
  setGithubDialogOpen: (open: boolean) => void
  setProjectDialogOpen: (open: boolean) => void
  setImportProgress: (p: UiState['importProgress']) => void
}

export const useUiStore = create<UiState>()((set) => ({
  paletteOpen: false,
  githubDialogOpen: false,
  projectDialogOpen: false,
  importProgress: null,

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setGithubDialogOpen: (githubDialogOpen) => set({ githubDialogOpen }),
  setProjectDialogOpen: (projectDialogOpen) => set({ projectDialogOpen }),
  setImportProgress: (importProgress) => set({ importProgress }),
}))
