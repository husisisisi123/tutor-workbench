// 看板派生层：四块内容的「3 条 + 一行汇总」全部由 selector 从现有 mock 表算出，不落独立存储（#6 Q5/Q16，01-02）。
// 数据流：DashboardPage 用 useLoad 拉回 students / feedbacks / summary / interactions →
// 本文件的纯函数折成展示行 → MainBlocks 只渲染。口径要改（例如预警三条）只改这里，页面不动。
// 注意：日程与天气/资讯在 api.ts 里没有对应表，这里用「能从数据算的条目 + 演示常量」拼装，
// 缺接口部分已在交付回报里列给 Lead，未私自改 api.ts。
import type { DashboardWidget, Feedback, Student, WarningItem, WidgetKey } from '@/types'
import type { DashboardSummary, ParentInteraction } from '@/mock/api'

export interface TodoItem {
  key: string
  title: string
  meta: string
  /** 待办统一跳反馈页并带 filter（Q5=A：待办 → /feedback?filter=…） */
  to: string
}

export interface ScheduleItem {
  key: string
  time: string
  title: string
  meta: string
  /** 日程不跳转，就地展开的补充信息（Q5=A） */
  detail: string
}

const nameList = (students: Student[], max = 2) =>
  students.slice(0, max).map((s) => s.name).join('、') + (students.length > max ? ' 等' : '')

/** 今日待办：未填写 → 草稿 → 待审核，按「卡住下一步」的顺序取前 3 条。 */
export function deriveTodos(students: Student[], feedbacks: Feedback[]): TodoItem[] {
  const byStudent = new Map(feedbacks.map((f) => [f.student_id, f]))
  const missing = students.filter((s) => !byStudent.has(s.id))
  const drafts = feedbacks.filter((f) => f.status === 'draft')
  const pending = feedbacks.filter((f) => f.status === 'pending_review')
  const items: TodoItem[] = []
  if (missing.length) {
    items.push({ key: 'missing', title: '补写今日反馈', meta: `${nameList(missing)} ${missing.length} 人未填写`, to: '/feedback?filter=empty' })
  }
  if (drafts.length) {
    items.push({ key: 'draft', title: '提交反馈草稿', meta: `${drafts.length} 份草稿待提交审核`, to: '/feedback?filter=draft' })
  }
  if (pending.length) {
    items.push({ key: 'pending', title: '审核待审反馈', meta: `${pending.length} 份已提交，等待审核`, to: '/feedback?filter=pending' })
  }
  if (!items.length) {
    items.push({ key: 'done', title: '今日反馈已全部处理', meta: `${students.length} 名学生均已反馈`, to: '/feedback' })
  }
  return items.slice(0, 3)
}

/**
 * 今日日程：固定三档时间（16:00 辅导 / 17:30 家长沟通 / 19:00 审核），
 * meta 与 detail 都从当天的反馈和留言实时算，不写死人数（否则改数据后看板会说谎）。
 */
export function deriveSchedule(
  summary: DashboardSummary,
  feedbacks: Feedback[],
  students: Student[],
  interactions: { items: ParentInteraction[]; summary: { students: number; unread: number } },
): ScheduleItem[] {
  const nameById = new Map(students.map((s) => [s.id, s.name]))
  const pendingNames = feedbacks
    .filter((f) => f.status === 'pending_review')
    .map((f) => nameById.get(f.student_id) ?? '学生')
    .slice(0, 4)
  return [
    {
      key: 'class',
      time: '16:00',
      title: '作业辅导 · 一号教室',
      meta: `今日已写 ${summary.written}/${summary.total} 份反馈`,
      detail: `${summary.total - summary.written} 人今日反馈未写，辅导时单独核对。`,
    },
    {
      key: 'parent',
      time: '17:30',
      title: '家长沟通',
      meta: `${interactions.summary.students} 位家长 · ${interactions.summary.unread} 条未读`,
      detail: '点开「家长互动」区块可进抽屉直接回复未读留言。',
    },
    {
      key: 'review',
      time: '19:00',
      title: '反馈审核',
      meta: `${summary.pendingReview} 份待审核`,
      detail: pendingNames.length ? '待审名单：' + pendingNames.join('、') : '当前没有待审核反馈。',
    },
  ]
}

