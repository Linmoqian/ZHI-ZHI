import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TitleBar } from './components/TitleBar'

// 桌面 WebView：禁用浏览器默认右键菜单。
// 产品自定义菜单（如地图节点右键）如后续引入，在此处放行对应区域。
window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

// 无边框桌面窗口：顶层为自定义标题栏，下方为应用主体。
// 在纯浏览器环境（无 @tauri-apps）下 TitleBar 内部不依赖 Tauri，静默退化。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="desktop-shell">
      <TitleBar />
      <App />
    </div>
  </StrictMode>,
)
