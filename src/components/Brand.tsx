import type { SVGProps } from 'react'

/**
 * Official Lattice brand artwork, transcribed from the source files in
 * `Trademark/` (Lattice Trademark.svg, Lattice Logotype Horizontal.svg,
 * Lattice Logotype Horizontal TM.svg).
 *
 * Two deliberate differences from the source files:
 *
 * - the artwork ships white-filled (drawn for a dark background); here every
 *   shape is `currentColor`, so the brand follows the theme instead of
 *   vanishing on the light one;
 * - width is derived from each artwork's own viewBox, so callers pass a
 *   height and the proportions stay exact — never set both.
 *
 * The mark is decorative whenever it sits next to a logotype: give the
 * accessible name to the logotype (`role="img" aria-label="Lattice"`) and
 * leave the mark `aria-hidden`, otherwise screen readers hear the brand twice.
 */
type BrandProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox'> & {
  /** Rendered height in px; width follows the artwork ratio. */
  height?: number
}

/** viewBox dimensions of the three source files. */
const MARK = { w: 319.95, h: 380.32 }
const LOGOTYPE = { w: 319.92, h: 37.18 }
const LOGOTYPE_TM = { w: 344.9, h: 37.07 }

const box = (a: { w: number; h: number }) => `0 0 ${a.w} ${a.h}`
const widthFor = (a: { w: number; h: number }, height: number) =>
  (height * a.w) / a.h

/** The Lattice trademark: the isometric lattice cube, on its own. */
export function LatticeMark({ height = 28, ...rest }: BrandProps) {
  return (
    <svg
      height={height}
      width={widthFor(MARK, height)}
      viewBox={box(MARK)}
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d="M309.26,256.79V123.53c6.37-3.53,10.69-10.31,10.69-18.11,0-11.43-9.26-20.69-20.69-20.69-3.76,0-7.27,1.02-10.3,2.77L180.6,21.96c.03-.42.06-.84.06-1.27,0-11.43-9.26-20.69-20.69-20.69s-20.69,9.26-20.69,20.69c0,.15.02.29.02.43L30.9,87.45c-3.02-1.72-6.5-2.71-10.22-2.71-11.43,0-20.69,9.26-20.69,20.69,0,7.8,4.32,14.58,10.69,18.11v133.26c-6.37,3.53-10.69,10.31-10.69,18.11,0,11.43,9.26,20.69,20.69,20.69,3.74,0,7.23-1.01,10.26-2.74l108.38,65.94c-.01.29-.04.57-.04.85,0,11.43,9.26,20.69,20.69,20.69s20.69-9.26,20.69-20.69c0-.29-.03-.57-.04-.85l108.38-65.94c3.03,1.73,6.52,2.74,10.26,2.74,11.43,0,20.69-9.26,20.69-20.69,0-7.8-4.32-14.58-10.69-18.11ZM159.98,41.37c3.59,0,6.96-.92,9.91-2.52l108.73,65.77c-.01.27-.04.53-.04.8,0,.29.03.57.04.85l-108.38,65.94c-3.03-1.73-6.52-2.74-10.26-2.74s-7.23,1.01-10.26,2.74L41.33,106.28c.01-.29.04-.57.04-.85,0-.31-.03-.6-.05-.91l108.03-66.1c3.11,1.86,6.73,2.96,10.62,2.96ZM289,256.95l-108.38-65.94c.01-.29.04-.57.04-.85s-.03-.57-.04-.85l108.38-65.94c.09.05.17.11.26.16v133.26c-.09.05-.17.11-.26.16ZM30.95,123.37l108.38,65.94c-.01.29-.04.57-.04.85s.03.57.04.85l-108.38,65.94c-.09-.05-.17-.11-.26-.16V123.53c.09-.05.17-.11.26-.16ZM41.33,274.04l108.38-65.94c.09.05.17.11.26.16v133.26c-.09.05-.17.11-.26.16l-108.38-65.94c.01-.29.04-.57.04-.85s-.03-.57-.04-.85ZM169.98,341.53v-133.26c.09-.05.17-.11.26-.16l108.38,65.94c-.01.29-.04.57-.04.85s.03.57.04.85l-108.38,65.94c-.09-.05-.17-.11-.26-.16Z" />
    </svg>
  )
}

