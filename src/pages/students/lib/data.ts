// 学生档案页的数据装配层：把 api 的「学生 / 课时 / 成绩 / 错题关联」拼成卡片墙与详情页共用的行模型。
// 为什么集中在这里：
// 1) 卡片墙（21 张）与详情页右栏、图表、数据分析都要「学生 + 课时 + 最近成绩」；
//    不装配成 StudentRow 的话，每个组件都要重新拉一遍 api，派生口径会分叉（03-02 双视图数据一致）。
// 2) api 没有「一次性取全班成绩/课时」的批量读接口，只能按学生并发 21×2 次
//    getStudentExamRecords + getLessonPackage；这是 mock 内存读取（每次 60–80ms 假延迟），
//    并发后总耗时 ≈ 一次调用，可接受。写入走 saveExamRecord/saveExamRecords/updateLessonPackage 后
//    重新调用本函数即可拿到新值（03-04 / 03-05 / 03-12 的即时刷新）。
import type { Exam, ExamRecord, Student } from '@/types'
import type { MistakeWithStudents } from '@/mock/api'
import { getLessonPackage, getStudentExamRecords, listExams, listMistakes, listStudents } from '@/mock/api'

/** api.getStudentExamRecords 的返回形状：成绩 + 考试名，图表与表格共用。 */
export type StudentRecord = ExamRecord & { exam_name: string }

/** 课时视图：把课时包摊平成页面直接用的一组数字（剩余不为负）。 */
export interface LessonView {
  total: number
  used: number
  remaining: number
  expireAt?: string
}

/** 页面行模型：卡片一屏一张、详情页一份，全部从这一个结构派生。 */
export interface StudentRow {
  student: Student
  lesson: LessonView
  /** 已按日期升序（与折线图 x 轴同序） */
  records: StudentRecord[]
  /** 最近一次考试；同日多科时优先数学（卡片与默认折线都看数学） */
  latest?: StudentRecord
  /** 最近一次与同科上一次的分差，单位分；无上一次为 0 */
  delta: number
  /** 未掌握错题数（来自 mistake_student 关联） */
  unmastered: number
}

export interface StudentsBundle {
  rows: StudentRow[]
  exams: Exam[]
  mistakes: MistakeWithStudents[]
}

/** 课时风险阈值（#12 03-13）：<5 节红竖条、5–10 节琥珀、其余透明。魔法数字出处即票面。 */
export const LESSON_URGENT = 5
export const LESSON_TENSE = 10

export type RiskLevel = 'urgent' | 'tense' | 'normal'

/** 只按剩余课时判风险：颜色编码的是「续费风险」，不与成绩下滑混用（03-13 口径）。 */
export function riskOf(remaining: number): RiskLevel {
  if (remaining < LESSON_URGENT) return 'urgent'
  if (remaining <= LESSON_TENSE) return 'tense'
  return 'normal'
}

/**
 * 「待跟进」口径：未掌握错题 ≥2 道。为什么是 2 而不是 3：
 * 种子里每生未掌握错题 0–2 道（21 条关联分布 1 道 8 人 / 2 道 5 人），阈值放到 3 会恒为 0 人，
 * 页头「待跟进 N 人」与筛选就失去意义；取 2 命中 5 人，与 PRD 页头示例「待跟进 5 人」一致。
 * 与看板预警（#6，未掌握 ≥5 才入池）同源但更轻，只在档案页做扫读标记，不合并两套口径。
 */
export const FOLLOW_MISTAKE_THRESHOLD = 2

/** 读齐一页所需数据；录入成绩/登记课时后重新调用即可拿到新值。 */
export async function loadStudentsBundle(): Promise<StudentsBundle> {
  const [students, exams, mistakes] = await Promise.all([listStudents(), listExams(), listMistakes()])
  const rows = await Promise.all(
    students.map(async (student): Promise<StudentRow> => {
      const [baseRecords, lesson] = await Promise.all([
        getStudentExamRecords(student.id),
        getLessonPackage(student.id),
      ])
      const records = sortRecords(baseRecords)
      const latest = pickLatest(records)
      const unmastered = mistakes.reduce(
        (n, m) => n + m.associations.filter((a) => a.student_id === student.id && a.mastery === 'unmastered').length,
        0,
      )
      return {
        student,
        lesson: lessonView(lesson),
        records,
        latest,
        delta: deltaOf(records, latest),
        unmastered,
      }
    }),
  )
  return { rows, exams, mistakes }
}

/** 日期升序；同日按考试名，保证同一份数据在图表、表格、卡片里的顺序稳定。 */
export function sortRecords(records: StudentRecord[]): StudentRecord[] {
  return [...records].sort((a, b) => a.date.localeCompare(b.date) || a.exam_name.localeCompare(b.exam_name))
}

function lessonView(lesson: Awaited<ReturnType<typeof getLessonPackage>>): LessonView {
  const total = lesson?.total ?? 0
  const used = lesson?.used ?? 0
  return { total, used, remaining: Math.max(total - used, 0), expireAt: lesson?.expire_at }
}

/**
 * 「最近考试」= 日期最新的一条；同日多科时优先数学。
 * 这么取是因为卡片与成绩轨迹 Tab 默认都看数学，避免同一天显示成英语、点进去却是数学折线。
 */
function pickLatest(records: StudentRecord[]): StudentRecord | undefined {
  if (!records.length) return undefined
  const lastDate = records[records.length - 1].date
  const sameDay = records.filter((r) => r.date === lastDate)
  return sameDay.find((r) => r.subject === '数学') ?? sameDay[sameDay.length - 1]
}

/** 与同科上一次（考试不同）的分差；单条录入覆盖同一次考试时不算环比。 */
function deltaOf(records: StudentRecord[], latest: StudentRecord | undefined): number {
  if (!latest) return 0
  const previous = records.filter(
    (r) => r.subject === latest.subject && r.exam_id !== latest.exam_id && r.date <= latest.date,
  )
  const prev = previous[previous.length - 1]
  return prev ? latest.score - prev.score : 0
}

/** 学生是否属于「待跟进」：卡片墙筛选与页头统计共用，保证数字与列表一致（03-02）。 */
export function isFollowUp(row: StudentRow): boolean {
  return row.unmastered >= FOLLOW_MISTAKE_THRESHOLD
}

/** 课时告急筛选：剩余 ≤3 节（种子保证这 4 人同时 <5，即竖条已转红）。 */
export function isLessonUrgent(row: StudentRow): boolean {
  return row.lesson.remaining <= 3
}
