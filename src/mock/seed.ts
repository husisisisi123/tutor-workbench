// mock 种子。为什么用「固定种子的生成器」而不是手写 21×N 条数组：
// 1) 数据量（反馈×3 天、成绩×8 场、错题关联 55 条）手写既长又易错；
// 2) 生成器用 mulberry32 固定种子，任何机器上跑出的数据完全一致，
//    满足「刷新回种子」「同一学生两次生成报告事实一致」的验收要求（#8 05-04）。
// 数据流：本文件只产出常量数组 → db.ts 复制成可变内存态。
import type {
  DashboardConfig, Exam, ExamRecord, Feedback, GrowthPlan, HomeworkItem, LearningReport,
  LessonPackage, Mistake, MistakeStudent, ParentMessage, SeatConfig, Student, Tag,
} from '@/types'

export const MOCK_TODAY = '2026-10-30'
export const TERM = '2026 秋季'

/** 固定种子伪随机：同一 seed 永远同一序列（数据可复现）。 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20261024)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))

// 21 名真实名单在旧设备的交接包（_handoff/）里，本机不存在（见 issue-tracker.md Local facts）。
// 这里用同规模、同年龄段的占位名单，数量与业务语义与交接包一致（21 人、三年级~六年级）。
const NAMES = [
  '张浩然', '李雨桐', '王梓涵', '陈思远', '刘欣怡', '赵子墨', '周诗涵', '吴俊熙', '孙嘉怡', '徐若曦',
  '朱一凡', '胡明轩', '郭子萱', '何宇航', '高梓琳', '林书瑶', '罗天佑', '郑可欣', '梁博文', '谢雨欣', '唐晨曦',
]
const GRADES = ['二年级', '三年级', '四年级', '五年级', '六年级']
const SCHOOLS = ['实验小学', '第二实验小学', '育才小学', '外国语小学']
const PARENT_SURNAMES = ['张', '李', '王', '陈', '刘', '赵', '周', '吴', '孙', '徐']

export const students: Student[] = NAMES.map((name, i) => {
  const grade = GRADES[i % GRADES.length]
  return {
    id: 'stu-' + String(i + 1).padStart(2, '0'),
    name, grade,
    school: SCHOOLS[i % SCHOOLS.length],
    parent_name: PARENT_SURNAMES[i % PARENT_SURNAMES.length] + (rnd() < 0.5 ? '女士' : '先生'),
    parent_phone: '138' + String(10000000 + int(0, 89999999)).slice(0, 8),
    status: i === 20 ? 'paused' : i === 19 ? 'archived' : 'active',
    note: i % 7 === 0 ? '需要多关注课堂专注度' : undefined,
    avatar_hue: (i * 47) % 360,
    enrolled_at: '2026-09-01',
  }
})

export const seatConfig: SeatConfig = {
  grid: { rows: 3, cols: 7 },
  seats: students.map((s, i) => ({ student_id: s.id, r: Math.floor(i / 7), c: i % 7 })),
}

/** 9 项作业清单模板（#4：与 Excel 反馈表 1:1）。第 8 项允许逐生改书名/页码。 */
export const HOMEWORK_LABELS = [
  '语文抄写', '语文阅读', '数学计算', '数学练习册', '英语单词',
  '英语朗读', '科学实验记录', '课外阅读', '错题订正',
]

function makeHomework(doneRate: number): HomeworkItem[] {
  return HOMEWORK_LABELS.map((label, i) => ({
    id: 'hw-' + (i + 1), label,
    done: i / HOMEWORK_LABELS.length < doneRate,
    book: i === 7 ? '《小王子》' : undefined,
    page: i === 7 ? '第 ' + int(10, 60) + ' 页' : undefined,
  }))
}

const MISTAKE_ANALYSES = ['计算粗心，进位漏写', '审题不清，把「至少」看成「恰好」', '概念未掌握，分数加减法通分错误', '单位换算不熟', '不会列方程，等量关系找错']

/** 反馈单：今天 status 固定 published 10 / pending_review 3 / draft 7（第 20 张是请假单）/ 无反馈 1。
 *  请假单索引必须落在 today 循环范围内（i < TODAY_STATUS.length），否则种子里看不到请假卡（02-07）。 */
const TODAY_STATUS: Array<Feedback['status']> = [
  ...Array(10).fill('published'), ...Array(3).fill('pending_review'), ...Array(7).fill('draft'),
]

