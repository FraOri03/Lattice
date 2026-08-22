import { create } from 'zustand'

/** Ephemeral UI state (dialogs, palettes) — never persisted. */
interface UiState {
  paletteOpen: boolean
  githubDialogOpen: boolean
  driveDialogOpen: boolean
  projectDialogOpen: boolean
  shareDialogOpen: boolean
  shortcutsOpen: boolean
  /**
   * The AI panel (21.3). Ephemeral like every other overlay here — a job
   * survives it, because the job lives in `lib/ai/jobsStore`, not in the
   * panel that happens to be showing it.
   */
  aiPanelOpen: boolean
  /** import progress: null when idle */
  importProgress: { done: number; total: number; current: string } | null

  setPaletteOpen: (open: boolean) => void
  setGithubDialogOpen: (open: boolean) => void
  setDriveDialogOpen: (open: boolean) => void
  setProjectDialogOpen: (open: boolean) => void
  setShareDialogOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  setAiPanelOpen: (open: boolean) => void
  setImportProgress: (p: UiState['importProgress']) => void
}

export const useUiStore = create<UiState>()((set) => ({
  paletteOpen: false,
  githubDialogOpen: false,
  driveDialogOpen: false,
  projectDialogOpen: false,
  shareDialogOpen: false,
  shortcutsOpen: false,
  aiPanelOpen: false,
  importProgress: null,

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setGithubDialogOpen: (githubDialogOpen) => set({ githubDialogOpen }),
  setDriveDialogOpen: (driveDialogOpen) => set({ driveDialogOpen }),
  setProjectDialogOpen: (projectDialogOpen) => set({ projectDialogOpen }),
  setShareDialogOpen: (shareDialogOpen) => set({ shareDialogOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  setImportProgress: (importProgress) => set({ importProgress }),
}))
