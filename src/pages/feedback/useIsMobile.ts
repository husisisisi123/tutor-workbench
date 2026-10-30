import { useEffect, useState } from 'react'

// 页面私有断点 hook。
// 为什么用 JS 断点而不是纯 CSS media query：座位墙在 375px 不只是「变窄」，
// 而是整体换成竖列表（02-09），组件结构与拖拽行为都不同，必须让 React 知道断点；
// CSS 媒体查询只能改样式，改不了渲染结构。
// 怎么运行：挂载时读一次 window.innerWidth，resize 时更新，卸载移除监听；767px 以下视为移动端。
const MOBILE_MAX = 767

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= MOBILE_MAX)
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= MOBILE_MAX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}
