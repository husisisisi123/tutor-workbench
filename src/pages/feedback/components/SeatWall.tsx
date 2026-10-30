import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined, LogoutOutlined } from '@ant-design/icons'
import { Button, Empty } from 'antd'
import { useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import type { Feedback, SeatConfig, Student } from '@/types'
import { tokens } from '@/theme/tokens'
import EmptyState from '@/components/EmptyState'
import { C, orderedSeats } from '../helpers'
import SeatCard, { StatusPill, TeacherAvatar } from './SeatCard'
import type { Filler } from './SeatCard'

/** 拖拽数据的 MIME：只接受本页发出的载荷，避免把浏览器里拖进来的文件/文字当成学生。 */
export const SEAT_DRAG_MIME = 'application/x-twb-student'

/** 拖拽载荷：kind=seat 是墙上的卡，kind=unseated 是右侧名单里的学生。 */
export type SeatDragPayload = { kind: 'seat' | 'unseated'; studentId: string }

export function readSeatDrag(e: DragEvent): SeatDragPayload | null {
  const raw = e.dataTransfer.getData(SEAT_DRAG_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SeatDragPayload
    return parsed && parsed.studentId ? parsed : null
  } catch {
    return null
  }
}

interface SeatWallProps {
  seat: SeatConfig
  students: Student[]
  feedbackByStudent: Map<string, Feedback>
  unmasteredByStudent: Map<string, number>
  fillerOf: (studentId: string, fb?: Feedback) => Filler
  editMode: boolean
  /** 只显示待审核卡片（02-23：点击待审核数过滤卡片墙） */
  pendingOnly: boolean
  flashId: string | null
  isMobile: boolean
  onOpen: (studentId: string) => void
  onDropSeat: (studentId: string, r: number, c: number) => void
  onUnseat: (studentId: string) => void
  /** 移动端编辑模式：按座位行优先顺序上移/下移（触屏没有可靠拖拽，改用按钮） */
  onMoveOrder: (studentId: string, dir: -1 | 1) => void
}

/**
 * 座位墙：把 {grid, seats[]} 渲染成 21 人卡片墙（桌面）或竖列表（375px，02-09）。
 * 怎么运行：座位坐标只决定「卡片放在哪一格」，学生数据与反馈数据都按 student_id 取；
 * 因此换行换列、拖拽换座之后，卡片的五要素与红字语义都不会错位（02-A3）。
 * 编辑画板里每格都是落点：占用互换、空位移动、拖到边栏退班（#3 v1/v2）。
 */
export default function SeatWall(props: SeatWallProps) {
  const {
    seat, students, feedbackByStudent, unmasteredByStudent, fillerOf,
    editMode, pendingOnly, flashId, isMobile, onOpen, onDropSeat, onUnseat, onMoveOrder,
  } = props
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const occupied = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of seat.seats) map.set(s.r + '-' + s.c, s.student_id)
    return map
  }, [seat.seats])

  const renderCard = (student: Student) => {
    const fb = feedbackByStudent.get(student.id)
    // 过滤模式只留待审核：其它卡片不渲染，但格子仍占位，位置不跳（02-A1 位置记忆）
    if (pendingOnly && fb?.status !== 'pending_review') return null
    return (
      <div
        key={student.id}
        data-student-id={student.id}
        // 宽度必须撑满格子：格子是 flex 居中容器，不显式给 100% 时卡片会按文本宽度收缩
        // （实测 137–155px 抖动，跌破 02-01 的 140px 下限），所以这里锁 100%。
        style={{ minWidth: 0, width: '100%' }}
        draggable={editMode}
        onDragStart={(e) => {
          e.dataTransfer.setData(SEAT_DRAG_MIME, JSON.stringify({ kind: 'seat', studentId: student.id }))
          e.dataTransfer.effectAllowed = 'move'
          setDraggingId(student.id)
        }}
        onDragEnd={() => setDraggingId(null)}
        className={draggingId === student.id ? 'fb-dragging' : undefined}
      >
        <SeatCard
          student={student}
          feedback={fb}
          unmastered={unmasteredByStudent.get(student.id) ?? 0}
          filler={fillerOf(student.id, fb)}
          flash={flashId === student.id}
          editMode={editMode}
          onClick={() => { if (!editMode) onOpen(student.id) }}
        />
      </div>
    )
  }

  if (seat.seats.length === 0) {
    return (
      <EmptyState
        title="还没有学生入座"
        description="先在右侧名单里录入学生，再把卡片拖到座位上"
        action={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} style={{ margin: 0 }} />}
      />
    )
  }

  // ---------- 移动端：竖列表（02-09） ----------
  if (isMobile) {
    const rows = orderedSeats(seat)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: C.textTertiary }}>
          {editMode ? '编辑模式：用 ↑↓ 调整座位顺序，或用「退班」把学生移回名单' : '点卡片填写 / 查看反馈'}
        </div>
        {rows.map((item, index) => {
          const student = studentById.get(item.student_id)
          if (!student) return null
          const fb = feedbackByStudent.get(student.id)
          if (pendingOnly && fb?.status !== 'pending_review') return null
          return (
            <div
              key={student.id}
              data-student-id={student.id}
              role="button"
              tabIndex={0}
              className="fb-focusable"
              onClick={() => { if (!editMode) onOpen(student.id) }}
              onKeyDown={(e) => { if (!editMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(student.id) } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: 10, minWidth: 0,
                cursor: editMode ? 'default' : 'pointer',
                background: fb?.leave ? C.bgHover : C.bgContainer,
                border: '1px ' + (fb?.leave ? 'dashed' : 'solid') + ' ' + (flashId === student.id ? C.focusRing : C.border),
                borderRadius: tokens.radius.lg,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {student.name}
                  </span>
                  <span style={{ fontSize: 11, color: C.textTertiary }}>{student.grade}</span>
                  <StatusPill fb={fb} maxWidth={96} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span className="num" style={{ fontSize: 12, color: C.textSecondary }}>
                    {fb?.leave ? '请假' : (fb ? fb.homework_items.filter((h) => h.done).length : 0) + '/9'}
                  </span>
                  <span
                    style={{
                      fontSize: 12, color: fb?.mistake_analysis ? C.errorText : C.textTertiary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170,
                    }}
                    title={fb?.mistake_analysis}
                  >
                    {fb?.leave ? fb.leave_reason : fb?.mistake_analysis || '—'}
                  </span>
                </div>
              </div>
              <TeacherAvatar filler={fillerOf(student.id, fb)} size={22} />
              {editMode ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button size="small" aria-label="上移" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMoveOrder(student.id, -1)} />
                  <Button size="small" aria-label="下移" icon={<ArrowDownOutlined />} disabled={index === rows.length - 1} onClick={() => onMoveOrder(student.id, 1)} />
                  <Button size="small" aria-label="退班" icon={<LogoutOutlined />} onClick={() => onUnseat(student.id)} />
                </div>
              ) : (
                <Button size="small" type="text" className="fb-focusable" onClick={() => onOpen(student.id)}>
                  填写
                </Button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ---------- 桌面：可吸附的网格画板 ----------
  const { rows, cols } = seat.grid
  // 查看态列宽自适应但封顶 200px（02-01 卡片宽 140–200）；编辑态钉 140px 下限，
  // 7 列 + 240px 边栏放不下时只在画板内横向滚动（见 feedback.css 注释）。
  const gap = 8
  // 编辑态对齐左上角而不是居中：宽度不足时若居中，左右两侧会同时被裁掉，看起来像渲染坏了；
  // 左对齐 + 画板内滚动至少保证第一列完整可见（页面上方也给了「收起名单」的出口）。
  const gridStyle: React.CSSProperties = editMode
    ? { display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 140px)', gap, justifyContent: 'start' }
    : { display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', minmax(140px, 1fr))', gap, maxWidth: cols * 200 + (cols - 1) * gap, margin: '0 auto' }

  return (
    <div className={editMode ? 'fb-wall-scroll' : undefined}>
      <div style={gridStyle}>
        {Array.from({ length: rows * cols }, (_, index) => {
          const r = Math.floor(index / cols)
          const c = index % cols
          const key = r + '-' + c
          const studentId = occupied.get(key)
          const student = studentId ? studentById.get(studentId) : undefined
          const isTarget = dragOver === key
          const cellStyle: React.CSSProperties = {
            minWidth: 0, minHeight: 132, borderRadius: tokens.radius.lg,
            // 编辑画板里空格子也是落点：虚线框 + 文字提示，不靠颜色唯一表达
            background: isTarget ? C.primaryBg : undefined,
            border: editMode && !student ? '1px dashed ' + C.borderStrong : undefined,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }
          return (
            <div
              key={key}
              style={cellStyle}
              className={isTarget ? 'fb-drop-target' : undefined}
              onDragOver={(e) => {
                if (!editMode) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOver !== key) setDragOver(key)
              }}
              onDragLeave={() => { if (dragOver === key) setDragOver(null) }}
              onDrop={(e) => {
                if (!editMode) return
                e.preventDefault()
                setDragOver(null)
                const payload = readSeatDrag(e)
                if (payload) onDropSeat(payload.studentId, r, c)
                setDraggingId(null)
              }}
            >
              {student ? renderCard(student) : (
                editMode ? (
                  <span style={{ fontSize: 12, color: C.textQuaternary }}>
                    <HolderOutlined /> 空位
                  </span>
                ) : null
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
