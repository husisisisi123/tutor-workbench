import { useEffect, useState } from 'react'

// 375px 移动端断点。为什么用 matchMedia 而不是 CSS 媒体查询：
// 成长规划桌面用 antd Table（行=学生），375px 要换成竖列卡片；表格列的显隐由 JS 控制，
// 只能读视口宽度；监听 change 让 DevTools 拖宽度时即时切换。
// 同一逻辑在 mistakes/ 下有一份副本——两个页面目录互不依赖，避免跨页 import。
export function useIsMobile(maxWidth = 768) {
  const query = '(max-width: ' + maxWidth + 'px)'
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMobile
}
