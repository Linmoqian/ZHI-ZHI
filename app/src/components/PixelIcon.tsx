import type { ComponentType, SVGProps } from 'react'
import { ArrowRight } from 'pixelarticons/react/ArrowRight'
import { ArrowsHorizontal } from 'pixelarticons/react/ArrowsHorizontal'
import { ArrowUp } from 'pixelarticons/react/ArrowUp'
import { ChartBarBig } from 'pixelarticons/react/ChartBarBig'
import { Check } from 'pixelarticons/react/Check'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { CircuitBoard } from 'pixelarticons/react/CircuitBoard'
import { Close } from 'pixelarticons/react/Close'
import { Cloud } from 'pixelarticons/react/Cloud'
import { Cpu } from 'pixelarticons/react/Cpu'
import { Eye } from 'pixelarticons/react/Eye'
import { EyeOff } from 'pixelarticons/react/EyeOff'
import { ExternalLink } from 'pixelarticons/react/ExternalLink'
import { Flag } from 'pixelarticons/react/Flag'
import { GalleryThumbnails } from 'pixelarticons/react/GalleryThumbnails'
import { GitBranch } from 'pixelarticons/react/GitBranch'
import { GitMerge } from 'pixelarticons/react/GitMerge'
import { Grid3x3 } from 'pixelarticons/react/Grid3x3'
import { Home } from 'pixelarticons/react/Home'
import { InfoBox } from 'pixelarticons/react/InfoBox'
import { Leaf } from 'pixelarticons/react/Leaf'
import { LetterQCircle } from 'pixelarticons/react/LetterQCircle'
import { Library } from 'pixelarticons/react/Library'
import { Lock } from 'pixelarticons/react/Lock'
import { MapPin } from 'pixelarticons/react/MapPin'
import { MoreHorizontal } from 'pixelarticons/react/MoreHorizontal'
import { Plus } from 'pixelarticons/react/Plus'
import { Send } from 'pixelarticons/react/Send'
import { Server } from 'pixelarticons/react/Server'
import { SettingsCog } from 'pixelarticons/react/SettingsCog'
import { Signal } from 'pixelarticons/react/Signal'
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
  | 'close'
  | 'cloud'
  | 'compass'
  | 'exchange'
  | 'external'
  | 'eye'
  | 'eye-off'
  | 'flag'
  | 'grid'
  | 'help'
  | 'home'
  | 'info'
  | 'leaf'
  | 'lock'
  | 'map'
  | 'merge'
  | 'more'
  | 'plus'
  | 'send'
  | 'server'
  | 'settings'
  | 'signal'
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
  close: Close,
  cloud: Cloud,
  compass: MapPin,
  exchange: ArrowsHorizontal,
  external: ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  flag: Flag,
  grid: Grid3x3,
  help: LetterQCircle,
  home: Home,
  info: InfoBox,
  leaf: Leaf,
  lock: Lock,
  map: GalleryThumbnails,
  merge: GitMerge,
  more: MoreHorizontal,
  plus: Plus,
  send: Send,
  server: Server,
  settings: SettingsCog,
  signal: Signal,
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
