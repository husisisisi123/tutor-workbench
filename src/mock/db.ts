// 内存态数据库。为什么有这一层而不是页面直接读 seed：
// 1) 演示要求「编辑后卡片实时刷新」，需要一份可变状态；
// 2) 「刷新回种子」是预期行为（#5），所以只有两个键落 localStorage：看板配置与座位（#6/#3 验收项），
//    其余变更只存在内存里，刷新即还原。
import type { DashboardConfig, Feedback, GrowthPlan, LearningReport, MistakeStudent, ParentMessage, SeatConfig, Student } from '@/types'
import {
  defaultDashboardConfig, examRecords, exams, feedbacks, growthPlans, learningReports,
  lessonPackages, mistakeStudents, mistakes, parentMessages, seatConfig as seedSeat, students as seedStudents, tags,
} from './seed'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const LS_DASHBOARD = 'twb:v1:dashboard'
const LS_SEAT = 'twb:v1:seat'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : clone(fallback)
  } catch {
    return clone(fallback)
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 写失败只影响持久化，不影响当次演示（配额满/隐私模式）
  }
}

export const db = {
  students: clone(seedStudents) as Student[],
  feedbacks: clone(feedbacks) as Feedback[],
  tags: clone(tags),
  mistakes: clone(mistakes),
  mistakeStudents: clone(mistakeStudents) as MistakeStudent[],
  exams: clone(exams),
  examRecords: clone(examRecords),
  lessonPackages: clone(lessonPackages),
  growthPlans: clone(growthPlans) as GrowthPlan[],
  learningReports: clone(learningReports) as LearningReport[],
  parentMessages: clone(parentMessages) as ParentMessage[],
  dashboard: readJson<DashboardConfig>(LS_DASHBOARD, defaultDashboardConfig),
  seat: readJson<SeatConfig>(LS_SEAT, seedSeat),
}

export function persistDashboard(config: DashboardConfig) {
  db.dashboard = clone(config)
  writeJson(LS_DASHBOARD, config)
}

export function persistSeat(config: SeatConfig) {
  db.seat = clone(config)
  writeJson(LS_SEAT, config)
}
