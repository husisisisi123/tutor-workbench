import { EyeOutlined } from '@ant-design/icons'
import { Modal } from 'antd'
import type { Feedback, SeatConfig, Student } from '@/types'
import { tokens } from '@/theme/tokens'
import { C, dateLabel, doneCount, HOMEWORK_TOTAL, orderedSeats, statusView } from '../helpers'

interface ParentPreviewModalProps {
  open: boolean
  onClose: () => void
  isMobile: boolean
  date: string
  students: Student[]
  seat: SeatConfig
  feedbackByStudent: Map<string, Feedback>
}

/**
 * 家长视角预览（02-10 / 02-24）：按 Excel 版式把一整页反馈单排版出来。
 * 怎么运行：先按座位行优先排序（与 Excel 一页 5 人 × 4 行的阅读顺序一致），再按学生块平铺；
 * 只有 status=published 的反馈单显示完整内容，草稿/待审核/已退回一律显示「发布后家长可见」，
 * 避免把内部流转状态泄漏给家长视角（#5 决议）。
 */
export default function ParentPreviewModal(props: ParentPreviewModalProps) {
  const { open, onClose, isMobile, date, students, seat, feedbackByStudent } = props
  const studentById = new Map(students.map((s) => [s.id, s]))
  const ordered = orderedSeats(seat)
    .map((item) => studentById.get(item.student_id))
    .filter((s): s is Student => Boolean(s))
  // 未入座的学生排在最后：家长视角按「今天有反馈的学生」展示，不丢人
  const seatedIds = new Set(ordered.map((s) => s.id))
  const rest = students.filter((s) => !seatedIds.has(s.id))
  const sheet = [...ordered, ...rest]

  const cell: React.CSSProperties = {
    border: '1px solid ' + C.border,
    padding: '2px 4px',
    fontSize: 11,
    lineHeight: 1.5,
    color: C.textSecondary,
  }

  return (
    <Modal
      open={open}
      title={<span><EyeOutlined style={{ marginRight: 6 }} />家长视角预览 · {dateLabel(date)}</span>}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100%' : 1080}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: 24 }}
      styles={{ body: { padding: 16, maxHeight: isMobile ? 'calc(100vh - 120px)' : '76vh', overflowY: 'auto' } }}
      destroyOnHidden
    >
      <div style={{ fontSize: 12, color: C.warningText, background: C.warningBg, borderRadius: tokens.radius.base, padding: '6px 10px', marginBottom: 12 }}>
        家长只能看到「已发布」的反馈单；草稿 / 待审核 / 已退回在此显示为「发布后家长可见」。
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: 10,
          border: '1px solid ' + C.borderStrong,
          padding: 8,
          background: C.bgContainer,
        }}
      >
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '2px 4px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>26 秋季一号教室 · 作业反馈表</div>
          <div className="num" style={{ fontSize: 12, color: C.textSecondary }}>{dateLabel(date)} · 王老师</div>
        </div>
        {sheet.map((student) => {
          const fb = feedbackByStudent.get(student.id)
          const published = fb?.status === 'published'
          const status = statusView(fb)
          return (
            <div key={student.id} style={{ border: '1px solid ' + C.borderStrong, background: C.bgContainer }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '4px 6px', background: C.bgHover }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  {student.name}<span style={{ fontSize: 11, fontWeight: 400, color: C.textTertiary, marginLeft: 4 }}>{student.grade}</span>
                </span>
                <span style={{ fontSize: 10, color: published ? C.successText : C.textTertiary }}>
                  {published ? '已发布' : '发布后家长可见'}
                </span>
              </div>
              {!published ? (
                <div style={{ padding: 10, minHeight: 150, fontSize: 12, color: C.textQuaternary, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  该生反馈单当前为「{status.short}」，发布后家长端可见
                </div>
              ) : (
                <div>
                  {fb?.leave ? (
                    <div style={{ ...cell, minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.warningText }}>请假</span>
                      <span style={{ fontSize: 12, color: C.textSecondary }}>{fb.leave_reason || '家长已请假'}</span>
                      <span style={{ fontSize: 11 }}>{fb.comment}</span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, ...cell, background: C.bgLayout }}>
                        <span>完成度 {doneCount(fb)}/{HOMEWORK_TOTAL}</span>
                        <span className="num">分数 {fb.score ?? '—'} / {fb.score_full ?? 100}</span>
                      </div>
                      {fb.homework_items.map((item, index) => (
                        <div key={item.id} style={{ ...cell, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="num" style={{ width: 12, color: C.textQuaternary }}>{index + 1}</span>
                          <span style={{ flex: 1, color: item.done ? C.text : C.textTertiary, textDecoration: item.done ? 'none' : 'line-through' }}>
                            {item.label}{index === 7 && item.book ? '（' + item.book + (item.page ? ' ' + item.page : '') + '）' : ''}
                          </span>
                          <span style={{ color: item.done ? C.successText : C.textQuaternary }}>{item.done ? '√' : '—'}</span>
                        </div>
                      ))}
                      <div style={{ ...cell, whiteSpace: 'pre-wrap', minHeight: 62 }}>
                        {fb.comment || '（正文为空）'}
                      </div>
                      {fb.mistake_analysis ? (
                        <div style={{ ...cell, color: C.errorText }}>错题分析：{fb.mistake_analysis}</div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
