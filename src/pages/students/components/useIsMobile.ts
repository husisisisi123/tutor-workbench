import { useEffect, useState } from 'react'

// 响应式断点 hook（页面私有）：详情页右栏堆叠、双栏弹窗转全屏、编辑器分栏都靠它切结构。
// 为什么用 matchMedia 而不是监听 window.resize：DevTools 设备模拟（375px 验收）会改媒体查询
// 但不一定触发 resize 时机，matchMedia 的 change 事件更可靠（GL-27 / 03-08 / 05-09）。
export function useIsMobile(breakpoint = 720): boolean {
  const query = '(max-width: ' + breakpoint + 'px)'
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMobile
}
