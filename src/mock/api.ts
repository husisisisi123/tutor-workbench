// mock API 门面。页面只依赖本文件，不直接摸 db / seed（#2：db.ts 内存态 + api.ts 异步门面）。
// 所有函数返回 Promise 并带 120ms 假延迟，模拟真实网络；调用方按异步处理，未来换真接口不改页面。
import type {
  DashboardConfig, Exam, ExamRecord, Feedback, GrowthPlan, LearningReport, LessonPackage, Mastery, Mistake,
  MistakeStudent, ParentMessage, SeatConfig, Student, Tag, WarningItem,
} from '@/types'
import { persistDashboard, persistSeat, db } from './db'
import { HOMEWORK_LABELS, MOCK_TODAY, TERM } from './seed'

const delay = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- 学生 ----------
export async function listStudents(): Promise<Student[]> {
  await delay()
  return db.students
}

export async function getStudent(id: string): Promise<Student | undefined> {
  await delay(60)
  return db.students.find((s) => s.id === id)
}

export async function addStudent(input: Omit<Student, 'id' | 'avatar_hue' | 'enrolled_at'>): Promise<Student> {
  await delay()
  const id = 'stu-' + String(db.students.length + 1).padStart(2, '0')
  const student: Student = { ...input, id, avatar_hue: (db.students.length * 47) % 360, enrolled_at: MOCK_TODAY }
  db.students.push(student)
  return student
}

// ---------- 座位（#3：行列 + 座位独立配置，退班只移出 seats 不删学生） ----------
export async function getSeatConfig(): Promise<SeatConfig> {
  await delay(60)
  return db.seat
}

export async function saveSeatConfig(config: SeatConfig): Promise<void> {
  await delay(60)
  persistSeat(config)
}

// ---------- 每日反馈（#4） ----------
export async function listFeedbacks(date = MOCK_TODAY): Promise<Feedback[]> {
  await delay()
  return db.feedbacks.filter((f) => f.date === date)
}

export async function getFeedback(studentId: string, date = MOCK_TODAY): Promise<Feedback | undefined> {
  await delay(60)
  return db.feedbacks.find((f) => f.student_id === studentId && f.date === date)
}

export async function createFeedback(studentId: string, date = MOCK_TODAY): Promise<Feedback> {
  await delay(80)
  const existing = db.feedbacks.find((f) => f.student_id === studentId && f.date === date)
  if (existing) return existing
  const now = new Date().toISOString()
  const fb: Feedback = {
    id: 'fb-' + date.replace(/-/g, '') + '-' + studentId,
    student_id: studentId, date, status: 'draft', leave: false,
    homework_items: HOMEWORK_LABELS.map((label, i) => ({ id: 'hw-' + (i + 1), label, done: false })),
    completion: 0, subject_details: [], comment: '',
    created_at: now, updated_at: now,
  }
  db.feedbacks.push(fb)
  return fb
}

export async function saveFeedback(feedback: Feedback): Promise<Feedback> {
  await delay(80)
  const idx = db.feedbacks.findIndex((f) => f.id === feedback.id)
  const next: Feedback = {
    ...feedback,
    completion: feedback.leave ? 0 : Math.round((feedback.homework_items.filter((h) => h.done).length / HOMEWORK_LABELS.length) * 100) / 100,
    updated_at: new Date().toISOString(),
  }
  if (idx >= 0) db.feedbacks[idx] = next
  else db.feedbacks.push(next)
  return next
}

/** 提交审核：三项校验（作业清单非空、正文非空、分数非空）在 UI 做，这里只切状态。 */
export async function submitFeedback(id: string): Promise<Feedback> {
  await delay(120)
  const fb = db.feedbacks.find((f) => f.id === id)!
  fb.status = 'pending_review'
  fb.updated_at = new Date().toISOString()
  return fb
}

export async function approveFeedback(id: string): Promise<Feedback> {
  await delay(100)
  const fb = db.feedbacks.find((f) => f.id === id)!
  fb.status = 'published'
  fb.reject_reason = undefined
  fb.reviewer = '王老师'
  fb.updated_at = new Date().toISOString()
  return fb
}

