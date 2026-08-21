import type { ReactNode, SVGProps } from 'react'

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

/**
 * The filled counterpart of `S`. Most of this set is drawn with strokes, but a
 * few families read better as solids at 13–16px — alignment marks in
 * particular, where a hairline outline of a bar is mush and a filled bar is a
 * bar. `currentColor` still carries the theme, so a filled icon is as
 * theme-aware as a stroked one.
 */
const SFill = ({
  size = 15,
  inkScale = 1,
  children,
  ...rest
}: P & { children?: ReactNode; inkScale?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    {...rest}
  >
    {/**
     * `scale` is an optical correction, not a size control. Artwork drawn
     * edge-to-edge in the 24-box reads heavier than this set's stroked icons,
     * which sit inside a 16-unit square — measured, not guessed: 21.5 units of
     * ink against 16. Scaling about the centre puts a borrowed family into the
     * same optical box, so call sites keep asking for the same `size` as
     * everything else.
     */}
    {inkScale === 1 ? (
      children
    ) : (
      <g transform={`translate(12 12) scale(${inkScale}) translate(-12 -12)`}>{children}</g>
    )}
  </svg>
)

export const IcSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </S>
)
export const IcPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
)
export const IcNote = (p: P) => (
  <S {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </S>
)
export const IcImage = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m21 16-4.5-4.5L7 20" />
  </S>
)
export const IcVideo = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m10 9 5 3-5 3z" />
  </S>
)
export const IcLink = (p: P) => (
  <S {...p}>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 6.3" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12 17.7" />
  </S>
)
export const IcFile = (p: P) => (
  <S {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </S>
)
export const IcCube = (p: P) => (
  <S {...p}>
    <path d="m12 2 8 4.5v11L12 22l-8-4.5v-11z" />
    <path d="M12 22V11" />
    <path d="M20 6.5 12 11 4 6.5" />
  </S>
)
export const IcBoard = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="7.5" height="9.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
    <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
  </S>
)
export const IcDoc = (p: P) => (
  <S {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </S>
)
export const IcSplit = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </S>
)
export const IcSun = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </S>
)
export const IcMoon = (p: P) => (
  <S {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
  </S>
)
export const IcTrash = (p: P) => (
  <S {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </S>
)
/**
 * @deprecated Phase 8 — use the semantic registry in ActionIcons.tsx
 * (ActionIcon.Import / .Export / .DownloadLocal / .UploadToCloud /
 * .Sync / .PullFromGitHub / .PushToGitHub). One ambiguous tray glyph for
 * every transfer action is exactly the defect that registry fixes.
 */
export const IcDownload = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </S>
)
/** @deprecated Phase 8 — see IcDownload note. */
export const IcUpload = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 8l5-5 5 5M12 3v12" />
  </S>
)
export const IcTag = (p: P) => (
  <S {...p}>
    <path d="M12 2H2v10l9.3 9.3a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z" />
    <circle cx="7" cy="7" r="1.4" />
  </S>
)
export const IcExternal = (p: P) => (
  <S {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </S>
)
export const IcEdit = (p: P) => (
  <S {...p}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </S>
)
export const IcX = (p: P) => (
  <S {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </S>
)
export const IcMusic = (p: P) => (
  <S {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </S>
)
export const IcTable = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10M15 10v10" />
  </S>
)
export const IcPresentation = (p: P) => (
  <S {...p}>
    <path d="M3 3h18" />
    <rect x="4" y="3" width="16" height="12" rx="1.5" />
    <path d="M12 15v3M8.5 21l3.5-3 3.5 3" />
  </S>
)
export const IcEye = (p: P) => (
  <S {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </S>
)
export const IcCode = (p: P) => (
  <S {...p}>
    <path d="m8 6-6 6 6 6M16 6l6 6-6 6M13 4l-2 16" />
  </S>
)
export const IcAlignLeft = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
  </S>
)
export const IcAlignCenter = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
  </S>
)
export const IcAlignRight = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
  </S>
)

/* ---------------- Phase 6 ---------------- */

