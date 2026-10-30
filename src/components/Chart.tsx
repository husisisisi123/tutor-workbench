import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'

// ECharts 薄封装（#2 工程约定：图表用 ECharts，不引 echarts-for-react 减少依赖）。
// 为什么用 ResizeObserver：P3 详情页在 1440×900 与 375px 两种视口都要不溢出，
// 容器尺寸由 CSS 决定，图表必须跟着容器重算，不能靠 window.resize。
export default function Chart({ option, height = 240 }: { option: echarts.EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={ref} style={{ width: '100%', height }} />
}