/** 预警三条口径的展示文案（口径本身在 api.computeWarnings 里，页面不重复判断）。 */
export const WARNING_META: Record<WarningItem['reason'], { label: string; color: string }> = {
  completion: { label: '完成度', color: 'warning' },
  mistakes: { label: '错题', color: 'error' },
  score_drop: { label: '成绩下滑', color: 'error' },
}

// —— 挂件顺序（#6 Q4=C）：桌面 HTML5 DnD 与移动端 ↑↓ 按钮共用同一份 order 重排逻辑，
//    两套交互只产生一个结果，避免「拖完顺序没存 / 按钮和拖拽各算各的」——
export function sortWidgets(widgets: DashboardWidget[]): DashboardWidget[] {
  return [...widgets].sort((a, b) => a.order - b.order)
}

/** 把 key 移动到 targetKey 的位置，其余顺延，最后按数组下标重排 order（0..n-1）。 */
export function moveWidgetTo(widgets: DashboardWidget[], key: WidgetKey, targetKey: WidgetKey): DashboardWidget[] {
  const list = sortWidgets(widgets)
  const from = list.findIndex((w) => w.key === key)
  const to = list.findIndex((w) => w.key === targetKey)
  if (from < 0 || to < 0 || from === to) return widgets
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return list.map((w, i) => ({ ...w, order: i }))
}

/** 上/下移一位：只在「可见」挂件之间换位（隐藏挂件不参与，重新显示时保持原相对位置）。 */
export function moveWidgetBy(widgets: DashboardWidget[], key: WidgetKey, dir: -1 | 1): DashboardWidget[] {
  const visible = sortWidgets(widgets).filter((w) => w.visible)
  const idx = visible.findIndex((w) => w.key === key)
  const target = visible[idx + dir]
  if (!target) return widgets
  return moveWidgetTo(widgets, key, target.key)
}

export function setWidgetVisible(widgets: DashboardWidget[], key: WidgetKey, visible: boolean): DashboardWidget[] {
  return widgets.map((w) => (w.key === key ? { ...w, visible } : w))
}

export const WIDGET_META: Record<WidgetKey, { name: string; hint: string }> = {
  clock: { name: '时钟', hint: '本地时间，每秒走字' },
  weather: { name: '天气', hint: '演示常量' },
  news: { name: '资讯', hint: '演示常量' },
  links: { name: '快捷链接', hint: '可在自定义里编辑' },
}

// 天气 / 资讯在 api.ts 里没有对应接口，属于纯展示挂件；
// 用本地常量而不是伪造一张表：这两块不参与任何写入与持久化，刷新行为与种子一致。
export const DEMO_WEATHER = {
  condition: '多云转晴',
  temp: 18,
  high: 21,
  low: 11,
  humidity: '62%',
  wind: '东风 2 级',
  quality: '优',
  updated: '08:30',
}

export const DEMO_NEWS = [
  { tag: '通知', title: '秋季家长会定于 11 月 8 日 18:30', meta: '一号教室' },
  { tag: '教研', title: '本周教研：分数应用题的讲法', meta: '周四' },
  { tag: '提醒', title: '10 月课时包对账截止 10/31', meta: '今天' },
]

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 从 feedback_id 解析反馈日期（格式 fb-20261030-stu-01，seed 与 api 统一）。
 * 为什么需要：#13 定案后家长留言分散在 10-28/29/30 三个反馈日，而 listFeedbacks() 默认只返回今天，
 * 抽屉里的「来源反馈 · 日期 · 科目」不能只剩今天，否则老会话会退化成「综合」。页面按 id 反查日期补齐。
 */
export function feedbackDateOf(feedbackId: string): string {
  const matched = /^fb-(\d{4})(\d{2})(\d{2})-/.exec(feedbackId)
  return matched ? matched[1] + '-' + matched[2] + '-' + matched[3] : ''
}

/** URL 是否 http(s)：默认链接合法；自建项不合法只标红、不拦保存（#6 Q6）。 */
export const isHttpUrl = (url: string) => /^https?:\/\//i.test(url.trim())

/** 首字母圆标的稳定色相：同名永远同色，避免每次渲染随机跳色（复用 StudentAvatar 的颜色策略）。 */
export const initialHue = (name: string) => {
  let sum = 0
  for (const ch of name) sum = (sum * 31 + ch.charCodeAt(0)) % 360
  return sum
}