export const IcGlobe = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </S>
)
export const IcGithub = (p: P) => (
  <S {...p}>
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  </S>
)
export const IcDrive = (p: P) => (
  <S {...p}>
    <path d="m8.7 3.5 6.6 0L22 15.2l-3.3 5.8H5.3L2 15.2z" />
    <path d="M8.7 3.5 2 15.2M15.3 3.5 8.6 15.2M22 15.2H8.6" />
  </S>
)
export const IcFolder = (p: P) => (
  <S {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </S>
)
export const IcHome = (p: P) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
  </S>
)
export const IcStar = (p: P) => (
  <S {...p}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" />
  </S>
)
export const IcArchive = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
  </S>
)
export const IcUser = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </S>
)
export const IcCloud = (p: P) => (
  <S {...p}>
    <path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.3 8.5 4.8 4.8 0 0 0 6.5 19z" />
  </S>
)
export const IcCloudOff = (p: P) => (
  <S {...p}>
    <path d="M6.5 19h11a4.5 4.5 0 0 0 3-1.2M9.6 4.6A6.5 6.5 0 0 1 17.9 10a4.5 4.5 0 0 1 3.4 2.4M5.3 8.5A4.8 4.8 0 0 0 6.5 19" />
    <path d="m3 3 18 18" />
  </S>
)
export const IcCheck = (p: P) => (
  <S {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </S>
)
export const IcChevronDown = (p: P) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
)
export const IcChevronRight = (p: P) => (
  <S {...p}>
    <path d="m9 6 6 6-6 6" />
  </S>
)
export const IcChevronLeft = (p: P) => (
  <S {...p}>
    <path d="m15 6-6 6 6 6" />
  </S>
)
export const IcCommand = (p: P) => (
  <S {...p}>
    <path d="M9 9V6a3 3 0 1 0-3 3zm0 0v6m0-6h6M9 15H6a3 3 0 1 0 3 3zm6-6V6a3 3 0 1 1 3 3zm0 0v6m0 0h3a3 3 0 1 1-3 3z" />
  </S>
)
export const IcSection = (p: P) => (
  <S {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M9 12h6" />
  </S>
)
export const IcRefresh = (p: P) => (
  <S {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v5h-5" />
  </S>
)
export const IcLogOut = (p: P) => (
  <S {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </S>
)
export const IcWifiOff = (p: P) => (
  <S {...p}>
    <path d="M2 8.8A15.5 15.5 0 0 1 12 5c1.9 0 3.8.35 5.5 1M22 8.8a15.6 15.6 0 0 0-3-2.1M5.3 12.5A10.5 10.5 0 0 1 12 10m6.7 2.5a10.6 10.6 0 0 0-2.3-1.5M8.6 16.2a5.5 5.5 0 0 1 6.8 0" />
    <circle cx="12" cy="19" r="0.8" fill="currentColor" />
    <path d="m3 3 18 18" />
  </S>
)
export const IcClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </S>
)
export const IcFilter = (p: P) => (
  <S {...p}>
    <path d="M4 5h16l-6.5 8v6l-3-1.8V13z" />
  </S>
)
export const IcSettings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </S>
)
export const IcAlert = (p: P) => (
  <S {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </S>
)
export const IcBranch = (p: P) => (
  <S {...p}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="8" r="2.2" />
    <path d="M6 7.2v9.6M18 10.2c0 4-4 4.5-9.5 4.7" />
  </S>
)
/** Graph / relationship network — three nodes joined by edges (Phase 9.5). */
export const IcGraph = (p: P) => (
  <S {...p}>
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="16" r="2.4" />
    <circle cx="13" cy="5.5" r="2.4" />
    <path d="M7.7 16.2 11.4 7.3M14.9 6.9l2.2 6.9M8.3 17.7l7.4-1.2" />
  </S>
)
export const IcShield = (p: P) => (
  <S {...p}>
    <path d="M12 2 4 5.5v6c0 5 3.4 8.6 8 10.5 4.6-1.9 8-5.5 8-10.5v-6z" />
  </S>
)
export const IcMaximize = (p: P) => (
  <S {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
  </S>
)

/* ---------------- Phase 7 (collaboration) ---------------- */

export const IcInfo = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </S>
)
export const IcUsers = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
    <path d="M16 5a3.5 3.5 0 0 1 0 6.8M18.5 15.2c1.9.8 3 2.3 3 4.3" />
  </S>
)
export const IcUserPlus = (p: P) => (
  <S {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c0-3.4 2.9-5.5 6.5-5.5 1.4 0 2.7.3 3.8.9" />
    <path d="M19 13v6M16 16h6" />
  </S>
)
export const IcMessage = (p: P) => (
  <S {...p}>
    <path d="M21 12.5a8 8 0 0 1-8 8c-1.4 0-2.8-.3-4-.9L3 21l1.4-5.5a8 8 0 1 1 16.6-3z" />
  </S>
)
export const IcMessageDot = (p: P) => (
  <S {...p}>
    <path d="M21 12.5a8 8 0 0 1-8 8c-1.4 0-2.8-.3-4-.9L3 21l1.4-5.5a8 8 0 1 1 16.6-3z" />
    <path d="M9 11.5h.01M13 11.5h.01M17 11.5h.01" />
  </S>
)
export const IcHistory = (p: P) => (
  <S {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 1 2.5 6M3.5 12H2m1.5 0 2-2" />
    <path d="M12 7.5V12l3 2" />
  </S>
)
export const IcActivity = (p: P) => (
  <S {...p}>
    <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
  </S>
)
export const IcLock = (p: P) => (
  <S {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </S>
)
export const IcUnlock = (p: P) => (
  <S {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
  </S>
)
export const IcCopy = (p: P) => (
  <S {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </S>
)
export const IcMail = (p: P) => (
  <S {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </S>
)
export const IcSend = (p: P) => (
  <S {...p}>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </S>
)
export const IcReply = (p: P) => (
  <S {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v4" />
  </S>
)
export const IcKeyboard = (p: P) => (
  <S {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
  </S>
)
export const IcPin = (p: P) => (
  <S {...p}>
    <path d="M12 21s-6.5-5.3-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.7 12 21 12 21z" />
    <circle cx="12" cy="10.5" r="2.2" />
  </S>
)
export const IcRestore = (p: P) => (
  <S {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.3L3 8.3" />
    <path d="M3 3v5.3h5.3" />
    <path d="m9 12.7 2.2 2.3L15.5 10" />
  </S>
)
export const IcDot = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
  </S>
)

/* ---------------- Photo mode (studio planner) ---------------- */

export const IcCamera = (p: P) => (
  <S {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
    <circle cx="12" cy="13" r="3.2" />
  </S>
)
export const IcBulb = (p: P) => (
  <S {...p}>
    <path d="M15 14.5c.2-1 .8-1.8 1.6-2.6A5.8 5.8 0 0 0 18 8a6 6 0 1 0-12 0c0 1.4.5 2.6 1.4 3.9.8.8 1.4 1.6 1.6 2.6" />
    <path d="M9 18h6M10 21.5h4" />
  </S>
)
export const IcLayers = (p: P) => (
  <S {...p}>
    <path d="m12 2 8.5 4.5L12 11 3.5 6.5z" />
    <path d="m3.5 12 8.5 4.5 8.5-4.5" />
    <path d="m3.5 17.5 8.5 4.5 8.5-4.5" />
  </S>
)
export const IcEyeOff = (p: P) => (
  <S {...p}>
    <path d="M10.6 5.2c.5-.1.9-.2 1.4-.2 6.5 0 10 7 10 7a15 15 0 0 1-1.8 2.7M6.5 6.5C3.8 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </S>
)
export const IcSparkles = (p: P) => (
  <S {...p}>
    <path d="m12 4 1.7 4.8a2 2 0 0 0 1.2 1.2L19.7 12l-4.8 1.7a2 2 0 0 0-1.2 1.2L12 19.7l-1.7-4.8a2 2 0 0 0-1.2-1.2L4.3 12l4.8-1.7a2 2 0 0 0 1.2-1.2z" />
    <path d="M19 3v3M17.5 4.5h3M5 18v3M3.5 19.5h3" />
  </S>
)
export const IcUndo = (p: P) => (
  <S {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </S>
)
export const IcRedo = (p: P) => (
  <S {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </S>
)
export const IcCursor = (p: P) => (
  <S {...p}>
    <path d="m3 3 7.1 17 2.5-7.4L20 10.1z" />
  </S>
)
export const IcHand = (p: P) => (
  <S {...p}>
    <path d="M18 11V6.5a1.8 1.8 0 0 0-3.6 0V11" />
    <path d="M14.4 10.5V4.8a1.8 1.8 0 0 0-3.6 0v5.2" />
    <path d="M10.8 10V6.3a1.8 1.8 0 0 0-3.6 0V14" />
    <path d="m7.2 14.5-1.9-1.9a1.9 1.9 0 0 0-2.7 2.7l4.8 5A7 7 0 0 0 12.5 22h1a7 7 0 0 0 7-7v-5" />
  </S>
)
export const IcChevronUp = (p: P) => (
  <S {...p}>
    <path d="m6 15 6-6 6 6" />
  </S>
)
export const IcCheckCircle = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.8-5.3" />
  </S>
)
export const IcListChecks = (p: P) => (
  <S {...p}>
    <path d="m3 16.5 1.8 1.8 3.2-3.5M3 6.5l1.8 1.8L8 4.8" />
    <path d="M12.5 6.5H21M12.5 17.5H21M12.5 12H21" />
  </S>
)

/* ── project calls (LiveKit) ─────────────────────────────────────────────── */

export const IcMic = (p: P) => (
  <S {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
  </S>
)
/** Muted microphone — the slash is the shape cue, not just a colour change. */
export const IcMicOff = (p: P) => (
  <S {...p}>
    <path d="M15 5.2V5.5a3 3 0 0 0-6 0v5.3M9 13.4a3 3 0 0 0 5.6-1.5" />
    <path d="M5.5 11a6.5 6.5 0 0 0 9.6 5.7M18.5 11a6.4 6.4 0 0 1-.4 2.2" />
    <path d="M12 17.5V21M9 21h6" />
    <path d="m3.5 3.5 17 17" />
  </S>
)
export const IcVideoOff = (p: P) => (
  <S {...p}>
    <path d="M14.5 10.5V8a2 2 0 0 0-2-2H6.8M4.2 6.2A2 2 0 0 0 3 8v8a2 2 0 0 0 2 2h7.5a2 2 0 0 0 2-2v-1.5" />
    <path d="m21 8.5-4 3v1l4 3v-7Z" />
    <path d="m3.5 3.5 17 17" />
  </S>
)
export const IcScreenShare = (p: P) => (
  <S {...p}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M8.5 21h7" />
    <path d="M12 12.5V7.5m0 0L9.6 9.9M12 7.5l2.4 2.4" />
  </S>
)
/** Leave the call. */
export const IcPhoneOff = (p: P) => (
  <S {...p}>
    <path d="M10.7 5.6 9.4 8.2l2.1 2.1M13.6 13.1l2.2 2.2 2.6-1.3 3.1 1.2v3.3c0 .9-.8 1.6-1.7 1.5a17 17 0 0 1-9.5-4.2" />
    <path d="M6.6 10.4A17 17 0 0 1 2.2 3.7C2.1 2.8 2.8 2 3.7 2H7l1.2 3.1" />
    <path d="m3.5 20.5 17-17" />
  </S>
)
/** Grab handle of the free call window. */
export const IcMove = (p: P) => (
  <S {...p}>
    <path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3" />
    <path d="M2 12h20M12 2v20" />
  </S>
)
/** Send the free call window back to its corner. */
export const IcDock = (p: P) => (
  <S {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <rect x="12" y="12.5" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
  </S>
)
/** Bottom-right resize corner. */
export const IcGrip = (p: P) => (
  <S {...p}>
    <path d="M21 9 9 21M21 15.5 15.5 21" />
  </S>
)

/* ---------------- presentation editor (Phase 1) ---------------- */
/** Start presenting (#244). */
export const IcPlay = (p: P) => (
  <S {...p}>
    <path d="M7 4.5 19 12 7 19.5z" />
  </S>
)
/** A bar chart, for slide charts read from a sheet (19E.4). */
export const IcChart = (p: P) => (
  <S {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </S>
)
/** Slide layout: a title band over a content area (19E.2). */
export const IcLayout = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M12 9.5V20" />
  </S>
)
/* IcUndo / IcRedo are already defined above and reused here. */
export const IcZoomIn = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M11 8v6M8 11h6M21 21l-4.3-4.3" />
  </S>
)
export const IcZoomOut = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M8 11h6M21 21l-4.3-4.3" />
  </S>
)
/** 16 / 21.5 — the stroked family's ink over this family's. See `SFill`. */
const ALIGN_INK_SCALE = 0.75

/* ---------------- object alignment ----------------
 *
 * A separate family from `IcAlignLeft/Center/Right`, which mean **text**
 * alignment and are used as such by the spreadsheet toolbar. These mean
 * "align these objects to that edge" — a different instruction, and a
 * different picture: a rail, and the shapes brought to it.
 *
 * Drawn as solids (`SFill`) because at 13px an outlined bar is mush and a
 * filled bar is a bar. Shared on purpose: the presentation editor uses them
 * today, and the creative suite will want exactly this set for element
 * alignment rather than inventing a second one.
 *
 * Source: SVG Repo (svgrepo.com), recoloured to `currentColor`.
 */

export const IcObjectAlignLeft = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3.375 1.625C3.78921 1.625 4.125 1.96079 4.125 2.375L4.125 22.375C4.125 22.7892 3.78921 23.125 3.375 23.125C2.96079 23.125 2.625 22.7892 2.625 22.375L2.625 2.375C2.625 1.96079 2.96079 1.625 3.375 1.625Z"
    />
    <path d="M7.375 7.875C7.375 6.94038 7.375 6.47308 7.57596 6.125C7.70761 5.89697 7.89697 5.70761 8.125 5.57596C8.47308 5.375 8.94038 5.375 9.875 5.375H18.875C19.8096 5.375 20.2769 5.375 20.625 5.57596C20.853 5.70761 21.0424 5.89697 21.174 6.125C21.375 6.47308 21.375 6.94038 21.375 7.875C21.375 8.80962 21.375 9.27692 21.174 9.625C21.0424 9.85303 20.853 10.0424 20.625 10.174C20.2769 10.375 19.8096 10.375 18.875 10.375L9.875 10.375C8.94038 10.375 8.47308 10.375 8.125 10.174C7.89697 10.0424 7.70761 9.85303 7.57596 9.625C7.375 9.27692 7.375 8.80962 7.375 7.875Z" />
    <path d="M7.375 16.875C7.375 15.9404 7.375 15.4731 7.57596 15.125C7.70761 14.897 7.89697 14.7076 8.125 14.576C8.47308 14.375 8.94038 14.375 9.875 14.375L15.875 14.375C16.8096 14.375 17.2769 14.375 17.625 14.576C17.853 14.7076 18.0424 14.897 18.174 15.125C18.375 15.4731 18.375 15.9404 18.375 16.875C18.375 17.8096 18.375 18.2769 18.174 18.625C18.0424 18.853 17.853 19.0424 17.625 19.174C17.2769 19.375 16.8096 19.375 15.875 19.375H9.875C8.94038 19.375 8.47308 19.375 8.125 19.174C7.89697 19.0424 7.70761 18.853 7.57596 18.625C7.375 18.2769 7.375 17.8096 7.375 16.875Z" />
  </SFill>
)

export const IcObjectAlignCenter = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path d="M19 7.5C19 6.56538 19 6.09808 18.799 5.75C18.6674 5.52197 18.478 5.33261 18.25 5.20096C17.9019 5 17.4346 5 16.5 5L12.75 5L12.75 2C12.75 1.58579 12.4142 1.25 12 1.25C11.5858 1.25 11.25 1.58579 11.25 2L11.25 5L7.5 5C6.56538 5 6.09808 5 5.75 5.20096C5.52197 5.33261 5.33261 5.52197 5.20096 5.75C5 6.09807 5 6.56538 5 7.5C5 8.43461 5 8.90192 5.20096 9.25C5.33261 9.47803 5.52197 9.66739 5.75 9.79904C6.09808 10 6.56538 10 7.5 10H11.25L11.25 14H9.5C8.56538 14 8.09808 14 7.75 14.201C7.52197 14.3326 7.33261 14.522 7.20096 14.75C7 15.0981 7 15.5654 7 16.5C7 17.4346 7 17.9019 7.20096 18.25C7.33261 18.478 7.52197 18.6674 7.75 18.799C8.09808 19 8.56538 19 9.5 19H11.25L11.25 22C11.25 22.4142 11.5858 22.75 12 22.75C12.4142 22.75 12.75 22.4142 12.75 22L12.75 19H14.5C15.4346 19 15.9019 19 16.25 18.799C16.478 18.6674 16.6674 18.478 16.799 18.25C17 17.9019 17 17.4346 17 16.5C17 15.5654 17 15.0981 16.799 14.75C16.6674 14.522 16.478 14.3326 16.25 14.201C15.9019 14 15.4346 14 14.5 14H12.75L12.75 10H16.5C17.4346 10 17.9019 10 18.25 9.79904C18.478 9.66739 18.6674 9.47803 18.799 9.25C19 8.90192 19 8.43462 19 7.5Z" />
  </SFill>
)

export const IcObjectAlignRight = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M20.625 1.625C20.2108 1.625 19.875 1.96079 19.875 2.375V22.375C19.875 22.7892 20.2108 23.125 20.625 23.125C21.0392 23.125 21.375 22.7892 21.375 22.375V2.375C21.375 1.96079 21.0392 1.625 20.625 1.625Z"
    />
    <path d="M16.625 7.875C16.625 6.94038 16.625 6.47308 16.424 6.125C16.2924 5.89697 16.103 5.70761 15.875 5.57596C15.5269 5.375 15.0596 5.375 14.125 5.375L5.125 5.375C4.19038 5.375 3.72308 5.375 3.375 5.57596C3.14697 5.70761 2.95761 5.89697 2.82596 6.125C2.625 6.47307 2.625 6.94038 2.625 7.875C2.625 8.80961 2.625 9.27692 2.82596 9.625C2.95761 9.85303 3.14697 10.0424 3.375 10.174C3.72308 10.375 4.19038 10.375 5.125 10.375L14.125 10.375C15.0596 10.375 15.5269 10.375 15.875 10.174C16.103 10.0424 16.2924 9.85303 16.424 9.625C16.625 9.27692 16.625 8.80962 16.625 7.875Z" />
    <path d="M16.625 16.875C16.625 15.9404 16.625 15.4731 16.424 15.125C16.2924 14.897 16.103 14.7076 15.875 14.576C15.5269 14.375 15.0596 14.375 14.125 14.375L8.125 14.375C7.19038 14.375 6.72308 14.375 6.375 14.576C6.14697 14.7076 5.95761 14.897 5.82596 15.125C5.625 15.4731 5.625 15.9404 5.625 16.875C5.625 17.8096 5.625 18.2769 5.82596 18.625C5.95761 18.853 6.14697 19.0424 6.375 19.174C6.72308 19.375 7.19038 19.375 8.125 19.375H14.125C15.0596 19.375 15.5269 19.375 15.875 19.174C16.103 19.0424 16.2924 18.853 16.424 18.625C16.625 18.2769 16.625 17.8096 16.625 16.875Z" />
  </SFill>
)

export const IcObjectAlignTop = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.25 3.75C1.25 4.16421 1.58579 4.5 2 4.5H22C22.4142 4.5 22.75 4.16421 22.75 3.75C22.75 3.33579 22.4142 3 22 3H2C1.58579 3 1.25 3.33579 1.25 3.75Z"
    />
    <path d="M7.5 7.75C6.56538 7.75 6.09808 7.75 5.75 7.95096C5.52197 8.08261 5.33261 8.27197 5.20096 8.5C5 8.84808 5 9.31538 5 10.25L5 19.25C5 20.1846 5 20.6519 5.20096 21C5.33261 21.228 5.52197 21.4174 5.75 21.549C6.09808 21.75 6.56538 21.75 7.5 21.75C8.43462 21.75 8.90192 21.75 9.25 21.549C9.47803 21.4174 9.66739 21.228 9.79904 21C10 20.6519 10 20.1846 10 19.25V10.25C10 9.31538 10 8.84808 9.79904 8.5C9.66739 8.27197 9.47803 8.08261 9.25 7.95096C8.90192 7.75 8.43462 7.75 7.5 7.75Z" />
    <path d="M16.5 7.75C15.5654 7.75 15.0981 7.75 14.75 7.95096C14.522 8.08261 14.3326 8.27197 14.201 8.5C14 8.84808 14 9.31538 14 10.25V16.25C14 17.1846 14 17.6519 14.201 18C14.3326 18.228 14.522 18.4174 14.75 18.549C15.0981 18.75 15.5654 18.75 16.5 18.75C17.4346 18.75 17.9019 18.75 18.25 18.549C18.478 18.4174 18.6674 18.228 18.799 18C19 17.6519 19 17.1846 19 16.25V10.25C19 9.31538 19 8.84808 18.799 8.5C18.6674 8.27197 18.478 8.08261 18.25 7.95096C17.9019 7.75 17.4346 7.75 16.5 7.75Z" />
  </SFill>
)

export const IcObjectAlignMiddle = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path d="M7.5 5C6.56538 5 6.09808 5 5.75 5.20096C5.52197 5.33261 5.33261 5.52197 5.20096 5.75C5 6.09808 5 6.56538 5 7.5L5 11.25H2C1.58579 11.25 1.25 11.5858 1.25 12C1.25 12.4142 1.58579 12.75 2 12.75H5L5 16.5C5 17.4346 5 17.9019 5.20096 18.25C5.33261 18.478 5.52197 18.6674 5.75 18.799C6.09808 19 6.56538 19 7.5 19C8.43462 19 8.90192 19 9.25 18.799C9.47803 18.6674 9.66739 18.478 9.79904 18.25C10 17.9019 10 17.4346 10 16.5V12.75L14 12.75V14.5C14 15.4346 14 15.9019 14.201 16.25C14.3326 16.478 14.522 16.6674 14.75 16.799C15.0981 17 15.5654 17 16.5 17C17.4346 17 17.9019 17 18.25 16.799C18.478 16.6674 18.6674 16.478 18.799 16.25C19 15.9019 19 15.4346 19 14.5V12.75L22 12.75C22.4142 12.75 22.75 12.4142 22.75 12C22.75 11.5858 22.4142 11.25 22 11.25L19 11.25V9.5C19 8.56538 19 8.09808 18.799 7.75C18.6674 7.52197 18.478 7.33261 18.25 7.20096C17.9019 7 17.4346 7 16.5 7C15.5654 7 15.0981 7 14.75 7.20096C14.522 7.33261 14.3326 7.52197 14.201 7.75C14 8.09808 14 8.56538 14 9.5V11.25H10V7.5C10 6.56538 10 6.09808 9.79904 5.75C9.66739 5.52197 9.47803 5.33261 9.25 5.20096C8.90192 5 8.43462 5 7.5 5Z" />
  </SFill>
)

export const IcObjectAlignBottom = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.25 21C1.25 20.5858 1.58579 20.25 2 20.25H22C22.4142 20.25 22.75 20.5858 22.75 21C22.75 21.4142 22.4142 21.75 22 21.75H2C1.58579 21.75 1.25 21.4142 1.25 21Z"
    />
    <path d="M7.5 17C6.56538 17 6.09808 17 5.75 16.799C5.52197 16.6674 5.33261 16.478 5.20096 16.25C5 15.9019 5 15.4346 5 14.5L5 5.5C5 4.56538 5 4.09808 5.20096 3.75C5.33261 3.52197 5.52197 3.33261 5.75 3.20096C6.09808 3 6.56538 3 7.5 3C8.43462 3 8.90192 3 9.25 3.20096C9.47803 3.33261 9.66739 3.52197 9.79904 3.75C10 4.09808 10 4.56538 10 5.5V14.5C10 15.4346 10 15.9019 9.79904 16.25C9.66739 16.478 9.47803 16.6674 9.25 16.799C8.90192 17 8.43462 17 7.5 17Z" />
    <path d="M16.5 17C15.5654 17 15.0981 17 14.75 16.799C14.522 16.6674 14.3326 16.478 14.201 16.25C14 15.9019 14 15.4346 14 14.5V8.5C14 7.56538 14 7.09808 14.201 6.75C14.3326 6.52197 14.522 6.33261 14.75 6.20096C15.0981 6 15.5654 6 16.5 6C17.4346 6 17.9019 6 18.25 6.20096C18.478 6.33261 18.6674 6.52197 18.799 6.75C19 7.09808 19 7.56538 19 8.5V14.5C19 15.4346 19 15.9019 18.799 16.25C18.6674 16.478 18.478 16.6674 18.25 16.799C17.9019 17 17.4346 17 16.5 17Z" />
  </SFill>
)

export const IcObjectDistributeH = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 1.25C3.41422 1.25 3.75 1.58579 3.75 2L3.75 22C3.75 22.4142 3.41421 22.75 3 22.75C2.58579 22.75 2.25 22.4142 2.25 22L2.25 2C2.25 1.58579 2.58579 1.25 3 1.25ZM21 1.25C21.4142 1.25 21.75 1.58579 21.75 2L21.75 22C21.75 22.4142 21.4142 22.75 21 22.75C20.5858 22.75 20.25 22.4142 20.25 22L20.25 2C20.25 1.58579 20.5858 1.25 21 1.25Z"
    />
    <path d="M12 4C10.1144 4 9.17157 4 8.58579 4.58579C8 5.17157 8 6.11438 8 8V16C8 17.8856 8 18.8284 8.58579 19.4142C9.17157 20 10.1144 20 12 20C13.8856 20 14.8284 20 15.4142 19.4142C16 18.8284 16 17.8856 16 16V8C16 6.11438 16 5.17157 15.4142 4.58579C14.8284 4 13.8856 4 12 4Z" />
  </SFill>
)

export const IcObjectDistributeV = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.25 21C1.25 20.5858 1.58579 20.25 2 20.25L22 20.25C22.4142 20.25 22.75 20.5858 22.75 21C22.75 21.4142 22.4142 21.75 22 21.75L2 21.75C1.58579 21.75 1.25 21.4142 1.25 21ZM1.25 3C1.25 2.58579 1.58579 2.25 2 2.25L22 2.25C22.4142 2.25 22.75 2.58579 22.75 3C22.75 3.41421 22.4142 3.75 22 3.75L2 3.75C1.58579 3.75 1.25 3.41421 1.25 3Z"
    />
    <path d="M4 12C4 13.8856 4 14.8284 4.58579 15.4142C5.17157 16 6.11438 16 8 16L16 16C17.8856 16 18.8284 16 19.4142 15.4142C20 14.8284 20 13.8856 20 12C20 10.1144 20 9.17157 19.4142 8.58579C18.8284 8 17.8856 8 16 8H8C6.11438 8 5.17157 8 4.58579 8.58579C4 9.17158 4 10.1144 4 12Z" />
  </SFill>
)

export const IcMagnet = (p: P) => (
  <S {...p}>
    <path d="M7 3H4v8a8 8 0 0 0 16 0V3h-3v8a5 5 0 0 1-10 0z" />
    <path d="M4 7h3M17 7h3" />
  </S>
)
export const IcSquare = (p: P) => (
  <S {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </S>
)
export const IcCircle = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8" />
  </S>
)
export const IcLine = (p: P) => (
  <S {...p}>
    <path d="M5 19 19 5" />
  </S>
)
export const IcRotate = (p: P) => (
  <S {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </S>
)

/* ---------- planned environments (phases 21 + 23–26) ----------
   Placeholders for the AI and Creative suites, drawn here rather than borrowed
   from the insert menu: `IcImage` means "insert an image" everywhere else in
   the app, and a switcher tab that reuses it would be saying the wrong thing
   for years. They move into the phase-22 tool/icon registry when it exists —
   see docs/architecture/creative-suite.md on why reuse has to be mechanical. */

/**
 * ComfyUI — the product's own mark, not an interpretation of it.
 *
 * The other two brand marks here (`IcGithub`, `IcDrive`) are redrawn as
 * strokes, and that works because both are outlines already. This one is a
 * solid zigzag ribbon: stroking its contour would draw the mark twice, and
 * stroking its centreline at 1.8 would leave a thin zigzag nobody recognises.
 * So it is the real path, filled — which is what `SFill` is for.
 *
 * The artwork was authored in a 512 box; the transform maps it to 1.25…22.75
 * of the 24 box (the same edge-to-edge square the alignment family is drawn
 * in), and `inkScale` then does the optical correction those icons rely on, so
 * a caller still asks for the same `size` as every stroked icon beside it.
 */
export const IcComfyUI = (p: P) => (
  <SFill inkScale={ALIGN_INK_SCALE} {...p}>
    <g transform="translate(1.4876 1.03) scale(.042849)">
      <path d="M117.013 506.88c-12.117 0-21.888-4.416-28.266-12.757-6.55-8.576-8.256-20.565-4.694-32.853l14.336-49.387c1.152-3.925.342-8.17-2.133-11.435a13.33 13.33 0 00-10.539-5.184H44.48c-12.117 0-21.888-4.416-28.267-12.757-6.549-8.597-8.256-20.565-4.693-32.853L60.8 180.757l5.44-18.56c7.317-25.173 33.963-45.653 59.435-45.653h49.344c5.888 0 11.072-3.84 12.693-9.43l16.299-56.17c7.317-25.173 33.962-45.632 59.456-45.632l105.493-.17h77.227c12.117 0 21.91 4.394 28.267 12.735 6.549 8.576 8.256 20.566 4.693 32.854l-22.08 76.074c-7.317 25.131-33.984 45.59-59.456 45.59l-105.728.213H242.56c-5.824-.021-11.008 3.819-12.672 9.408l-41.13 140.885a12.892 12.892 0 002.133 11.457 13.31 13.31 0 0010.56 5.184l69.866-.128h77.014c12.117 0 21.888 4.394 28.267 12.757 6.549 8.576 8.256 20.565 4.693 32.853l-22.101 76.054c-7.296 25.152-33.963 45.61-59.435 45.61l-105.75.214h-77.013l.021-.022z" />
    </g>
  </SFill>
)

/** Trace — a Bézier curve between two anchor points. */
export const IcBezier = (p: P) => (
  <S {...p}>
    <path d="M4.5 18c8 0 7-12 15-12" />
    <rect x="1.5" y="16" width="4" height="4" rx="1" />
    <rect x="18.5" y="4" width="4" height="4" rx="1" />
  </S>
)

/** Forge — a painter's palette. */
export const IcPalette = (p: P) => (
  <S {...p}>
    <path d="M12 3a9 9 0 1 0 0 18 1.9 1.9 0 0 0 1.9-1.9c0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2a1.9 1.9 0 0 1 1.9-1.9H17a4.9 4.9 0 0 0 4.9-4.9C21.9 5.9 17.5 3 12 3z" />
    <circle cx="7.5" cy="10.5" r="1" />
    <circle cx="12" cy="7.5" r="1" />
    <circle cx="16.5" cy="10.5" r="1" />
  </S>
)

/** Folio — an open two-page spread. */
export const IcPages = (p: P) => (
  <S {...p}>
    <path d="M12 6C10.6 4.7 8.5 4 6 4H3v14h3c2.5 0 4.6.7 6 2 1.4-1.3 3.5-2 6-2h3V4h-3c-2.5 0-4.6.7-6 2z" />
    <path d="M12 6v14" />
  </S>
)

/** Flux — a film strip. */
export const IcFilm = (p: P) => (
  <S {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
    <path d="M7.5 4.5v15M16.5 4.5v15" />
    <path d="M2.5 12h5M16.5 12h5" />
  </S>
)
