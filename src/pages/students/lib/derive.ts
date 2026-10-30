// 派生口径：得分率、班均、弱科、日期文案。
// 为什么单独一层：卡片墙、成绩轨迹、数据分析、学习报告四处都要「某科最近一次得分率」，
// 各写一遍必然出现「92/100」与「0.92」两种单位混用（05-04 要求数字对账一致）。
import dayjs from 'dayjs'
import type { Exam, Subject } from '@/types'
import { MOCK_TODAY } from '@/mock/api'
import type { StudentRecord, StudentRow } from './data'

/** 四科固定顺序：雷达图/数据分析都按这个顺序，避免对象键顺序导致图例跳动。 */
export const SUBJECTS: Subject[] = ['数学', '语文', '英语', '科学']

/** 满分从考试表取，取不到按 100（mock 里所有考试满分都是 100）。 */
export function fullScoreOf(exams: Exam[], examId: string): number {
  return exams.find((e) => e.id === examId)?.full_score ?? 100
}

export interface SubjectStat {
  subject: Subject
  count: number
  avg: number
  max: number
  min: number
  /** 平均得分率 0~1（03-15 的「得分率」） */
  rate: number
}

/** 单生各科统计：均分 / 最高 / 最低 / 得分率（03-15 只留统计）。 */
export function subjectStats(records: StudentRecord[], exams: Exam[]): SubjectStat[] {
  const out: SubjectStat[] = []
  for (const subject of SUBJECTS) {
    const rs = records.filter((r) => r.subject === subject)
    if (!rs.length) continue
    const scores = rs.map((r) => r.score)
    const rates = rs.map((r) => r.score / fullScoreOf(exams, r.exam_id))
    out.push({
      subject,
      count: rs.length,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      max: Math.max(...scores),
      min: Math.min(...scores),
      rate: rates.reduce((a, b) => a + b, 0) / rates.length,
    })
  }
  return out
}

/** 某一科最近一次成绩（records 已按日期升序）。 */
export function latestOfSubject(records: StudentRecord[], subject: Subject): StudentRecord | undefined {
  const rs = records.filter((r) => r.subject === subject)
  return rs[rs.length - 1]
}

/**
 * 班级某科「最近一次」平均得分率：每个学生取该科最后一条，再求平均。
 * 用最近一次而不是全部历史，是因为数据分析 Tab 的对比是「当前水平 vs 班级当前水平」（03-15）。
 */
export function classLatestRate(rows: StudentRow[], exams: Exam[], subject: Subject): number | undefined {
  const rates: number[] = []
  for (const row of rows) {
    const last = latestOfSubject(row.records, subject)
    if (last) rates.push(last.score / fullScoreOf(exams, last.exam_id))
  }
  if (!rates.length) return undefined
  return rates.reduce((a, b) => a + b, 0) / rates.length
}

/** 弱科 = 最近一次得分率最低的科目（#8 规划规则）；无成绩返回 undefined。 */
export function weakSubject(records: StudentRecord[], exams: Exam[]): Subject | undefined {
  const stats = subjectStats(records, exams)
  if (!stats.length) return undefined
  return [...stats].sort((a, b) => a.rate - b.rate)[0].subject
}

/** 相对 mock 当前日期的「N 天前」；同一天显示「今天」（卡片最近动态文案）。 */
export function daysAgoLabel(date: string): string {
  const days = dayjs(MOCK_TODAY).diff(dayjs(date), 'day')
  return days <= 0 ? '今天' : days + ' 天前'
}

/** ISO 时间戳 → YYYY-MM-DD（报告列表/成绩明细的日期列）。 */
export function formatDate(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD')
}

/** 涨跌文案：颜色之外必须有 ▲▼，否则灰度下不可读（GL-08 颜色非唯一手段）。 */
export function trendText(delta: number): string {
  if (delta > 0) return '▲ ' + delta
  if (delta < 0) return '▼ ' + Math.abs(delta)
  return '—'
}
