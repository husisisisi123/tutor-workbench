// P2 每日反馈（#3/#4/#5）的派生层。
// 为什么单独一层：座位卡片、编辑弹窗、家长预览三处都要回答「完成度 n/9、状态怎么显示、红字写什么」，
// 各写一遍会出现「已退回」在卡片上被显示成「草稿」这类口径分裂（#5 四态不加新状态）。
// 怎么运行：全部是纯函数——输入是 api 拉来的 Student/Feedback/SeatConfig，输出是视图模型或座位配置的下一状态；
// 不写数据、不读 localStorage，落库由页面调 api.saveSeatConfig / saveFeedback 完成。
import type { Feedback, HomeworkItem, SeatConfig, Student } from '@/types'
import { tokens } from '@/theme/tokens'

export const C = tokens.color

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error'
export interface ToneStyle { bg: string; text: string; border: string }

// 状态徽标统一写法（MASTER-REACT §1.3：浅底 + 深字，不用纯色块）。
// 琥珀与 warning 同用 warningBg/warningText：本页琥珀只落在「请假 / 已退回」两个状态标签上，
// 与 #4 的「请假整单替换」、#5 的「退回=draft+reject_reason」一一对应，不另造色值。
export const toneStyles: Record<Tone, ToneStyle> = {
  neutral: { bg: C.bgHover, text: C.textSecondary, border: C.border },
  primary: { bg: C.primaryBg, text: C.primaryTextHover, border: C.primaryBg },
  success: { bg: C.successBg, text: C.successText, border: C.successBg },
  warning: { bg: C.warningBg, text: C.warningText, border: C.warningBg },
  error: { bg: C.errorBg, text: C.errorText, border: C.errorBg },
}

/** 完成度分母：9 项作业清单（#4 决议：完成度 = 勾选数 / 9）。 */
export const HOMEWORK_TOTAL = 9

/**
 * 9 项模板文案的本地备份。
 * 为什么不在页面里从 seed 取：api.ts 只暴露数据读写、不导出模板常量（页面不应越过门面 import seed）；
 * 但「请假切回非请假」时需要按模板重建清单，所以留一份同源文案，改动时与 mock/seed.ts 的
 * HOMEWORK_LABELS 同步（已在交付回报里列为待办：让 api 导出模板）。
 */
export const TEMPLATE_LABELS = [
  '语文抄写', '语文阅读', '数学计算', '数学练习册', '英语单词',
  '英语朗读', '科学实验记录', '课外阅读', '错题订正',
]

export interface StatusView {
  /** 完整文案（卡片、弹窗标题） */
  label: string
  /** 角标短文案（空间小的地方用） */
  short: string
  tone: Tone
  /** 请假原因 / 退回原因等补充说明 */
  detail?: string
}

/**
 * 四态（+ 请假覆盖）的统一视图模型。
 * 口径（#5 决议）：退回不新增状态，是 draft + reject_reason；请假是整单替换，优先级高于状态。
 */
export function statusView(fb?: Feedback): StatusView {
  if (!fb) return { label: '待反馈', short: '待反馈', tone: 'neutral' }
  if (fb.leave) return { label: '请假', short: '请假', tone: 'warning', detail: fb.leave_reason }
  if (fb.status === 'draft' && fb.reject_reason) {
    return { label: '已退回 · ' + fb.reject_reason, short: '已退回', tone: 'warning', detail: fb.reject_reason }
  }
  if (fb.status === 'pending_review') return { label: '待审核', short: '待审核', tone: 'warning' }
  if (fb.status === 'published') return { label: '已发布', short: '已发布', tone: 'success' }
  return { label: '草稿', short: '草稿', tone: 'neutral' }
}

/** 按模板重建 9 项清单（请假切回、或重置个别覆盖时用）。 */
export function makeTemplateHomework(): HomeworkItem[] {
  return TEMPLATE_LABELS.map((label, i) => ({
    id: 'hw-' + (i + 1),
    label,
    done: false,
    // 第 8 项书名页码可逐生改（#4 决议：Excel 里因人而异）
    book: i === 7 ? '《小王子》' : undefined,
    page: i === 7 ? '第 12 页' : undefined,
  }))
}

export function doneCount(fb?: Feedback): number {
  return fb ? fb.homework_items.filter((h) => h.done).length : 0
}

/** 卡片上的「8/9」；请假单不参与完成度（#4：请假整单替换，不保留清单）。 */
export function completionText(fb?: Feedback): string {
  if (!fb || fb.leave) return '—'
  return doneCount(fb) + '/' + HOMEWORK_TOTAL
}

/** 完成度百分比（0~1），卡片进度条与弹窗共用。 */
export function completionRatio(fb?: Feedback): number {
  if (!fb || fb.leave) return 0
  return doneCount(fb) / HOMEWORK_TOTAL
}

/**
 * 红字文案与语义（02-A3：红字 = 薄弱 / 错题提示，不因布局重排改变归属）。
 * 优先级：请假原因 > 反馈单里的错题分析 > 错题库未掌握题数 > 无提示。
 * 为什么用 student_id 关联错题库而不是座位坐标：红字跟着学生走，换座/重排后语义不变（02-A3）。
 */
