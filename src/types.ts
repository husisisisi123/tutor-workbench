// 领域模型（mock 数据层的唯一类型来源）。
// 数据流：seed/* 生成初始对象 → db.ts 持内存态 → api.ts 以 Promise 暴露给页面。
// 字段口径来自票面：#2（表结构）、#4（反馈单）、#6（看板）、#7（错题）、#8（报告/规划）、
// #12（档案/成绩/课时）、#13（家长留言）。改字段先改票面决议，再改这里，最后改 seed。

export type Subject = '数学' | '语文' | '英语' | '科学'

export type StudentStatus = 'active' | 'paused' | 'archived'

/** 学生档案七字段（#12）：姓名 / 年级 / 学校 / 家长电话 / 家长姓名 / 学生状态 / 备注。 */
export interface Student {
  id: string
  name: string
  grade: string
  school: string
  parent_name: string
  parent_phone: string
  status: StudentStatus
  note?: string
  /** 头像用姓名首字 + 稳定色相圆标（#12：不用 emoji） */
  avatar_hue: number
  enrolled_at: string
}

export type FeedbackStatus = 'draft' | 'pending_review' | 'published'

/** 9 项作业清单里的一项（#4：完成度 = 勾选数 / 9）。 */
export interface HomeworkItem {
  id: string
  label: string
  done: boolean
  /** 第 8 项可逐生改书名/页码（#4 决议） */
  book?: string
  page?: string
}

export interface SubjectDetail {
  subject: Subject
  score?: number
  full_score?: number
  note?: string
}

/** 每日反馈单（#4）。请假时整单被替换，不保留作业清单。 */
export interface Feedback {
  id: string
  student_id: string
  /** mock 当前日期，格式 YYYY-MM-DD */
  date: string
  status: FeedbackStatus
  leave: boolean
  leave_reason?: string
  homework_items: HomeworkItem[]
  /** 0~1，= 勾选数 / 9；请假单为 0 */
  completion: number
  score?: number
  score_full?: number
  mistake_analysis?: string
  subject_details: SubjectDetail[]
  /** 家长可见正文（家长版） */
  comment: string
  /** AI 段落标记：key 对应正文中的段，用于「手动⇄AI 分段」标识 */
  ai_segments?: string[]
  attachments?: { name: string; size?: number }[]
  /** 退回标记：status 回 draft + reject_reason（#5：四态不加新状态） */
  reject_reason?: string
  reviewer?: string
  created_at: string
  updated_at: string
}

/** 家长留言（#13）：挂在某条已发布反馈下，消息级未读，无标题/无独立状态。 */
export interface ParentMessage {
  id: string
  feedback_id: string
  student_id: string
  content: string
  from: 'parent' | 'teacher'
  read: boolean
  created_at: string
}

/** 知识点标签（#7）：按主题建树，数学到「节」，语英科到模块；edition 隔离人教版换版风险。 */
export interface Tag {
  id: string
  name: string
  subject: Subject
  /** 1 = 科目，2 = 模块/章节，3 = 节（仅数学） */
  level: 1 | 2 | 3
  parent_id?: string
  edition?: string
}

export type QuestionType = '选择' | '填空' | '判断' | '计算' | '解答' | '应用题'

export interface Mistake {
  id: string
  subject: Subject
  question_text: string
  answer: string
  analysis?: string
  question_type: QuestionType
  difficulty: 1 | 2 | 3
  tag_ids: string[]
  source: 'homework' | 'test' | 'selftest'
  created_at: string
  images?: string[]
}

export type MistakeCause = 'concept' | 'calc' | 'reading' | 'careless' | 'unlearned'
export type Mastery = 'unmastered' | 'reviewing' | 'mastered'

/** 「某生 × 某题」的关联表（#7）：错因与掌握属于学生，不属于题目。 */
export interface MistakeStudent {
  id: string
  mistake_id: string
  student_id: string
  cause: MistakeCause
  mastery: Mastery
  source_date: string
  source_type: 'homework' | 'test' | 'selftest'
  note?: string
}

export interface Exam {
  id: string
  name: string
  date: string
  subject: Subject
  full_score: number
}

/** 成绩记录（#12：exams + exam_records 取代 #2 的 score_record）。 */
export interface ExamRecord {
  id: string
  exam_id: string
  student_id: string
  subject: Subject
  score: number
  class_rank: number
  grade_rank?: number
  comment?: string
  date: string
}

/** 课时包（#12）：剩余课时驱动「课时告急」筛选。 */
export interface LessonPackage {
  id: string
  student_id: string
  total: number
  used: number
  expire_at?: string
  updated_at: string
}

export interface GrowthPlan {
  id: string
  student_id: string
  term: string
  goal: string
  focus_subjects: Subject[]
  focus_tags: string[]
  actions: string[]
  review_at: string
  created_at: string
  updated_at: string
}

export interface LearningReport {
  id: string
  student_id: string
  term: string
  /** 标题规则：YYYY-MM-DD 学习总结（#8） */
  title: string
  content_md: string
  parent_summary?: string
  status: 'draft' | 'published'
  published_at?: string
  created_at: string
  updated_at: string
}

/** 座位配置（#3）：行列 + 座位，独立于学生表；退班只移出 seats 不删学生。 */
export interface SeatConfig {
  grid: { rows: number; cols: number }
  seats: { student_id: string; r: number; c: number }[]
}

/** 看板背景（#14 定案后只有 preset / image / default 三态，取色算法已删除）。 */
export type BackgroundKind = 'default' | 'preset' | 'image'

export interface BackgroundConfig {
  kind: BackgroundKind
  presetId?: string
  /** 上传图重编码后的 dataURL（WebP，长边 1600 / <400KB，见 #6） */
  imageDataUrl?: string
}

export type WidgetKey = 'clock' | 'weather' | 'news' | 'links'

export interface DashboardWidget {
  key: WidgetKey
  visible: boolean
  order: number
}

export interface QuickLink {
  id: string
  name: string
  url: string
  /** 内置图标 slug；缺失时降级为首字母哈希圆标 */
  icon?: string
}

/** 看板配置（#6）：一份键 twb:v1:dashboard，不拆键。 */
export interface DashboardConfig {
  background: BackgroundConfig
  widgets: DashboardWidget[]
  links: QuickLink[]
}

/** 学情预警口径（#6）：三条命中任一入池。 */
export interface WarningItem {
  student_id: string
  reason: 'completion' | 'mistakes' | 'score_drop'
  detail: string
}
