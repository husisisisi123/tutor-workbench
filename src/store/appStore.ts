import { create } from 'zustand'
import { MOCK_TODAY } from '@/mock/seed'

// 全局轻量状态：只有「当前 mock 日期」和「刷新信号」。
// 为什么需要刷新信号：P2 编辑面板是独立弹窗、P1/P3 页面各自挂载，
// 编辑保存后靠 bump() 让其他页面的 useEffect 重新拉数据（不引事件总线，见 #4 决议 8）。
interface AppState {
  currentDate: string
  refreshTick: number
  bumpRefresh: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentDate: MOCK_TODAY,
  refreshTick: 0,
  bumpRefresh: () => set((s) => ({ refreshTick: s.refreshTick + 1 })),
}))