/** 退回 = draft + reject_reason，不新增状态（#5 决议）。 */
export async function rejectFeedback(id: string, reason: string): Promise<Feedback> {
  await delay(100)
  const fb = db.feedbacks.find((f) => f.id === id)!
  fb.status = 'draft'
  fb.reject_reason = reason
  fb.updated_at = new Date().toISOString()
  return fb
}

export async function withdrawFeedback(id: string): Promise<Feedback> {
  await delay(80)
  const fb = db.feedbacks.find((f) => f.id === id)!
  fb.status = 'pending_review'
  fb.updated_at = new Date().toISOString()
  return fb
}

// ---------- 看板派生（#6：四块内容只算不存） ----------
export interface DashboardSummary {
  written: number
  total: number
  pendingReview: number
  warnings: WarningItem[]
  warningsTop: WarningItem[]
}

function completionOfDay(studentId: string, date: string): number | undefined {
  return db.feedbacks.find((f) => f.student_id === studentId && f.date === date)?.completion
}

/** 学情预警三条口径（#6）：完成度<60% 连续≥2 天 / 未掌握错题≥5 / 成绩环比降≥10 分；命中任一入池。 */
export function computeWarnings(): WarningItem[] {
  const out: WarningItem[] = []
  for (const s of db.students) {
    const today = completionOfDay(s.id, MOCK_TODAY)
    const day1 = completionOfDay(s.id, '2026-10-29')
    const day2 = completionOfDay(s.id, '2026-10-28')
    if (today !== undefined && day1 !== undefined && day2 !== undefined && today < 0.6 && day1 < 0.6 && day2 < 0.6) {
      out.push({ student_id: s.id, reason: 'completion', detail: '连续 3 天完成度 <60%' })
      continue
    }
    const unmastered = db.mistakeStudents.filter((m) => m.student_id === s.id && m.mastery === 'unmastered').length
    if (unmastered >= 5) {
      out.push({ student_id: s.id, reason: 'mistakes', detail: '未掌握错题 ' + unmastered + ' 题' })
      continue
    }
    const math = db.examRecords.filter((r) => r.student_id === s.id && r.subject === '数学').sort((a, b) => a.date.localeCompare(b.date))
    if (math.length >= 2) {
      const last = math[math.length - 1].score
      const prev = math[math.length - 2].score
      if (prev - last >= 10) out.push({ student_id: s.id, reason: 'score_drop', detail: '数学环比降 ' + (prev - last) + ' 分' })
    }
  }
  return out
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await delay(80)
  const today = db.feedbacks.filter((f) => f.date === MOCK_TODAY)
  const warnings = computeWarnings()
  return {
    written: today.length,
    total: db.students.length,
    pendingReview: today.filter((f) => f.status === 'pending_review').length,
    warnings,
    warningsTop: warnings.slice(0, 3),
  }
}

export interface ParentInteraction {
  student_id: string
  student_name: string
  unread: number
  latest: ParentMessage
}

/** 家长互动块（#13）：按未读优先、最近优先取前 3 位学生。 */
export async function getParentInteractions(): Promise<{ items: ParentInteraction[]; summary: { students: number; unread: number } }> {
  await delay(60)
  const byStudent = new Map<string, ParentMessage[]>()
  for (const m of db.parentMessages) {
    if (!byStudent.has(m.student_id)) byStudent.set(m.student_id, [])
    byStudent.get(m.student_id)!.push(m)
  }
  const items: ParentInteraction[] = []
  for (const [studentId, msgs] of byStudent) {
    const student = db.students.find((s) => s.id === studentId)
    if (!student) continue
    const unread = msgs.filter((m) => !m.read).length
    // 区块摘要必须是「家长最近一条」，老师自己的回复不能顶掉家长留言（#13 展示口径）。
    const latest = [...msgs].filter((m) => m.from === 'parent').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    items.push({ student_id: studentId, student_name: student.name, unread, latest })
  }
  items.sort((a, b) => b.unread - a.unread || b.latest.created_at.localeCompare(a.latest.created_at))
  const unread = db.parentMessages.filter((m) => !m.read).length
  const studentsWithUnread = items.filter((i) => i.unread > 0).length
  return { items: items.slice(0, 3), summary: { students: studentsWithUnread, unread } }
}

