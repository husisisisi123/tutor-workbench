import { useCallback, useEffect, useRef, useState } from 'react'

// 统一的异步数据加载 hook。为什么不用 React Query：demo 只需要「加载 + 手动刷新」，
// 多一个依赖不值得；这里用 alive 标记防止卸载后 setState（#2 工程约定：不引多余库）。
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setLoading(true)
    loader()
      .then((d) => { if (alive.current) setData(d) })
      .finally(() => { if (alive.current) setLoading(false) })
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, reload }
}