function buildFeedback(student: Student, i: number, date: string, status: Feedback['status']): Feedback {
  // 第 20 名今天请假：整单替换为请假态（#4：请假时模板整单替换，不保留作业清单）
  const leave = i === 19 && date === MOCK_TODAY
  const doneRate = [0.44, 0.33, 0.55, 0.66, 0.77, 0.88, 1][int(0, 6)]
  const items = leave ? [] : makeHomework(doneRate)
  const done = items.filter((h) => h.done).length
  const completion = leave ? 0 : Math.round((done / HOMEWORK_LABELS.length) * 100) / 100
  const score = leave ? undefined : Math.round(completion * 40 + int(55, 60))
  return {
    id: 'fb-' + date.replace(/-/g, '') + '-' + student.id, student_id: student.id, date, status, leave,
    leave_reason: leave ? '感冒发烧，家长已请假' : undefined,
    homework_items: items, completion, score, score_full: 100,
    mistake_analysis: leave ? undefined : pick(MISTAKE_ANALYSES),
    subject_details: leave ? [] : [
      { subject: '数学', score: int(70, 100), full_score: 100 },
      { subject: '语文', score: int(75, 100), full_score: 100 },
      { subject: '英语', score: int(70, 100), full_score: 100 },
    ],
    comment: leave ? '今日请假，作业已由家长带回，返校后补交。'
      : '今天整体状态不错，重点复习了分数加减法，错题已订正。' + (score && score < 80 ? '计算速度还需加强。' : ''),
    ai_segments: leave ? [] : i % 3 === 0 ? ['comment'] : [],
    attachments: leave ? [] : i % 4 === 0 ? [{ name: '作业照片.jpg', size: 320 * 1024 }] : [],
    created_at: date + 'T18:00:00+08:00', updated_at: date + 'T19:30:00+08:00',
  }
}

/** 反馈单种子：今天 19 条（2 人未反馈）+ 前两天各 21 条（用于「连续 2 天完成度 <60%」预警）。 */
export const feedbacks: Feedback[] = (() => {
  const out: Feedback[] = []
  students.forEach((s, i) => {
    if (i >= TODAY_STATUS.length) return
    const fb = buildFeedback(s, i, MOCK_TODAY, TODAY_STATUS[i])
    // 前 3 名今天也保持低完成度：与 10-28/10-29 拼成「连续 3 天完成度 <60%」，
    // 让学情预警池稳定命中 3 人（页头「预警 3」、01-10 取前 3 的验收口径）。
    if (i < 3 && !fb.leave) {
      fb.completion = 0.44
      fb.homework_items = fb.homework_items.map((h, k) => ({ ...h, done: k < 4 }))
    }
    out.push(fb)
  })
  for (const date of ['2026-10-28', '2026-10-29']) {
    students.forEach((s, i) => {
      // 滞后两天里有 3 人连续低完成度，让学情预警有稳定的 3 条池子（#6 01-10）
      const fb = buildFeedback(s, i, date, 'published')
      if (i < 3) {
        fb.completion = 0.44
        fb.homework_items = fb.homework_items.map((h, k) => ({ ...h, done: k < 4 }))
      }
      out.push(fb)
    })
  }
  return out
})()

/** 知识点标签树（#7）：数学 116 条到「节」，语/英/科各到模块共 16 条，合计 132 条。 */
export const tags: Tag[] = (() => {
  const out: Tag[] = []
  const mathModules = ['数的运算', '分数与小数', '方程与不等式', '图形与几何', '统计与概率', '应用题', '单位与测量', '数学广角']
  const mathSections = ['口算', '笔算', '简便运算', '混合运算', '估算', '分数加减', '分数乘除', '小数加减', '小数乘除', '一元一次方程', '等量关系', '三角形', '四边形', '圆', '周长', '面积', '体积', '条形统计图', '折线统计图']
  out.push({ id: 'tag-m-000', name: '数学', subject: '数学', level: 1 })
  let seq = 0
  for (const m of mathModules) {
    const mid = 'tag-m-mod-' + mathModules.indexOf(m)
    out.push({ id: mid, name: m, subject: '数学', level: 2, parent_id: 'tag-m-000', edition: '人教版 2022' })
    for (const sec of mathSections) {
      seq += 1
      out.push({ id: 'tag-m-' + String(seq).padStart(3, '0'), name: sec, subject: '数学', level: 3, parent_id: mid, edition: '人教版 2022' })
    }
  }
  // 数学：1 科目 + 8 模块 + 8×19 节 = 161，截到 116 条（口径与 #7 一致）
  const math = out.filter((t) => t.subject === '数学').slice(0, 116)
  const rest: Tag[] = []
  // 语/英/科只到模块、不建第 3 级；不额外建科目根节点——04-01 要求 132 = 数学 116 + 语文 6 + 英语 6 + 科学 4。
  const others: Array<[string, string[]]> = [
    ['语文', ['识字与写字', '阅读理解', '古诗文', '写作', '口语交际', '综合性学习']],
    ['英语', ['词汇', '句型', '听力', '口语', '阅读', '书写']],
    ['科学', ['物质科学', '生命科学', '地球与宇宙', '技术与工程']],
  ]
  for (const [subject, mods] of others) {
    mods.forEach((m, i) => rest.push({ id: 'tag-' + subject + '-' + i, name: m, subject: subject as Tag['subject'], level: 2 }))
  }
  return [...math, ...rest]
})()