/** The horizontal "LATTICE" logotype. */
export function LatticeLogotype({ height = 14, ...rest }: BrandProps) {
  return (
    <svg
      height={height}
      width={widthFor(LOGOTYPE, height)}
      viewBox={box(LOGOTYPE)}
      fill="currentColor"
      role="img"
      aria-label="Lattice"
      {...rest}
    >
      <polygon points="319.93 21.75 299.34 21.81 299.32 30.87 319.94 30.87 319.92 37.18 292.96 37.25 292.97 0 319.9 -.01 319.92 6.29 299.28 6.33 299.29 15.57 319.89 15.56 319.93 21.75" />
      <path d="M255.62,30.63l16.97.3-.05,6.3-17.14-.15c-8.19-.64-14.38-7.1-15.81-15.01-1.99-10.95,5.57-21.36,16.75-21.98l16.25-.11v6.29s-15.77.21-15.77.21c-5.49.07-9.59,4.1-10.81,9.35-1.53,6.56,2.37,13.92,9.62,14.8Z" />
      <polygon points="80.29 37.4 67.99 8.21 55.52 37.11 48.59 37.2 64.56 .03 71.25 0 86.97 37.14 80.29 37.4" />
      <polygon points="126.64 37.11 120.42 37.56 120.32 6.39 107.4 6.33 107.34 .03 139.54 0 139.48 6.32 126.65 6.38 126.64 37.11" />
      <polygon points="179.13 37.13 172.91 37.48 172.85 6.38 159.91 6.25 160.02 .02 192.18 -.01 192.19 6.27 179.17 6.4 179.13 37.13" />
      <polygon points="28.18 30.87 28.21 37.17 6.95 37.2 0 37.47 0 0 6.26 0 6.33 30.85 28.18 30.87" />
      <rect
        x="196.97"
        y="15.6"
        width="37.51"
        height="6.3"
        transform="translate(196.85 234.46) rotate(-89.97)"
      />
    </svg>
  )
}

/** The horizontal logotype with the ™ symbol — for first/primary placements. */
export function LatticeLogotypeTM({ height = 14, ...rest }: BrandProps) {
  return (
    <svg
      height={height}
      width={widthFor(LOGOTYPE_TM, height)}
      viewBox={box(LOGOTYPE_TM)}
      fill="currentColor"
      role="img"
      aria-label="Lattice"
      {...rest}
    >
      <polygon points="315.75 21.47 295.43 21.52 295.41 30.46 315.77 30.47 315.74 36.7 289.13 36.76 289.14 0 315.72 -.01 315.74 6.21 295.37 6.25 295.38 15.36 315.71 15.36 315.75 21.47" />
      <path d="M252.28,30.23l16.74.3-.05,6.22-16.92-.15c-8.08-.63-14.19-7.01-15.61-14.82-1.96-10.81,5.5-21.08,16.53-21.69l16.04-.11v6.21s-15.56.21-15.56.21c-5.42.07-9.46,4.04-10.67,9.23-1.51,6.48,2.34,13.74,9.5,14.61Z" />
      <polygon points="79.24 36.91 67.1 8.1 54.8 36.63 47.95 36.72 63.71 .03 70.32 0 85.83 36.65 79.24 36.91" />
      <polygon points="124.99 36.63 118.85 37.07 118.75 6.31 105.99 6.24 105.94 .03 137.71 0 137.66 6.24 125 6.3 124.99 36.63" />
      <polygon points="176.79 36.64 170.65 36.99 170.6 6.3 157.82 6.17 157.93 .02 189.67 -.01 189.68 6.19 176.83 6.31 176.79 36.64" />
      <polygon points="27.82 30.47 27.84 36.68 6.86 36.71 0 36.98 0 0 6.18 0 6.24 30.45 27.82 30.47" />
      <rect
        x="194.4"
        y="15.39"
        width="37.02"
        height="6.22"
        transform="translate(194.28 231.4) rotate(-89.97)"
      />
      <path d="M338.04,4.52h-.76V.66h-1.41V0h3.6v.67h-1.43v3.86ZM340.74,4.52h-.7V0h.87l1.54,3.39h.03l1.56-3.39h.86v4.53h-.74V1.25h-.03l-1.5,3.27h-.4l-1.46-3.27h-.03v3.27Z" />
    </svg>
  )
}
