import { CheckOutlined } from '@ant-design/icons'
import StudentAvatar from '@/components/StudentAvatar'
import type { Feedback, Student } from '@/types'
import { tokens } from '@/theme/tokens'
import {
  C, doneCount, feedbackBadge, HOMEWORK_TOTAL, statusView, toneStyles, weakHint,
} from '../helpers'

export type Filler = 'teacher' | 'assistant'

const FILLER_NAME: Record<Filler, string> = { teacher: '王老师', assistant: '林助教' }

/**
 * 填写人头像（五要素之一，老师端）。
 * 为什么用「姓 + 圆形色块」而不是图片：设计系统未定头像风格（见 design-reference §六），
 * 共享 StudentAvatar 只服务学生；这里按同一视觉语言给填写人一个稳定标识，不引入 emoji/外链。
 */
export function TeacherAvatar({ filler, size = 20 }: { filler: Filler; size?: number }) {
  const isTeacher = filler === 'teacher'
  return (
    <div
      title={FILLER_NAME[filler]}
      style={{
        width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.55), fontWeight: 600,
        background: isTeacher ? C.primaryBg : C.bgHover,
        color: isTeacher ? C.primaryTextHover : C.textSecondary,
        border: '1px solid ' + (isTeacher ? C.primaryBg : C.borderStrong),
      }}
    >
      {isTeacher ? '王' : '林'}
    </div>
  )
}

/** 状态胶囊：浅底 + 深字（MASTER §1.3），文案与语义来自 helpers.statusView。 */
export function StatusPill({ fb, maxWidth }: { fb?: Feedback; maxWidth?: number }) {
  const view = statusView(fb)
  const style = toneStyles[view.tone]
  return (
    <span
      title={view.label}
      style={{
        display: 'inline-block', maxWidth: maxWidth ?? '100%', padding: '0 6px', borderRadius: tokens.radius.sm,
        fontSize: 11, lineHeight: '18px', background: style.bg, color: style.text,
        border: '1px solid ' + style.border, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        verticalAlign: 'middle',
      }}
    >
      {view.short}
    </span>
  )
}

interface SeatCardProps {
  student: Student
  feedback?: Feedback
  /** 该生错题库未掌握题数（红字兜底口径，02-A3） */
  unmastered: number
  filler: Filler
  /** 3 秒位置记忆高亮（02-A1） */
  flash: boolean
  /** 编辑画板模式：卡片可拖、点击不打开编辑弹窗 */
  editMode: boolean
  onClick: () => void
}

/**
 * 座位卡片（02-01 五要素：姓名 / 状态标签 / 完成度 n/9 √ / 红字 / 填写人头像）。
 * 尺寸由座位墙的 grid 列宽决定：查看态 140–200px（02-01），编辑态钉 140px 下限。
 * 请假卡灰底 + 琥珀标签（02-07），已退回显示琥珀「已退回·原因」（02-20）。
 */
export default function SeatCard({ student, feedback, unmastered, filler, flash, editMode, onClick }: SeatCardProps) {
  const status = statusView(feedback)
  const hint = weakHint(feedback, unmastered)
  const badge = feedbackBadge(feedback)
  const done = doneCount(feedback)
  const ratio = feedback && !feedback.leave ? done / HOMEWORK_TOTAL : 0
  const leave = Boolean(feedback?.leave)

  const borderColor = flash ? C.focusRing : C.border
  return (
    <div
      className={'fb-card fb-focusable' + (editMode ? ' fb-dragging-host' : '')}
      role="button"
      tabIndex={0}
      aria-label={student.name + '，' + status.label + '，完成度 ' + (feedback?.leave ? '请假' : done + ' of ' + HOMEWORK_TOTAL)}
      onClick={onClick}
      onKeyDown={(e) => {
        // 键盘可达：Enter / 空格等同点击（SC 2.1.1），编辑画板里 Enter 不打开弹窗
        if ((e.key === 'Enter' || e.key === ' ') && !editMode) {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 6,
        width: '100%', minWidth: 140, padding: 10, borderRadius: tokens.radius.lg,
        background: leave ? C.bgHover : C.bgContainer,
        // 请假卡灰底 + 虚线边框：颜色之外再给一个形状信号（SC 1.4.1）
        border: '1px ' + (leave ? 'dashed' : 'solid') + ' ' + borderColor,
        boxShadow: flash ? '0 0 0 3px ' + C.primaryBg : tokens.shadow.card,
        cursor: editMode ? 'grab' : 'pointer',
        userSelect: 'none',
      }}
    >
      {/* 要素 1：姓名 + 年级 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <StudentAvatar student={student} size={28} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={student.name}
          >
            {student.name}
          </div>
          <div style={{ fontSize: 11, color: C.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {student.grade}
          </div>
        </div>
        <span style={{ fontSize: 11, color: C.textTertiary }} title="已反馈 / 待反馈角标（#4）">
          {badge.text}
        </span>
      </div>

      {/* 要素 2：状态标签（请假 / 草稿 / 待审核 / 已发布 / 已退回） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <StatusPill fb={feedback} maxWidth={110} />
        {feedback?.reject_reason && status.tone === 'warning' ? (
          <span style={{ fontSize: 11, color: C.warningText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={feedback.reject_reason}>
            {feedback.reject_reason}
          </span>
        ) : null}
      </div>

      {/* 要素 3：完成度 n/9 √ + 进度条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="num" style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          {feedback?.leave ? '请假' : done + '/' + HOMEWORK_TOTAL}
        </span>
        <CheckOutlined
          aria-hidden
          style={{ fontSize: 12, color: done === HOMEWORK_TOTAL && !leave ? C.successText : C.textQuaternary }}
        />
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.bgHover, overflow: 'hidden' }} aria-hidden>
          <div style={{ width: Math.round(ratio * 100) + '%', height: '100%', background: C.primary, borderRadius: 2 }} />
        </div>
      </div>

      {/* 要素 4：红字（= 薄弱 / 错题提示，02-A3） */}
      <div
        title={hint.text}
        style={{
          fontSize: 12, lineHeight: 1.4, minHeight: 34,
          color: hint.tone === 'error' ? C.errorText : C.textTertiary,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {hint.text}
      </div>

      {/* 要素 5：填写人头像 + 更新时间 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span className="num" title={feedback?.leave ? feedback.leave_reason : undefined} style={{ fontSize: 11, color: C.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {feedback ? '更新 ' + (feedback.updated_at ? feedback.updated_at.slice(11, 16) : '—') : '未填写'}
        </span>
        <TeacherAvatar filler={filler} />
      </div>
    </div>
  )
}
