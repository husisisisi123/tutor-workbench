// 错题库枚举口径（#7 04-06）：题型 6 值 / 难度 3 档 / 错因 5 值 / 掌握 3 值。
// 为什么集中定义：筛选条、详情抽屉、录入表单、批量改掌握都用这三组选项，
// 分散写会出现「难度 2」与「中等」两种说法；文案统一取 utils/format.ts，避免与档案/报告页漂移。
import type { Mastery, MistakeCause, QuestionType } from '@/types'
import { causeLabel, masteryLabel } from '@/utils/format'

/** 题型 6 值（#8 扩值后 types.ts 已同步：选择/填空/判断/计算/解答/应用题）。 */
export const QUESTION_TYPES: QuestionType[] = ['选择', '填空', '判断', '计算', '解答', '应用题']

/** 难度 3 档：1 基础 / 2 中等 / 3 较难（与 Mistake.difficulty 的 1|2|3 对应）。 */
export const DIFFICULTY_LABEL: Record<number, string> = { 1: '基础', 2: '中等', 3: '较难' }

export const MASTERY_OPTIONS: Array<{ value: Mastery; label: string }> = (
  ['unmastered', 'reviewing', 'mastered'] as Mastery[]
).map((value) => ({ value, label: masteryLabel[value] }))

export const CAUSE_OPTIONS: Array<{ value: MistakeCause; label: string }> = (
  ['concept', 'calc', 'reading', 'careless', 'unlearned'] as MistakeCause[]
).map((value) => ({ value, label: causeLabel[value] }))

/** 来源三态中文，卡片与抽屉共用。 */
export const SOURCE_LABEL: Record<string, string> = { homework: '作业', test: '测验', selftest: '自测' }
