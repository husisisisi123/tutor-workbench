import { useEffect, useState } from 'react'

// 断点查询 hook：抽屉宽度 / 是否全屏 Sheet 都要跟着 375px 断点走（01-11 / 01-13）。
// 为什么用 matchMedia 而不是监听 resize：只在跨断点时触发一次 setState，
// 拖窗口时不会每像素重渲染整页，也不会在移动端地址栏收起时抖动。
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** 375px 验收用的移动断点：与 dashboard.css 里 767px 断点保持一致。 */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