export function weakHint(fb: Feedback | undefined, unmastered: number): { text: string; tone: Tone } {
  if (fb?.leave) return { text: '请假：' + (fb.leave_reason || '家长已请假'), tone: 'neutral' }
  if (fb?.mistake_analysis) return { text: fb.mistake_analysis, tone: 'error' }
  if (unmastered > 0) return { text: '未掌握错题 ' + unmastered + ' 题', tone: 'error' }
  if (!fb) return { text: '尚未填写反馈', tone: 'neutral' }
  return { text: '本次无薄弱点提示', tone: 'neutral' }
}

/** 「已反馈 / 待反馈」角标（#4 决议 8：卡片新增角标，五要素布局不动）。 */
export function feedbackBadge(fb?: Feedback): { text: string; tone: Tone } {
  if (!fb) return { text: '待反馈', tone: 'neutral' }
  if (fb.leave) return { text: '已反馈', tone: 'primary' }
  if (doneCount(fb) > 0 || fb.comment.trim()) return { text: '已反馈', tone: 'primary' }
  return { text: '待反馈', tone: 'neutral' }
}

export function scoreText(fb?: Feedback): string {
  if (!fb || fb.leave) return '—'
  if (fb.score === undefined || fb.score === null) return '未填分'
  return String(fb.score) + (fb.score_full ? ' / ' + fb.score_full : '')
}

/** 深拷贝一份反馈单再编辑：db 里是引用对象，直接改会绕过 api.saveFeedback 的完成度重算。 */
export function cloneFeedback(fb: Feedback): Feedback {
  return JSON.parse(JSON.stringify(fb)) as Feedback
}

/** M月D日 · 周X（不依赖 dayjs 中文 locale，避免全局 locale 未加载时出现英文星期）。 */
export function dateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日 · ' + week
}

/** ISO 时间取 HH:mm；种子数据都是 +08:00 文本，切片即可，避免时区换算把 19:30 变成 11:30。 */
export function timeLabel(iso?: string): string {
  if (!iso) return '—'
  const m = iso.match(/T(\d{2}):(\d{2})/)
  return m ? m[1] + ':' + m[2] : '—'
}

// ---------- 座位（#3 v2：{grid, seats[]}，退班只移出 seats 不删学生） ----------

/** 座位按旧坐标行优先排序，得到「相对顺序」——行列变更时按它稳定重排（02-03）。 */
export function orderedSeats(seat: SeatConfig): SeatConfig['seats'] {
  return [...seat.seats].sort((a, b) => a.r - b.r || a.c - b.c)
}

/**
 * 行列变更：先按原网格行优先取出相对顺序，再按新网格行优先落座。
 * 返回 null 表示新网格容量不足（调用方给错误提示，不静默丢学生）。
 */
export function reflowSeat(seat: SeatConfig, rows: number, cols: number): SeatConfig | null {
  if (rows * cols < seat.seats.length) return null
  const seats = orderedSeats(seat).map((s, i) => ({ student_id: s.student_id, r: Math.floor(i / cols), c: i % cols }))
  return { grid: { rows, cols }, seats }
}

/**
 * 拖拽落点：占用即互换；空位即移动（#3 v1：空位换座、占用互换）。
 * 只改坐标，不碰学生与反馈数据——这是「退班拖回名单不删数据」的前提。
 */
export function moveSeat(seat: SeatConfig, studentId: string, r: number, c: number): SeatConfig {
  const seats = seat.seats.map((s) => ({ ...s }))
  const from = seats.find((s) => s.student_id === studentId)
  const target = seats.find((s) => s.r === r && s.c === c)
  if (from) {
    if (target && target.student_id !== studentId) {
      const tr = from.r
      const tc = from.c
      from.r = target.r
      from.c = target.c
      target.r = tr
      target.c = tc
    } else {
      from.r = r
      from.c = c
    }
  } else {
    // 从右侧「未入座」边栏拖上墙：目标已有学生时，把原学生退回名单而不是覆盖
    const occupied = seats.findIndex((s) => s.r === r && s.c === c)
    if (occupied >= 0) seats.splice(occupied, 1)
    seats.push({ student_id: studentId, r, c })
  }
  return { ...seat, seats }
}

/** 从边栏拖回名单：只移除座位记录，学生与反馈数据全部保留（#3 决议）。 */
export function unseatStudent(seat: SeatConfig, studentId: string): SeatConfig {
  return { ...seat, seats: seat.seats.filter((s) => s.student_id !== studentId) }
}

/** 未入座名单：有学生档案但没有座位的学生（退班 / 新录入）。 */
export function unseatedStudents(students: Student[], seat: SeatConfig): Student[] {
  const set = new Set(seat.seats.map((s) => s.student_id))
  return students.filter((s) => !set.has(s.id))
}

// ---------- mock 文案库（AI 草稿、模拟助教、退回原因） ----------

