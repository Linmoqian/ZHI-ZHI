// 缓存当前激活供应商方向（local/cloud），供 UI 高亮。
// 与后端事实数据（ProviderSettingsDTO.activeProviderId）配合使用：
// 后端是事实来源，本地缓存仅为减少设置界面打开时的闪烁。

const STORAGE_KEY = 'zhizhi.activeProviderKind'

export type ProviderKind = 'local' | 'cloud'

export function loadActiveProviderKind(): ProviderKind | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'cloud' || value === 'local' ? value : null
  } catch {
    return null
  }
}

export function saveActiveProviderKind(kind: ProviderKind): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind)
  } catch {
    // 隐私模式或配额已满，忽略
  }
}
