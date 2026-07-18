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
