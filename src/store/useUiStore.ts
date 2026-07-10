import { create } from 'zustand'

/** Ephemeral UI state (dialogs, palettes) — never persisted. */
interface UiState {
  paletteOpen: boolean
  githubDialogOpen: boolean
  driveDialogOpen: boolean
  projectDialogOpen: boolean
  shareDialogOpen: boolean
  shortcutsOpen: boolean
  /** import progress: null when idle */
  importProgress: { done: number; total: number; current: string } | null

  setPaletteOpen: (open: boolean) => void
  setGithubDialogOpen: (open: boolean) => void
  setDriveDialogOpen: (open: boolean) => void
  setProjectDialogOpen: (open: boolean) => void
  setShareDialogOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setImportProgress: (p: UiState['importProgress']) => void
}

export const useUiStore = create<UiState>()((set) => ({
  paletteOpen: false,
  githubDialogOpen: false,
  driveDialogOpen: false,
  projectDialogOpen: false,
  shareDialogOpen: false,
  shortcutsOpen: false,
  importProgress: null,

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setGithubDialogOpen: (githubDialogOpen) => set({ githubDialogOpen }),
  setDriveDialogOpen: (driveDialogOpen) => set({ driveDialogOpen }),
  setProjectDialogOpen: (projectDialogOpen) => set({ projectDialogOpen }),
  setShareDialogOpen: (shareDialogOpen) => set({ shareDialogOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setImportProgress: (importProgress) => set({ importProgress }),
}))
