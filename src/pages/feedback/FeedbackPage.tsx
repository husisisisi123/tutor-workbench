import {
  AuditOutlined, EditOutlined, EyeOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  ReloadOutlined, SearchOutlined, ThunderboltOutlined, UnlockOutlined,
} from '@ant-design/icons'
import { App, Button, Segmented, Select, Spin, Switch, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/mock/api'
import type { MistakeWithStudents } from '@/mock/api'
import type { Feedback, SeatConfig, Student } from '@/types'
import PageHeader from '@/components/PageHeader'
import { useAppStore } from '@/store/appStore'
import { tokens } from '@/theme/tokens'
import {
  C, cloneFeedback, dateLabel, moveSeat, nextSimInterval, orderedSeats, REJECT_REASONS,
  reflowSeat, simulateAssistantFill, unseatStudent, unseatedStudents,
} from './helpers'
import SeatWall from './components/SeatWall'
import UnseatedPanel from './components/UnseatedPanel'
import type { NewStudentInput } from './components/UnseatedPanel'
import FeedbackEditorModal from './components/FeedbackEditorModal'
import ParentPreviewModal from './components/ParentPreviewModal'
import ReviewQueueModal from './components/ReviewQueueModal'
import { TeacherAvatar } from './components/SeatCard'
import type { Filler } from './components/SeatCard'
import { useIsMobile } from './useIsMobile'
import './feedback.css'

/** 日期选择器只给「今天 + 前两天」：种子只造了这三天的反馈单（mock 当前日期 = 2026-10-30）。 */
const DATE_OPTIONS = [0, 1, 2].map((offset) => dayjs(api.MOCK_TODAY).subtract(offset, 'day').format('YYYY-MM-DD'))

/** 日期切换器持久化（02-08：布局与日期落 twb:v1:*）。只存「看哪一天」，不存反馈单状态（02-25 刷新回种子）。 */
const LS_DATE = 'twb:v1:feedback-date'

function readSavedDate(): string {
  try {
    const raw = localStorage.getItem(LS_DATE)
    return raw && DATE_OPTIONS.includes(raw) ? raw : api.MOCK_TODAY
  } catch {
    return api.MOCK_TODAY
  }
}

/** 行列预设（02-02：3×7 / 4×6 / 5×5 等）。value 用「行 x 列」字符串，Segmented 直接绑定。 */
const GRID_PRESETS = [
  { value: '3x7', label: '3 行 × 7 列', rows: 3, cols: 7 },
  { value: '4x6', label: '4 行 × 6 列', rows: 4, cols: 6 },
  { value: '5x5', label: '5 行 × 5 列', rows: 5, cols: 5 },
]

interface EditorState {
  feedback: Feedback
  student: Student
  mode: 'edit' | 'review'
}

/**
 * 页面 02 · 每日反馈（#3 座位卡片墙 / #4 反馈单编辑 / #5 审核流与协作模拟）。
 * 数据流：挂载与 refreshTick 变化时并发拉 students / seat / feedbacks(date) / mistakes，
 * 页面只持有渲染快照；所有写操作都走 api（seat、feedback 状态），刷新即回种子（02-25），
 * 只有座位配置与「看哪一天」落 localStorage（02-08）。
 * 三块 UI：顶栏（进度 / 待审核 / 日期 / 模拟助教）→ 座位墙（查看锁定 ⇄ 编辑画板）→ 弹窗（编辑 / 审核 / 家长预览）。
 */
export default function FeedbackPage() {
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()
  const refreshTick = useAppStore((state) => state.refreshTick)
  const bumpRefresh = useAppStore((state) => state.bumpRefresh)

  const [date, setDate] = useState(readSavedDate)
  const [students, setStudents] = useState<Student[]>([])
  const [seat, setSeat] = useState<SeatConfig>({ grid: { rows: 3, cols: 7 }, seats: [] })
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [mistakes, setMistakes] = useState<MistakeWithStudents[]>([])
  const [loading, setLoading] = useState(true)

  const [editMode, setEditMode] = useState(false)
  /** 编辑画板里收起 240px 未入座边栏：7 列 × 140px 卡片 + 边栏在 1440 放不下，
   *  收起后画板可用整行宽，卡片不必横向滚动（默认展开，符合 02-04 的右侧边栏要求）。 */
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [queueOpen, setQueueOpen] = useState(false)
  const [simOn, setSimOn] = useState(false)
  const [simCountdown, setSimCountdown] = useState(0)
  /** 模拟助教提交过的反馈单 id：卡片据此显示「林」助教头像（#5 预置假助教） */
  const [filledByAssistant, setFilledByAssistant] = useState<Set<string>>(new Set())

  const aliveRef = useRef(true)
  const seqRef = useRef(0)
  const flashTimerRef = useRef<number | undefined>(undefined)
  const simBusyRef = useRef(false)
  const simOnRef = useRef(false)
  const submittedSinceRejectRef = useRef(0)
  const rejectTargetRef = useRef(3)
  const dateRef = useRef(date)
  const studentsRef = useRef(students)
  dateRef.current = date
  studentsRef.current = students
  simOnRef.current = simOn

  const load = useCallback(async () => {
    const seq = ++seqRef.current
    const [nextStudents, nextSeat, nextFeedbacks, nextMistakes] = await Promise.all([
      api.listStudents(),
      api.getSeatConfig(),
      api.listFeedbacks(date),
      api.listMistakes(),
    ])
    // 日期切换 / 自动保存会并发触发多次 load，只认最后一次，避免旧请求把新状态盖回去
    if (!aliveRef.current || seq !== seqRef.current) return
    setStudents(nextStudents.map((s) => ({ ...s })))
    // 座位是 db 里的引用对象，编辑前必须拷贝，否则会绕过 api.saveSeatConfig 直接改内存态
    setSeat({ grid: { ...nextSeat.grid }, seats: nextSeat.seats.map((s) => ({ ...s })) })
    setFeedbacks(nextFeedbacks.map((f) => ({ ...f, homework_items: f.homework_items.map((h) => ({ ...h })) })))
    setMistakes(nextMistakes)
    setLoading(false)
  }, [date])

  useEffect(() => {
    aliveRef.current = true
    setLoading(true)
    void load()
    return () => {
      aliveRef.current = false
    }
  }, [load, refreshTick])

  // 卸载时收尾高亮定时器，避免对已卸载组件 setState
  useEffect(() => () => {
    window.clearTimeout(flashTimerRef.current)
  }, [])

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const feedbackByStudent = useMemo(() => {
    const map = new Map<string, Feedback>()
    for (const fb of feedbacks) map.set(fb.student_id, fb)
    return map
  }, [feedbacks])

  /** 错题库未掌握题数：只在反馈单没有错题分析时兜底红字（02-A3 红字 = 薄弱提示）。 */
  const unmasteredByStudent = useMemo(() => {
    const map = new Map<string, number>()
    for (const mistake of mistakes) {
      for (const assoc of mistake.associations) {
        if (assoc.mastery === 'unmastered') map.set(assoc.student_id, (map.get(assoc.student_id) ?? 0) + 1)
      }
    }
    return map
  }, [mistakes])

  // 填写人头像口径：模拟助教提交过的单显示「林」，其余（种子/老师手动保存）显示「王」
  const fillerOf = useCallback((_studentId: string, fb?: Feedback): Filler => (
    fb && filledByAssistant.has(fb.id) ? 'assistant' : 'teacher'
  ), [filledByAssistant])

  const pending = useMemo(() => feedbacks.filter((f) => f.status === 'pending_review'), [feedbacks])
  const publishedCount = feedbacks.filter((f) => f.status === 'published').length
  const rejectedCount = feedbacks.filter((f) => f.status === 'draft' && f.reject_reason).length
  const leaveCount = feedbacks.filter((f) => f.leave).length
  const written = feedbacks.length
  const totalStudents = students.length
  const unseated = useMemo(() => unseatedStudents(students, seat), [students, seat])

  /** 3 秒位置记忆（02-A1）：定位/换座后高亮卡片 3 秒并滚到视野内，找学生不用翻找。 */
  const flash = useCallback((studentId: string) => {
    setFlashId(studentId)
    window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setFlashId(null), 3000)
    window.setTimeout(() => {
      const el = document.querySelector('[data-student-id="' + studentId + '"]')
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 30)
  }, [])

  const persistSeat = useCallback((next: SeatConfig) => {
    setSeat(next)
    // 座位是唯一落 localStorage 的页面状态（#3 02-08：刷新保持布局）
    void api.saveSeatConfig(next)
  }, [])

  const handleDropSeat = useCallback((studentId: string, r: number, c: number) => {
    persistSeat(moveSeat(seat, studentId, r, c))
    flash(studentId)
  }, [flash, persistSeat, seat])

  const handleUnseat = useCallback((studentId: string) => {
    persistSeat(unseatStudent(seat, studentId))
    message.info('已移回「未入座」名单：只删座位，反馈数据保留')
  }, [message, persistSeat, seat])

  /** 移动端没有可靠拖拽，用 ↑↓ 交换相邻两个座位（同一套 seats[]，落库结果一致）。 */
  const handleMoveOrder = useCallback((studentId: string, dir: -1 | 1) => {
    const ordered = orderedSeats(seat)
    const index = ordered.findIndex((item) => item.student_id === studentId)
    const target = ordered[index + dir]
    if (index < 0 || !target) return
    const self = ordered[index]
    const seats = seat.seats.map((item) => {
      if (item.student_id === self.student_id) return { ...item, r: target.r, c: target.c }
      if (item.student_id === target.student_id) return { ...item, r: self.r, c: self.c }
      return item
    })
    persistSeat({ ...seat, seats })
    flash(studentId)
  }, [flash, persistSeat, seat])

  const applyGrid = useCallback((value: string) => {
    const preset = GRID_PRESETS.find((item) => item.value === value)
    if (!preset) return
    const next = reflowSeat(seat, preset.rows, preset.cols)
    if (!next) {
      message.error('新网格放不下 ' + seat.seats.length + ' 名学生，请先把部分学生退班')
      return
    }
    // 02-03：变更二次确认 + 按原相对顺序稳定重排（reflowSeat 内部先按旧坐标行优先排序）
    modal.confirm({
      title: '调整行列',
      content: '将从 ' + seat.grid.rows + ' 行 × ' + seat.grid.cols + ' 列改为 ' + preset.rows + ' 行 × ' + preset.cols + ' 列。座位会按原相对顺序重排，学生数据不变，是否继续？',
      okText: '确认调整',
      cancelText: '取消',
      onOk: () => {
        persistSeat(next)
        const first = next.seats[0]
        if (first) flash(first.student_id)
        message.success('已按原相对顺序重排座位')
      },
    })
  }, [flash, message, modal, persistSeat, seat])

  const resetSeat = useCallback(() => {
    modal.confirm({
      title: '重置座位',
      content: '按当前学生的相对顺序重新排成 3 行 × 7 列，是否继续？',
      okText: '重置',
      cancelText: '取消',
      onOk: () => {
        const next = reflowSeat({ ...seat, seats: orderedSeats(seat) }, 3, 7)
        if (next) persistSeat(next)
        message.success('已重置为 3 行 × 7 列')
      },
    })
  }, [message, modal, persistSeat, seat])

  const changeDate = useCallback((next: string) => {
    setDate(next)
    setPendingOnly(false)
    try {
      localStorage.setItem(LS_DATE, next)
    } catch {
      // 隐私模式下写失败只影响记忆，不影响当次演示
    }
  }, [])

  /** 打开编辑 / 审核弹窗：没有反馈单时先 api.createFeedback 建草稿（卡片「待反馈」→「草稿」）。 */
  const openEditor = useCallback(async (studentId: string, mode: 'edit' | 'review' = 'edit') => {
    const student = studentById.get(studentId)
    if (!student) return
    const existing = await api.getFeedback(studentId, date)
    const feedback = existing ?? await api.createFeedback(studentId, date)
    setEditor({ feedback: cloneFeedback(feedback), student: { ...student }, mode })
    if (!existing) bumpRefresh()
  }, [bumpRefresh, date, studentById])

  const handleAddStudent = useCallback(async (input: NewStudentInput) => {
    await api.addStudent({
      name: input.name.trim(),
      grade: input.grade,
      school: input.school || '实验小学',
      parent_name: input.parent_name || '家长',
      parent_phone: input.parent_phone || '',
      status: 'active',
      note: input.note,
    })
    // 新学生还没有座位 → 重拉学生表，右侧「未入座」边栏即可拖上墙（与 P3 建档共用一套 mock）
    await load()
  }, [load])

  // ---------- 审核流模拟（#5：固定老师视角 + 预置假助教；顶栏开关默认关，20–40s 自动推进 + 单步） ----------
  const runSimTick = useCallback(async () => {
    if (simBusyRef.current) return
    simBusyRef.current = true
    try {
      const targetDate = dateRef.current
      const all = await api.listFeedbacks(targetDate)
      const activeStudents = studentsRef.current.filter((s) => s.status === 'active')
      const without = activeStudents.filter((s) => !all.some((f) => f.student_id === s.id))
      let target: Feedback | undefined
      if (without.length > 0) {
        // 优先补「今天还没有任何反馈单」的学生：演示时待反馈卡片会真的被填上
        target = await api.createFeedback(without[0].id, targetDate)
      } else {
        const drafts = all.filter((f) => f.status === 'draft' && !f.leave)
        if (drafts.length === 0) {
          message.info('模拟助教：今日反馈已全部提交，点「通过 / 退回」继续审核')
          return
        }
        target = drafts[0]
      }
      const studentName = studentsRef.current.find((s) => s.id === target!.student_id)?.name ?? '学生'
      const saved = await api.saveFeedback(simulateAssistantFill(target))
      await api.submitFeedback(saved.id)
      setFilledByAssistant((prev) => {
        const next = new Set(prev)
        next.add(saved.id)
        return next
      })
      submittedSinceRejectRef.current += 1
      if (submittedSinceRejectRef.current >= rejectTargetRef.current) {
        // 每 3–5 单随机制造 1 张退回（#5 决议）：退回=draft+reject_reason，不新增状态
        submittedSinceRejectRef.current = 0
        rejectTargetRef.current = 3 + Math.floor(Math.random() * 3)
        const fresh = await api.listFeedbacks(targetDate)
        const pendingNow = fresh.filter((f) => f.status === 'pending_review')
        if (pendingNow.length > 1) {
          const victim = pendingNow[Math.floor(Math.random() * pendingNow.length)]
          const reason = REJECT_REASONS[Math.floor(Math.random() * REJECT_REASONS.length)]
          await api.rejectFeedback(victim.id, reason)
          const victimName = studentsRef.current.find((s) => s.id === victim.student_id)?.name ?? '学生'
          message.warning('审核模拟：' + victimName + ' 的反馈被退回（' + reason + '）')
        }
      } else {
        message.success('模拟助教：' + studentName + ' 的反馈已提交审核')
      }
      bumpRefresh()
    } catch (error) {
      message.error('模拟推进失败：' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      simBusyRef.current = false
    }
  }, [bumpRefresh, message])

  const stepOnce = useCallback(async () => {
    await runSimTick()
    if (simOnRef.current) setSimCountdown(nextSimInterval())
  }, [runSimTick])

  // 开关打开后按 20–40s 排队：初值必须在 toggle 里同步写入，
  // 不能只靠 effect——effect 与「归零即推进」的 effect 在同一轮 commit 里，
  // 后者会读到旧值 0 而立刻推进一单（实测首单 0 秒就提交，不符合 20–40s 口径）。
  useEffect(() => {
    if (!simOn) {
      setSimCountdown(0)
      return
    }
    const id = window.setInterval(() => setSimCountdown((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => window.clearInterval(id)
  }, [simOn])

  // 倒计时归零 → 推进一单 → 重新排间隔。用 simOnRef 防止「推进过程中关掉开关仍续命」。
  useEffect(() => {
    if (!simOn || simCountdown > 0) return
    const timer = window.setTimeout(() => {
      void runSimTick().finally(() => {
        if (simOnRef.current) setSimCountdown(nextSimInterval())
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [simOn, simCountdown, runSimTick])

  const toggleSim = useCallback((next: boolean) => {
    setSimOn(next)
    // 同步写初值：保证归零 effect 首帧读到的是 20–40s 后的目标，而不是 0
    setSimCountdown(next ? nextSimInterval() : 0)
    if (next) message.info('模拟助教开始工作：约 20–40 秒推进一单，可用「单步」立即推进')
  }, [message])

  const currentPreset = seat.grid.rows + 'x' + seat.grid.cols
  const progressText = written + '/' + totalStudents

  return (
    <div style={{ padding: isMobile ? '12px 12px 24px' : '20px 24px 32px', maxWidth: '100%', overflowX: 'hidden' }}>
      <PageHeader
        title="每日反馈"
        summary={
          <span>
            {dateLabel(date)} · 一号教室 · 王老师 + 林助教 · 已写 <b className="num">{progressText}</b> 份
          </span>
        }
        extra={
          <>
            <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>家长视角预览</Button>
            <Button icon={<AuditOutlined />} onClick={() => setQueueOpen(true)}>
              审核队列 {pending.length > 0 ? '(' + pending.length + ')' : ''}
            </Button>
          </>
        }
      />

      {/* 顶栏：进度 / 待审核（点击过滤） / 日期 / 定位 / 座位开关 / 模拟助教 */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between',
          background: C.bgContainer, border: '1px solid ' + C.border, borderRadius: tokens.radius.lg, padding: '10px 12px', marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>进度</span>
            <span className="num" style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{progressText}</span>
            <div style={{ width: 72, height: 6, borderRadius: 3, background: C.bgHover, overflow: 'hidden' }} aria-hidden>
              <div style={{ width: (totalStudents ? Math.round((written / totalStudents) * 100) : 0) + '%', height: '100%', background: C.primary }} />
            </div>
          </div>
          <button
            type="button"
            className="fb-focusable"
            onClick={() => setPendingOnly((v) => !v)}
            aria-pressed={pendingOnly}
            style={{
              border: '1px solid ' + (pendingOnly ? C.primary : C.border),
              background: pendingOnly ? C.primaryBg : C.bgContainer,
              color: pendingOnly ? C.primaryTextHover : C.textSecondary,
              borderRadius: tokens.radius.base, padding: '2px 8px', fontSize: 12, cursor: 'pointer',
            }}
          >
            待审核 <b className="num">{pending.length}</b>
            <span style={{ fontSize: 11, marginLeft: 4 }}>{pendingOnly ? '点击清除过滤' : '点击过滤卡片墙'}</span>
          </button>
          <span style={{ fontSize: 12, color: C.textTertiary }}>已发布 <b className="num" style={{ color: C.successText }}>{publishedCount}</b></span>
          <span style={{ fontSize: 12, color: C.textTertiary }}>已退回 <b className="num" style={{ color: C.warningText }}>{rejectedCount}</b></span>
          <span style={{ fontSize: 12, color: C.textTertiary }}>请假 <b className="num" style={{ color: C.warningText }}>{leaveCount}</b></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.textTertiary }}>
            协作者 王老师 / 林助教
            <TeacherAvatar filler="assistant" size={18} />
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select
            size="small"
            value={date}
            onChange={changeDate}
            style={{ width: isMobile ? 132 : 150 }}
            aria-label="切换日期"
            options={DATE_OPTIONS.map((value) => ({ value, label: dateLabel(value) }))}
          />
          <Select
            size="small"
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="定位学生"
            style={{ width: isMobile ? 120 : 150 }}
            suffixIcon={<SearchOutlined />}
            aria-label="定位学生"
            options={students.map((student) => ({ value: student.id, label: student.name + ' · ' + student.grade }))}
            onChange={(value) => { if (value) flash(value) }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textSecondary }}>
            <Switch size="small" checked={editMode} onChange={setEditMode} />
            {editMode ? <UnlockOutlined /> : <EditOutlined />}
            调整座位
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textSecondary }}>
            <Switch size="small" checked={simOn} onChange={toggleSim} />
            模拟助教
          </label>
          {simOn ? (
            <span className="num" style={{ fontSize: 12, color: C.primaryTextHover }}>下次 {Math.max(simCountdown, 0)}s</span>
          ) : null}
          <Tooltip title="立即推进一单模拟（不改变开关状态）">
            <Button size="small" icon={<ThunderboltOutlined />} onClick={() => void stepOnce()}>单步</Button>
          </Tooltip>
        </div>
      </div>

      {pendingOnly ? (
        <div style={{ marginBottom: 12, padding: '6px 10px', background: C.warningBg, color: C.warningText, borderRadius: tokens.radius.base, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>只看待审核 {pending.length} 份（当天 mock 日期口径，02-23）</span>
          <Button size="small" type="text" onClick={() => setPendingOnly(false)}>清除过滤</Button>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <div style={{ background: C.bgContainer, border: '1px solid ' + C.border, borderRadius: tokens.radius.lg, padding: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  座位图 · {seat.grid.rows} 行 × {seat.grid.cols} 列 · {seat.seats.length} 人
                </div>
                <div style={{ fontSize: 12, color: C.textTertiary }}>
                  {editMode
                    ? '编辑画板：拖拽卡片换座，拖到右侧名单 = 退班（数据不删）；画板比可视区宽时可左右滚动，或收起右侧名单'
                    : '查看锁定：点卡片填写 / 查看反馈；「调整座位」进入编辑画板'}
                </div>
              </div>
              {editMode ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <Segmented
                    size="small"
                    value={GRID_PRESETS.some((p) => p.value === currentPreset) ? currentPreset : undefined}
                    options={GRID_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
                    onChange={(value) => applyGrid(String(value))}
                  />
                  <Button size="small" icon={<ReloadOutlined />} onClick={resetSeat}>重置</Button>
                  {!isMobile ? (
                    <Button
                      size="small"
                      icon={panelCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setPanelCollapsed((value) => !value)}
                    >
                      {panelCollapsed ? '展开名单' : '收起名单'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <Spin spinning={loading}>
              <SeatWall
                seat={seat}
                students={students}
                feedbackByStudent={feedbackByStudent}
                unmasteredByStudent={unmasteredByStudent}
                fillerOf={fillerOf}
                editMode={editMode}
                pendingOnly={pendingOnly}
                flashId={flashId}
                isMobile={isMobile}
                onOpen={(studentId) => void openEditor(studentId)}
                onDropSeat={handleDropSeat}
                onUnseat={handleUnseat}
                onMoveOrder={handleMoveOrder}
              />
            </Spin>

            {editMode && !isMobile ? (
              <div style={{ marginTop: 10, fontSize: 11, color: C.textQuaternary }}>
                提示：座位坐标只决定位置；换座 / 重排后卡片五要素与红字归属不变（02-A3）。未入座 {unseated.length} 人，见右侧边栏。
              </div>
            ) : null}
            {editMode && unseated.length > 0 && seat.seats.length >= seat.grid.rows * seat.grid.cols ? (
              <div style={{ marginTop: 8, padding: '6px 10px', background: C.warningBg, color: C.warningText, borderRadius: tokens.radius.base, fontSize: 12 }}>
                座位已满（{seat.seats.length}/{seat.grid.rows * seat.grid.cols}）：新学生已在右侧名单里，先切到 4 行 × 6 列多留 3 个空位，或把一名学生拖回名单再安排。
              </div>
            ) : null}
          </div>
        </div>

        {editMode && !panelCollapsed ? (
          <UnseatedPanel
            students={unseated}
            seatCount={seat.seats.length}
            onDropStudent={handleUnseat}
            onAddStudent={handleAddStudent}
            isMobile={isMobile}
          />
        ) : null}
      </div>

      {editor ? (
        <FeedbackEditorModal
          open
          mode={editor.mode}
          student={editor.student}
          initial={editor.feedback}
          isMobile={isMobile}
          onClose={() => setEditor(null)}
          onSaved={bumpRefresh}
        />
      ) : null}

      <ParentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        isMobile={isMobile}
        date={date}
        students={students}
        seat={seat}
        feedbackByStudent={feedbackByStudent}
      />

      <ReviewQueueModal
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        pending={pending}
        studentById={studentById}
        onReview={(studentId) => void openEditor(studentId, 'review')}
      />
    </div>
  )
}