const MATH_TAGS = tags.filter((t) => t.subject === '数学' && t.level === 3)
const QUESTION_TEMPLATES = [
  '计算：3/4 + 5/8 = ?', '解方程：2x + 5 = 17', '一个长方形长 8cm、宽 5cm，求面积。',
  '小明有 12 元，买 3 支笔后还剩 3 元，每支笔多少钱？', '把 0.75 化成分数。',
  '计算：125 × 8 ÷ 4', '一个圆的半径是 3cm，求周长。', '比较 3/5 和 5/8 的大小。',
]

/** 错题 30 题 + 「某生 × 某题」关联 55 条（#7：30 题 / 约 55 条关联）。 */
export const mistakes: Mistake[] = Array.from({ length: 30 }, (_, i) => ({
  id: 'mk-' + String(i + 1).padStart(3, '0'),
  subject: (i < 24 ? '数学' : pick(['语文', '英语', '科学'])) as Mistake['subject'],
  question_text: QUESTION_TEMPLATES[i % QUESTION_TEMPLATES.length],
  answer: ['23/8', 'x = 6', '40 cm²', '3 元', '3/4', '250', '6π cm', '3/5 < 5/8'][i % 8],
  analysis: pick(MISTAKE_ANALYSES),
  question_type: (['计算', '解答', '选择', '填空', '判断', '应用题'] as const)[i % 6],
  difficulty: ((i % 3) + 1) as 1 | 2 | 3,
  tag_ids: [MATH_TAGS[i % MATH_TAGS.length]?.id].filter(Boolean),
  source: (['homework', 'test', 'selftest'] as const)[i % 3],
  created_at: '2026-10-' + String(12 + (i % 18)).padStart(2, '0') + 'T20:00:00+08:00',
}))

export const mistakeStudents: MistakeStudent[] = (() => {
  const out: MistakeStudent[] = []
  let n = 0
  for (const m of mistakes) {
    const owners = int(1, 3)
    for (let k = 0; k < owners && n < 55; k++) {
      const stu = students[(n * 3 + k) % students.length]
      out.push({
        id: 'ms-' + String(++n).padStart(3, '0'), mistake_id: m.id, student_id: stu.id,
        cause: (['concept', 'calc', 'reading', 'careless', 'unlearned'] as const)[int(0, 4)],
        mastery: (['unmastered', 'reviewing', 'mastered'] as const)[int(0, 2)],
        source_date: '2026-10-' + String(12 + (n % 18)).padStart(2, '0'),
        source_type: (['homework', 'test', 'selftest'] as const)[n % 3],
      })
    }
  }
  return out
})()

const EXAM_DATES = ['2026-09-12', '2026-09-26', '2026-10-10', '2026-10-17', '2026-10-24']
/** 5 场数学月考 + 期中语/英/科各一场（雷达图需要多科最近成绩）。 */
export const exams: Exam[] = [
  ...EXAM_DATES.map((d, i) => ({ id: 'ex-math-' + (i + 1), name: '数学第 ' + (i + 1) + ' 次月考', date: d, subject: '数学' as const, full_score: 100 })),
  { id: 'ex-mid-chinese', name: '期中语文', date: '2026-10-24', subject: '语文', full_score: 100 },
  { id: 'ex-mid-english', name: '期中英语', date: '2026-10-24', subject: '英语', full_score: 100 },
  { id: 'ex-mid-science', name: '期中科学', date: '2026-10-24', subject: '科学', full_score: 100 },
]

