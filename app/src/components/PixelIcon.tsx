import type { ComponentType, SVGProps } from 'react'
import { ArrowRight } from 'pixelarticons/react/ArrowRight'
import { ArrowUp } from 'pixelarticons/react/ArrowUp'
import { ChartBarBig } from 'pixelarticons/react/ChartBarBig'
import { Check } from 'pixelarticons/react/Check'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { CircuitBoard } from 'pixelarticons/react/CircuitBoard'
import { Cpu } from 'pixelarticons/react/Cpu'
import { Flag } from 'pixelarticons/react/Flag'
import { GalleryThumbnails } from 'pixelarticons/react/GalleryThumbnails'
import { GitBranch } from 'pixelarticons/react/GitBranch'
import { GitMerge } from 'pixelarticons/react/GitMerge'
import { Grid3x3 } from 'pixelarticons/react/Grid3x3'
import { Home } from 'pixelarticons/react/Home'
import { Leaf } from 'pixelarticons/react/Leaf'
import { LetterQCircle } from 'pixelarticons/react/LetterQCircle'
import { Library } from 'pixelarticons/react/Library'
import { Lock } from 'pixelarticons/react/Lock'
import { MapPin } from 'pixelarticons/react/MapPin'
import { MoreHorizontal } from 'pixelarticons/react/MoreHorizontal'
import { Plus } from 'pixelarticons/react/Plus'
import { Send } from 'pixelarticons/react/Send'
import { SettingsCog } from 'pixelarticons/react/SettingsCog'
import { Sparkle } from 'pixelarticons/react/Sparkle'

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

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const icons = {
  arrow: ArrowRight,
  atom: CircuitBoard,
  book: Library,
  brain: Cpu,
  branch: GitBranch,
  chart: ChartBarBig,
  check: Check,
  'chevron-left': ChevronLeft,
  compass: MapPin,
  flag: Flag,
  grid: Grid3x3,
  help: LetterQCircle,
  home: Home,
  leaf: Leaf,
  lock: Lock,
  map: GalleryThumbnails,
  merge: GitMerge,
  more: MoreHorizontal,
  plus: Plus,
  send: Send,
  settings: SettingsCog,
  spark: Sparkle,
  up: ArrowUp,
} satisfies Record<PixelIconName, IconComponent>

type PixelIconProps = SVGProps<SVGSVGElement> & {
  name: PixelIconName
}

export function PixelIcon({ name, ...props }: PixelIconProps) {
  const Icon = icons[name]

  return <Icon aria-hidden="true" focusable="false" {...props} />
}
