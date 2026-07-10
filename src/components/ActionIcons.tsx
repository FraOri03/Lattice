import type { ReactNode, SVGProps } from 'react'

/**
 * ActionIcons — the semantic registry for every data-transfer action
 * (Phase 8). One icon per MEANING, never one ambiguous glyph for all:
 *
 *   ActionIcon.Import          arrow entering the tray  (into Lattice)
 *   ActionIcon.Export          arrow leaving the tray   (out of Lattice)
 *   ActionIcon.DownloadLocal   arrow down onto the device baseline
 *   ActionIcon.UploadToCloud   arrow up into a cloud
 *   ActionIcon.Sync            two opposing arcs (bidirectional)
 *   ActionIcon.PullFromGitHub  remote dot -> arrow down to local
 *   ActionIcon.PushToGitHub    local -> arrow up to remote dot
 *
 * Every icon-only control that uses these must still carry aria-label +
 * title; the registry fixes the glyph semantics, not the labelling.
 */

type P = SVGProps<SVGSVGElement> & { size?: number }

const S = ({ size = 15, children, ...rest }: P & { children?: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
)

/** Arrow pointing INTO the tray: something comes into the app. */
export const IcImport = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </S>
)

/** Arrow LEAVING the tray: something goes out of the app. */
export const IcExport = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 8l5-5 5 5M12 3v12" />
  </S>
)

/** Save to this device: arrow down onto the baseline. */
export const IcDownloadLocal = (p: P) => (
  <S {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 21h16" />
  </S>
)

/** Send to cloud storage: arrow up into a cloud. */
export const IcUploadToCloud = (p: P) => (
  <S {...p}>
    <path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.3 8.5 4.8 4.8 0 0 0 6.5 19h1" />
    <path d="M12 12v8M8.8 15.2 12 12l3.2 3.2" />
  </S>
)

/** Bidirectional sync: two opposing arcs. */
export const IcSync = (p: P) => (
  <S {...p}>
    <path d="M21.5 8A9 9 0 0 0 6 5.3L3.5 8M3.5 8V3.5M3.5 8H8" />
    <path d="M2.5 16A9 9 0 0 0 18 18.7l2.5-2.7M20.5 16v4.5M20.5 16H16" />
  </S>
)

/** Fetch from the remote repository down to Lattice. */
export const IcPullFromGitHub = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="4.5" r="2.2" />
    <path d="M12 6.7V17M7.5 13.5 12 18l4.5-4.5" />
    <path d="M5 21h14" />
  </S>
)

/** Commit from Lattice up to the remote repository. */
export const IcPushToGitHub = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="4.5" r="2.2" />
    <path d="M12 21V8M7.5 12.5 12 8l4.5 4.5" />
    <path d="M5 21h14" />
  </S>
)

/** The semantic registry (spec: section 10). */
export const ActionIcon = {
  Import: IcImport,
  Export: IcExport,
  DownloadLocal: IcDownloadLocal,
  UploadToCloud: IcUploadToCloud,
  Sync: IcSync,
  PullFromGitHub: IcPullFromGitHub,
  PushToGitHub: IcPushToGitHub,
} as const
