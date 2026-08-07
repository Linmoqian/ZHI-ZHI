import type { AppView } from '../types'
import { PixelIcon, type PixelIconName } from './PixelIcon'

type NavRailProps = {
  view: AppView
  onHome: () => void
  onWorkspace: () => void
  onShowSoon: (feature: string) => void
}

const secondaryItems: { label: string; icon: PixelIconName; display: string }[] = [
  { label: '学习收藏', icon: 'book', display: '收藏' },
  { label: '学习进度', icon: 'chart', display: '进度' },
]

export function NavRail({
  view,
  onHome,
  onWorkspace,
  onShowSoon,
}: NavRailProps) {
  return (
    <aside className="nav-rail" aria-label="主导航">
      <button
        className="brand-mark pixel-press"
        type="button"
        aria-label="返回知枝首页"
        onClick={onHome}
      >
        <PixelIcon name="branch" />
      </button>

      <nav className="nav-rail__main">
        <button
          className={`nav-button ${view === 'home' ? 'is-active' : ''}`}
          type="button"
          aria-label="学习首页"
          aria-current={view === 'home' ? 'page' : undefined}
          onClick={onHome}
        >
          <PixelIcon name="home" />
          <span>首页</span>
        </button>
        <button
          className={`nav-button ${view === 'workspace' ? 'is-active' : ''}`}
          type="button"
          aria-label="知识地图"
          aria-current={view === 'workspace' ? 'page' : undefined}
          onClick={onWorkspace}
        >
          <PixelIcon name="grid" />
          <span>地图</span>
        </button>
        {secondaryItems.map((item) => (
          <button
            className="nav-button"
            type="button"
            aria-label={item.label}
            key={item.label}
            onClick={() => onShowSoon(item.label)}
          >
            <PixelIcon name={item.icon} />
            <span>{item.display}</span>
          </button>
        ))}
      </nav>

      <div className="nav-rail__footer">
        <button
          className="nav-button"
          type="button"
          aria-label="设置"
          onClick={() => onShowSoon('设置')}
        >
          <PixelIcon name="settings" />
          <span>设置</span>
        </button>
        <button
          className="nav-button"
          type="button"
          aria-label="帮助"
          onClick={() => onShowSoon('帮助中心')}
        >
          <PixelIcon name="help" />
          <span>帮助</span>
        </button>
      </div>
    </aside>
  )
}