// ---------- 看板配置 ----------
export async function getDashboardConfig(): Promise<DashboardConfig> {
  await delay(60)
  return db.dashboard
}

export async function saveDashboardConfig(config: DashboardConfig): Promise<void> {
  await delay(60)
  persistDashboard(config)
}

// ---------- 错题库（#7） ----------
export interface MistakeWithStudents extends Mistake {
  associations: Array<MistakeStudent & { student: Student }>
}

export async function listTags(): Promise<Tag[]> {
  await delay(60)
  return db.tags
}

export async function listMistakes(filter?: {
  subject?: string
  questionType?: string
  difficulty?: number
  mastery?: Mastery
  tagId?: string
  keyword?: string
  studentId?: string
}): Promise<MistakeWithStudents[]> {
  await delay()
  return db.mistakes
    .filter((m) => (filter?.subject ? m.subject === filter.subject : true))
    .filter((m) => (filter?.questionType ? m.question_type === filter.questionType : true))
    .filter((m) => (filter?.difficulty ? m.difficulty === filter.difficulty : true))
    .filter((m) => (filter?.tagId ? m.tag_ids.includes(filter.tagId) : true))
    .filter((m) => (filter?.keyword ? m.question_text.includes(filter.keyword) : true))
    .map((m) => ({
      ...m,
      associations: db.mistakeStudents
        .filter((ms) => ms.mistake_id === m.id)
        .filter((ms) => (filter?.mastery ? ms.mastery === filter.mastery : true))
        .filter((ms) => (filter?.studentId ? ms.student_id === filter.studentId : true))
        .map((ms) => ({ ...ms, student: db.students.find((s) => s.id === ms.student_id)! })),
    }))
}

/** 录入错题（04-09 手动/拍照两路都会调它；入库后由「编辑不落盘」口径约束——刷新回种子）。 */
export async function createMistake(input: Omit<Mistake, 'id' | 'created_at'>): Promise<Mistake> {
  await delay(120)
  const mistake: Mistake = { ...input, id: 'mk-new-' + Date.now(), created_at: new Date().toISOString() }
  db.mistakes.push(mistake)
  return mistake
}

/** 删除错题（仅本地示意；刷新回种子，见 04-08）。 */
export async function deleteMistake(id: string): Promise<void> {
  await delay(80)
  const idx = db.mistakes.findIndex((m) => m.id === id)
  if (idx >= 0) db.mistakes.splice(idx, 1)
  db.mistakeStudents = db.mistakeStudents.filter((m) => m.mistake_id !== id)
}

/** 录入错题时补「某生 × 某题」关联（04-09：拍照/手动录入要同时落题目、关联学生、错因与掌握状态）。 */
export async function createMistakeStudent(input: Omit<MistakeStudent, 'id'>): Promise<MistakeStudent> {
  await delay(120)
  const assoc: MistakeStudent = { ...input, id: 'ms-new-' + Date.now() }
  db.mistakeStudents.push(assoc)
  return assoc
}

export async function updateMistakeStudent(id: string, patch: Partial<Pick<MistakeStudent, 'cause' | 'mastery' | 'note'>>): Promise<MistakeStudent> {
  await delay(80)
  const target = db.mistakeStudents.find((m) => m.id === id)!
  Object.assign(target, patch)
  return target
}

// ---------- 成绩 / 课时（#12） ----------
export async function listExams() {
  await delay(60)
  return db.exams
}

export async function getStudentExamRecords(studentId: string): Promise<Array<ExamRecord & { exam_name: string }>> {
  await delay(80)
  return db.examRecords
    .filter((r) => r.student_id === studentId)
    .map((r) => ({ ...r, exam_name: db.exams.find((e) => e.id === r.exam_id)?.name ?? '' }))
}

export async function getLessonPackage(studentId: string) {
  await delay(60)
  return db.lessonPackages.find((l) => l.student_id === studentId)
}

// ---------- 成长规划（#8） ----------
export async function listGrowthPlans(): Promise<GrowthPlan[]> {
  await delay()
  return db.growthPlans
}

export async function getGrowthPlan(studentId: string): Promise<GrowthPlan | undefined> {
  await delay(60)
  return db.growthPlans.find((p) => p.student_id === studentId && p.term === TERM)
}

