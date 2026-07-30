import type { SVGProps } from 'react'

export type PixelIconName =
  | 'arrow'
  | 'atom'
  | 'book'
  | 'brain'
  | 'branch'
  | 'chart'
  | 'check'
  | 'chevron-left'
  | 'compass'
  | 'flag'
  | 'grid'
  | 'help'
  | 'home'
  | 'leaf'
  | 'lock'
  | 'map'
  | 'merge'
  | 'more'
  | 'plus'
  | 'send'
  | 'settings'
  | 'spark'
  | 'up'

type PixelIconProps = SVGProps<SVGSVGElement> & {
  name: PixelIconName
}

const iconPaths: Record<PixelIconName, React.ReactNode> = {
  arrow: <path d="M5 11h10V7l5 5-5 5v-4H5z" />,
  atom: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M4 12c0-3 3.6-6 8-6s8 3 8 6-3.6 6-8 6-8-3-8-6Z" />
      <path d="M8 5c2.6-1.5 6.8.2 9 4s1.6 8.2-1 9.7-6.8-.2-9-4S5.4 6.5 8 5Z" />
      <path d="M16 5c-2.6-1.5-6.8.2-9 4s-1.6 8.2 1 9.7 6.8-.2 9-4S18.6 6.5 16 5Z" />
    </>
  ),
  book: (
    <>
      <path d="M4 5h6a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 2z" />
      <path d="M20 5h-6a3 3 0 0 0-3 3v11h6a3 3 0 0 1 3 2z" />
    </>
  ),
  brain: (
    <>
      <path d="M9 4a3 3 0 0 0-5 2v2a3 3 0 0 0 0 5v2a3 3 0 0 0 5 3z" />
      <path d="M15 4a3 3 0 0 1 5 2v2a3 3 0 0 1 0 5v2a3 3 0 0 1-5 3z" />
      <path d="M9 7h2v10H9m6-10h-2v10h2" />
    </>
  ),
  branch: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M7 10v3h10v-3M12 13v2" />
    </>
  ),
  chart: (
    <>
      <rect x="4" y="13" width="3" height="7" />
      <rect x="10" y="8" width="3" height="12" />
      <rect x="16" y="4" width="3" height="16" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 5-5 2 2-5z" />
    </>
  ),
  flag: <path d="M6 21V4h11l-2 3 2 3H6" />,
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8C12.5 12 12 12.4 12 14" />
      <path d="M12 18h.01" />
    </>
  ),
  home: <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3z" />,
  leaf: (
    <>
      <path d="M19 4C11 4 5 8 5 14c0 3 2 5 5 5 6 0 10-6 9-15Z" />
      <path d="M4 21c3-6 7-9 12-12" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
      <path d="M9 3v15m6-12v15" />
    </>
  ),
  merge: (
    <>
      <circle cx="7" cy="5" r="2" />
      <circle cx="17" cy="5" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M7 7v3c0 4 5 3 5 7m5-10v3c0 4-5 3-5 7" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  send: <path d="m3 4 18 8-18 8 3-8zm3 8h9" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
    </>
  ),
  spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z" />,
  up: <path d="m5 12 7-7 7 7m-7-7v15" />,
}

export function PixelIcon({ name, ...props }: PixelIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth="2"
      viewBox="0 0 24 24"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  )
}