export const examRecords: ExamRecord[] = (() => {
  const out: ExamRecord[] = []
  const byStudentBase = students.map((_, i) => 62 + ((i * 7) % 30))
  for (const exam of exams) {
    const scores = students.map((s, i) => {
      const base = byStudentBase[i]
      const wave = exam.subject === '数学' ? Math.round(((i * 11 + exam.date.charCodeAt(9)) % 9) - 4) : int(-6, 6)
      return { s, score: Math.max(35, Math.min(100, base + wave)) }
    })
    const ranked = [...scores].sort((a, b) => b.score - a.score)
    scores.forEach(({ s, score }) => {
      const rank = ranked.findIndex((r) => r.s.id === s.id) + 1
      out.push({
        id: 'er-' + exam.id + '-' + s.id, exam_id: exam.id, student_id: s.id, subject: exam.subject,
        score, class_rank: rank, grade_rank: rank * 3 + 10,
        comment: score < 70 ? '基础题失分较多' : score >= 90 ? '发挥稳定' : undefined, date: exam.date,
      })
    })
  }
  return out
})()

/** 课时包：21 人，留 4 人「告急」（剩余 ≤3），满足 03-02 筛选验收。 */
export const lessonPackages: LessonPackage[] = students.map((s, i) => ({
  id: 'lp-' + s.id, student_id: s.id, total: 60,
  used: 60 - (i < 4 ? int(0, 3) : int(12, 40)),
  expire_at: '2026-12-31', updated_at: '2026-10-28T10:00:00+08:00',
}))

/** 成长规划：18 人有当前期规划，3 人无规划（#8：07-A2 空态）。 */
export const growthPlans: GrowthPlan[] = students.slice(0, 18).map((s, i) => ({
  id: 'gp-' + s.id, student_id: s.id, term: TERM,
  goal: ['期末数学进入班级前 1/3', '稳固基础计算，减少粗心失分', '提升阅读理解与表达'][i % 3],
  focus_subjects: i % 4 === 0 ? ['数学', '语文'] : ['数学'],
  focus_tags: [MATH_TAGS[i % MATH_TAGS.length]?.id, MATH_TAGS[(i + 5) % MATH_TAGS.length]?.id].filter(Boolean) as string[],
  actions: ['每周 2 次计算专项 10 分钟', '错题本每周复盘一次', '家长每周检查一次作业签字'],
  // 复评日打散：4 人落在近期（含 1 人已逾期），其余统一 11-15；让「待复评」筛选有样例（#8 05-01）。
  review_at: i < 4 ? ['2026-10-20', '2026-10-28', '2026-11-02', '2026-11-05'][i] : '2026-11-15',
  created_at: '2026-10-08T09:00:00+08:00', updated_at: '2026-10-22T09:00:00+08:00',
}))

/** 学习报告：8 篇已发布 + 3 篇草稿（#8 种子口径）。 */
export const learningReports: LearningReport[] = (() => {
  const out: LearningReport[] = []
  const build = (studentId: string, status: LearningReport['status'], day: string, idx: number): LearningReport => ({
    id: 'lr-' + studentId + '-' + day, student_id: studentId, term: TERM, title: day + ' 学习总结',
    content_md: '## 一、本周学习概况\n本周完成 5 次作业，数学计算正确率 82%。\n\n## 二、近期成绩与表现\n最近一次数学月考 88 分，班级第 6 名，环比提升 4 分。\n\n## 三、薄弱点与建议\n分数加减法通分仍不稳定，建议每天 10 分钟专项练习。\n\n## 四、下阶段规划\n保持计算训练，重点复盘错题本第 ' + (idx + 1) + ' 页。',
    parent_summary: '孩子本周状态稳定，计算正确率提升。建议每天坚持 10 分钟计算练习。周末可一起复盘错题本。',
    status, published_at: status === 'published' ? day + 'T20:00:00+08:00' : undefined,
    created_at: day + 'T19:00:00+08:00', updated_at: day + 'T20:00:00+08:00',
  })
  for (let i = 0; i < 8; i++) out.push(build(students[i].id, 'published', '2026-10-' + String(24 - i).padStart(2, '0'), i))
  for (let i = 8; i < 11; i++) out.push(build(students[i].id, 'draft', '2026-10-' + String(29 - i).padStart(2, '0'), i))
  return out
})()