export const ASSISTANT_COMMENTS = [
  '今日作业全部完成，课堂上能主动回答问题，计算正确率比昨天有提升。',
  '完成度一般，阅读题有两处没读原文找依据，已当面讲解并订正。',
  '数学计算进步明显，英语单词拼写还需巩固，建议今晚再听写一遍。',
  '作业按时完成，错题已逐条分析，明天安排 10 分钟同类题巩固。',
]

export const MISTAKE_ANALYSES = [
  '计算粗心，进位漏写 3 处',
  '审题不清，把「至少」看成「恰好」',
  '分数加减法通分错误，概念未掌握',
  '单位换算不熟，面积单位写成厘米',
]

export const REJECT_REASONS = [
  '反馈正文与作业清单不一致，请核对后再交',
  '错题分析缺少错因，请补充具体薄弱点',
  '家长版表述过于笼统，请具体到作业项',
]

/** 「入错题本」的错因 5 选 1（与 types.ts 的 MistakeCause 对齐，文案同 utils/format.ts）。 */
export const MISTAKE_CAUSE_OPTIONS = [
  { value: 'concept', label: '概念不清' },
  { value: 'calc', label: '计算错误' },
  { value: 'reading', label: '审题不清' },
  { value: 'careless', label: '粗心' },
  { value: 'unlearned', label: '未学' },
]

/** AI 正文草稿：按反馈单事实拼段落，variant 用于「重新生成」时换措辞（#4 决议 10）。 */
export function buildAiBody(fb: Feedback, studentName: string, variant = 0): string {
  const done = doneCount(fb)
  const openers = [
    studentName + ' 今天完成 ' + done + '/9 项作业，整体节奏稳定。',
    studentName + ' 今日作业完成 ' + done + ' 项，课堂参与度不错。',
    '今日 ' + studentName + ' 完成 ' + done + ' 项作业，完成质量中等偏上。',
  ]
  const scoreLine = fb.score !== undefined ? '本次得分 ' + fb.score + ' 分。' : '本次未记录分数。'
  const mistakeLine = fb.mistake_analysis
    ? '错题分析：' + fb.mistake_analysis + '，已当面讲解并订正。'
    : '错题已全部订正，没有遗留问题。'
  const advice = done >= 8
    ? '建议明天保持节奏，尝试加一道拓展题。'
    : '建议先补齐未完成项，再把错题同类题做一遍。'
  return [openers[variant % openers.length] + scoreLine, mistakeLine, advice].join('\n')
}

/** 家长版摘要：3 句，给家长看的短摘要（#4「AI 生成家长版」）。 */
export function buildParentSummary(fb: Feedback, studentName: string, variant = 0): string {
  const done = doneCount(fb)
  const s1 = '孩子今天完成 ' + done + '/9 项作业' + (fb.score !== undefined ? '，本次得分 ' + fb.score + ' 分' : '') + '。'
  const s2 = fb.mistake_analysis ? '主要薄弱点：' + fb.mistake_analysis + '。' : '今日作业没有明显薄弱点。'
  const s3 = done >= 8
    ? '请家长今晚抽 10 分钟检查订正签字，保持这个节奏。'
    : '请家长今晚督促补完未完成项，并在作业本上签字。'
  return [s1, s2, s3][variant % 3] + (variant % 3 === 0 ? '' : '')
}
/**
 * 模拟助教的「填单」动作（#5：复用 03 的 9 项模板结构 + 预置文案库随机拼）。
 * 怎么运行：按随机完成率勾选清单 → 分数 62–99 → 有未完成项时带一条错题分析 → 评论从文案库取；
 * 返回新对象而不改入参，调用方用 api.saveFeedback → submitFeedback 走正常状态迁移。
 */
export function simulateAssistantFill(fb: Feedback): Feedback {
  const total = HOMEWORK_TOTAL
  const done = 4 + Math.floor(Math.random() * 6) // 4~9 项完成，制造正常的完成度分布
  const base = fb.homework_items.length ? fb.homework_items : makeTemplateHomework()
  const items = base.map((item, i) => ({ ...item, done: i < done }))
  const score = 62 + Math.floor(Math.random() * 38)
  const mistake = done < total ? MISTAKE_ANALYSES[Math.floor(Math.random() * MISTAKE_ANALYSES.length)] : undefined
  return {
    ...fb,
    leave: false,
    leave_reason: undefined,
    homework_items: items,
    completion: done / total,
    score,
    score_full: fb.score_full ?? 100,
    subject_details: fb.subject_details.length ? fb.subject_details : [
      { subject: '数学', score, full_score: 100 },
    ],
    mistake_analysis: mistake,
    comment: ASSISTANT_COMMENTS[Math.floor(Math.random() * ASSISTANT_COMMENTS.length)],
    attachments: fb.attachments ?? [],
    updated_at: new Date().toISOString(),
  }
}

/** 下一单模拟间隔：20–40 秒（#5 决议）。 */
export function nextSimInterval(): number {
  return 20 + Math.floor(Math.random() * 21)
}