export async function saveGrowthPlan(plan: GrowthPlan): Promise<GrowthPlan> {
  await delay(100)
  const idx = db.growthPlans.findIndex((p) => p.id === plan.id)
  const next = { ...plan, updated_at: new Date().toISOString() }
  if (idx >= 0) db.growthPlans[idx] = next
  else db.growthPlans.push(next)
  return next
}

export async function draftGrowthPlan(studentId: string): Promise<GrowthPlan> {
  await delay(120)
  const weak = await getWeakSubjects(studentId)
  const plan: GrowthPlan = {
    id: 'gp-' + studentId, student_id: studentId, term: TERM,
    goal: '稳住基础，逐步提升',
    focus_subjects: weak.length ? weak : ['数学'],
    focus_tags: db.tags.filter((t) => t.subject === '数学' && t.level === 3).slice(0, 2).map((t) => t.id),
    actions: ['每天 10 分钟计算专项', '错题本每周复盘一次'],
    review_at: '2026-11-20',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  return plan
}

/** 弱科 = 最近 3 次得分率最低的科目（#8 规划规则）。 */
export async function getWeakSubjects(studentId: string): Promise<GrowthPlan['focus_subjects']> {
  const subjects: Array<{ subject: '数学' | '语文' | '英语' | '科学'; rate: number }> = []
  for (const subject of ['数学', '语文', '英语', '科学'] as const) {
    const rs = db.examRecords.filter((r) => r.student_id === studentId && r.subject === subject).slice(-3)
    if (!rs.length) continue
    const exam = db.exams.find((e) => e.id === rs[0].exam_id)
    const full = exam?.full_score ?? 100
    subjects.push({ subject, rate: rs.reduce((a, r) => a + r.score / full, 0) / rs.length })
  }
  subjects.sort((a, b) => a.rate - b.rate)
  return subjects.slice(0, 2).map((s) => s.subject)
}

// ---------- 学习报告（#8） ----------
export async function listReports(studentId?: string): Promise<LearningReport[]> {
  await delay(60)
  return db.learningReports.filter((r) => (studentId ? r.student_id === studentId : true))
}

/** 确定性规则引擎：同一学生同一天生成两次，事实层（分数/排名/错题数/课时）一致，措辞可变。 */
export async function generateReportDraft(studentId: string): Promise<LearningReport> {
  await delay(1500)
  const student = db.students.find((s) => s.id === studentId)!
  const scores = db.examRecords.filter((r) => r.student_id === studentId && r.subject === '数学').sort((a, b) => a.date.localeCompare(b.date))
  const last = scores[scores.length - 1]
  const prev = scores[scores.length - 2]
  const unmastered = db.mistakeStudents.filter((m) => m.student_id === studentId && m.mastery === 'unmastered').length
  const lp = db.lessonPackages.find((l) => l.student_id === studentId)
  const plan = db.growthPlans.find((p) => p.student_id === studentId)
  const delta = last && prev ? last.score - prev.score : 0
  const title = MOCK_TODAY + ' 学习总结'
  const content = [
    '## 一、本周学习概况',
    student.name + ' 本周完成 5 次作业，最近一次数学成绩 ' + (last?.score ?? '—') + ' 分（班级第 ' + (last?.class_rank ?? '—') + ' 名）。',
    '',
    '## 二、近期成绩与表现',
    '最近三次数学成绩：' + scores.slice(-3).map((s) => s.score).join(' / ') + '；环比 ' + (delta >= 0 ? '提升 ' : '下降 ') + Math.abs(delta) + ' 分。',
    '',
    '## 三、薄弱点与建议',
    '未掌握错题 ' + unmastered + ' 道；建议每天 10 分钟计算专项，错题本每周复盘一次。',
    '',
    '## 四、下阶段规划',
    // 无规划学生只给建议、不写 growth_plan；标记「自动建议」让页面能区分（#8 05-03）。
    plan ? '当前规划：' + plan.goal + '（复评 ' + plan?.review_at + '）。' : '暂无成长规划，建议本周内起草（自动建议，未写入成长规划）。',
    '剩余课时 ' + (lp ? lp.total - lp.used : '—') + ' 节。',
  ].join('\n')
  const report: LearningReport = {
    id: 'lr-' + studentId + '-' + Date.now(), student_id: studentId, term: TERM, title, content_md: content,
    parent_summary: student.name + ' 最近数学成绩稳定。建议坚持每日计算训练。请关注错题复盘。',
    status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  db.learningReports.push(report)
  return report
}

export async function updateReport(id: string, patch: Partial<Pick<LearningReport, 'content_md' | 'parent_summary' | 'title'>>): Promise<LearningReport> {
  await delay(80)
  const r = db.learningReports.find((x) => x.id === id)!
  Object.assign(r, patch, { updated_at: new Date().toISOString() })
  return r
}

export async function publishReport(id: string): Promise<LearningReport> {
  await delay(80)
  const r = db.learningReports.find((x) => x.id === id)!
  r.status = 'published'
  r.published_at = new Date().toISOString()
  return r
}

export async function deleteReport(id: string): Promise<void> {
  await delay(60)
  const idx = db.learningReports.findIndex((x) => x.id === id)
  if (idx >= 0 && db.learningReports[idx].status === 'draft') db.learningReports.splice(idx, 1)
}

/** 撤回已发布报告：回到草稿并清空 published_at（#8 05-06 撤回→回草稿、预览不可见）。 */
export async function withdrawReport(id: string): Promise<LearningReport> {
  await delay(80)
  const r = db.learningReports.find((x) => x.id === id)!
  r.status = 'draft'
  r.published_at = undefined
  r.updated_at = new Date().toISOString()
  return r
}

// ---------- 成绩录入（#12 03-04 / 03-05：单条与整班批量） ----------
export async function createExam(input: Omit<Exam, 'id'>): Promise<Exam> {
  await delay(80)
  const exam: Exam = { ...input, id: 'ex-new-' + Date.now() }
  db.exams.push(exam)
  return exam
}

/** 按「考试 × 学生」upsert，重复录入覆盖而不重复插行。 */
export async function saveExamRecord(input: Omit<ExamRecord, 'id'>): Promise<ExamRecord> {
  await delay(80)
  const idx = db.examRecords.findIndex((r) => r.exam_id === input.exam_id && r.student_id === input.student_id)
  if (idx >= 0) {
    db.examRecords[idx] = { ...db.examRecords[idx], ...input }
    return db.examRecords[idx]
  }
  const rec: ExamRecord = { ...input, id: 'er-new-' + Date.now() + '-' + input.student_id }
  db.examRecords.push(rec)
  return rec
}

/** 整班批量：一次保存 21 人成绩（#12 03-05）。 */
export async function saveExamRecords(inputs: Array<Omit<ExamRecord, 'id'>>): Promise<ExamRecord[]> {
  const out: ExamRecord[] = []
  for (const input of inputs) out.push(await saveExamRecord(input))
  return out
}

/** 课时手动登记：只改已用/总数/到期日。 */
export async function updateLessonPackage(studentId: string, patch: Partial<Pick<LessonPackage, 'used' | 'total' | 'expire_at'>>): Promise<LessonPackage> {
  await delay(80)
  const lp = db.lessonPackages.find((l) => l.student_id === studentId)!
  Object.assign(lp, patch, { updated_at: new Date().toISOString() })
  return lp
}

// ---------- 家长留言（#13） ----------
export async function listParentMessages(): Promise<ParentMessage[]> {
  await delay(60)
  return db.parentMessages
}

export async function listStudentMessages(studentId: string): Promise<ParentMessage[]> {
  await delay(60)
  return db.parentMessages.filter((m) => m.student_id === studentId).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function markStudentMessagesRead(studentId: string): Promise<void> {
  await delay(40)
  db.parentMessages.forEach((m) => {
    if (m.student_id === studentId) m.read = true
  })
}

export async function replyToParent(feedbackId: string, studentId: string, content: string): Promise<ParentMessage> {
  await delay(200)
  const msg: ParentMessage = {
    id: 'pm-t-' + Date.now(), feedback_id: feedbackId, student_id: studentId, content,
    from: 'teacher', read: true, created_at: new Date().toISOString(),
  }
  db.parentMessages.push(msg)
  return msg
}

export { HOMEWORK_LABELS, MOCK_TODAY }