/** 家长留言（#13）：10 条家长消息涉及 7 人、覆盖 3 个反馈日（10-28~10-30）；
 *  其中 5 人共 8 条未读，2 人共 3 条老师回复。 */
export const parentMessages: ParentMessage[] = (() => {
  const out: ParentMessage[] = []
  const fbOn = (studentId: string, date: string) =>
    feedbacks.find((f) => f.student_id === studentId && f.date === date)
      ?? feedbacks.find((f) => f.student_id === studentId && f.status === 'published')!
  const texts = [
    '老师，孩子今天说数学作业有点难，麻烦您多关注一下。',
    '请问周末的作业是哪几项？孩子记不太清。',
    '孩子最近计算总是粗心，有什么办法吗？',
    '收到反馈了，谢谢老师！',
    '明天想给孩子请假一天，可以吗？',
    '孩子说今天的阅读题不会做，晚上我们再带他读一遍。',
    '老师，孩子这次月考进步了，感谢您的辅导。',
    '错题本需要每天带吗？',
    '今天的反馈看到了，辛苦老师。',
    '想问下孩子最近在课堂上的状态怎么样？',
  ]
  // [学生下标, 反馈日期]：未读 5 人 8 条（stu-01×2 / 02×2 / 03×2 / 04×1 / 05×1）
  const unreadPlan: Array<[number, string]> = [
    [0, '2026-10-30'], [0, '2026-10-29'], [1, '2026-10-30'], [1, '2026-10-29'],
    [2, '2026-10-30'], [2, '2026-10-28'], [3, '2026-10-29'], [4, '2026-10-30'],
  ]
  unreadPlan.forEach(([studentIdx, date], i) => {
    const s = students[studentIdx]
    out.push({
      id: 'pm-' + String(i + 1).padStart(2, '0'), feedback_id: fbOn(s.id, date).id, student_id: s.id,
      content: texts[i], from: 'parent', read: false,
      created_at: date + 'T' + String(15 + (i % 4)).padStart(2, '0') + ':' + String(10 + i).padStart(2, '0') + ':00+08:00',
    })
  })
  // 已回复的 2 名学生：家长消息已读 + 共 3 条老师回复
  const replied = [students[5], students[6]]
  out.push({ id: 'pm-09', feedback_id: fbOn(replied[0].id, '2026-10-29').id, student_id: replied[0].id, content: texts[7], from: 'parent', read: true, created_at: '2026-10-29T10:00:00+08:00' })
  out.push({ id: 'pm-10', feedback_id: fbOn(replied[1].id, '2026-10-28').id, student_id: replied[1].id, content: texts[8], from: 'parent', read: true, created_at: '2026-10-28T11:00:00+08:00' })
  out.push({ id: 'pm-r1', feedback_id: fbOn(replied[0].id, '2026-10-29').id, student_id: replied[0].id, content: '错题本每天带，周四统一检查。', from: 'teacher', read: true, created_at: '2026-10-29T10:20:00+08:00' })
  out.push({ id: 'pm-r2', feedback_id: fbOn(replied[0].id, '2026-10-29').id, student_id: replied[0].id, content: '收到，我下午再单独问他一次。', from: 'teacher', read: true, created_at: '2026-10-29T10:30:00+08:00' })
  out.push({ id: 'pm-r3', feedback_id: fbOn(replied[1].id, '2026-10-28').id, student_id: replied[1].id, content: '今天状态不错，课堂上主动举手了。', from: 'teacher', read: true, created_at: '2026-10-28T11:15:00+08:00' })
  return out
})()

/** 看板默认配置（#6）：4 套预设之一 + 4 个挂件 + 默认 3 条快捷链接。 */
export const defaultDashboardConfig: DashboardConfig = {
  background: { kind: 'preset', presetId: 'fog-teal' },
  widgets: [
    { key: 'clock', visible: true, order: 0 },
    { key: 'weather', visible: true, order: 1 },
    { key: 'news', visible: true, order: 2 },
    { key: 'links', visible: true, order: 3 },
  ],
  links: [
    { id: 'link-1', name: '小红书', url: 'https://www.xiaohongshu.com', icon: 'xiaohongshu' },
    { id: 'link-2', name: '微信', url: 'https://weixin.qq.com', icon: 'wechat' },
    { id: 'link-3', name: '腾讯文档', url: 'https://docs.qq.com', icon: 'tencentdocs' },
  ],
}
