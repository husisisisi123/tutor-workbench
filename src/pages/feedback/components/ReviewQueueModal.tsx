import { AuditOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import type { Feedback, Student } from '@/types'
import { tokens } from '@/theme/tokens'
import { C, scoreText, statusView, timeLabel } from '../helpers'
import { StatusPill } from './SeatCard'
import StudentAvatar from '@/components/StudentAvatar'

interface ReviewQueueModalProps {
  open: boolean
  onClose: () => void
  /** 当前日期的待审核反馈单（02-23：N = 当天 pending_review 数） */
  pending: Feedback[]
  studentById: Map<string, Student>
  /** 打开审核浮层（可改后通过，02-22） */
  onReview: (studentId: string) => void
}

/**
 * 审核队列浮层：把「当天 pending_review」聚成一张列表，点任一条进审核浮层直接改后通过。
 * 为什么单独一个队列而不是只在卡片上操作：待审核数在顶栏是个数字，数字点开必须有可操作的清单，
 * 否则演示时只能靠翻卡片找待审核（#5 计数口径 + 02-22）。
 */
export default function ReviewQueueModal({ open, onClose, pending, studentById, onReview }: ReviewQueueModalProps) {
  return (
    <Modal open={open} title={<span><AuditOutlined style={{ marginRight: 6 }} />待审核队列 · {pending.length} 份</span>} onCancel={onClose} footer={null} width={640} destroyOnHidden>
      {pending.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', color: C.textTertiary, fontSize: 13 }}>今天没有待审核的反馈单</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
          {pending.map((fb) => {
            const student = studentById.get(fb.student_id)
            if (!student) return null
            return (
              <div key={fb.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid ' + C.border, borderRadius: tokens.radius.lg, background: C.bgContainer }}>
                <StudentAvatar student={student} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{student.name}</span>
                    <StatusPill fb={fb} />
                    <span className="num" style={{ fontSize: 11, color: C.textTertiary }}>{timeLabel(fb.updated_at)} 提交</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {scoreText(fb)} · {fb.comment || '（正文为空）'}
                  </div>
                </div>
                <Button size="small" type="primary" onClick={() => { onClose(); onReview(student.id) }}>审核</Button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
