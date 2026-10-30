// 展示层格式化：把领域枚举翻成中文、把 0~1 完成度翻成百分比。
// 为什么集中在一处：同一枚举（如 mastery）在错题库、学生档案、报告里都要显示，
// 文案分散写会出现「未掌握 / 掌握中」两种说法（术语一致性见 GLOSSARY）。
export const pct = (value: number) => Math.round(value * 100) + '%'

export const masteryLabel: Record<string, string> = { unmastered: '未掌握', reviewing: '复习中', mastered: '已掌握' }
export const masteryColor: Record<string, string> = {
  unmastered: 'var(--color-errorText)', reviewing: 'var(--color-warningText)', mastered: 'var(--color-successText)',
}
export const causeLabel: Record<string, string> = {
  concept: '概念不清', calc: '计算错误', reading: '审题不清', careless: '粗心', unlearned: '未学',
}
export const feedbackStatusLabel: Record<string, string> = { draft: '草稿', pending_review: '待审核', published: '已发布' }
export const feedbackStatusColor: Record<string, string> = {
  draft: 'default', pending_review: 'warning', published: 'success',
}
export const difficultyLabel: Record<number, string> = { 1: '基础', 2: '中等', 3: '较难' }
export const questionTypeColor: Record<string, string> = { 选择: 'blue', 填空: 'purple', 判断: 'gold', 计算: 'cyan', 解答: 'geekblue', 应用题: 'magenta' }
export const studentStatusLabel: Record<string, string> = { active: '在读', paused: '暂停', archived: '结课' }

export const maskPhone = (phone: string) => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
