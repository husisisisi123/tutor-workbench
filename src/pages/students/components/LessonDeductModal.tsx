import { useEffect, useState } from 'react'
import { App, InputNumber, Modal } from 'antd'
import { updateLessonPackage } from '@/mock/api'
import type { Student } from '@/types'
import type { LessonView } from '../lib/data'

// 「登记消耗」弹窗（03-12 / PRD §4.3）：手动登记本次消耗的课时数，写入 api.updateLessonPackage，
// 卡片墙与右栏的剩余课时随即刷新。为什么只填「消耗几节」而不让改总数：
// 总数是购课记录，改总数会同时改变进度条语义；撤销消耗留痕不在本期验收（PRD §六 明确留接口即可）。
export default function LessonDeductModal({
  open, student, lesson, onClose, onSaved,
}: {
  open: boolean
  student: Student
  lesson: LessonView
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [count, setCount] = useState<number>(1)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setCount(1); setSaving(false) }
  }, [open])

  const submit = async () => {
    if (!count || count <= 0) { message.warning('请填写消耗课时数'); return }
    setSaving(true)
    try {
      await updateLessonPackage(student.id, { used: lesson.used + count })
      message.success('已登记消耗 ' + count + ' 节')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={'登记课时消耗 · ' + student.name}
      width={380}
      rootClassName="p3-modal-root"
      onCancel={onClose}
      onOk={submit}
      okText="登记"
      cancelText="取消"
      confirmLoading={saving}
    >
      <div style={{ fontSize: 13, color: 'var(--color-textSecondary)', marginBottom: 8 }}>
        当前已用 {lesson.used} 节 / 共 {lesson.total} 节，剩余 {lesson.remaining} 节。
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13 }}>本次消耗</span>
        <InputNumber value={count} min={1} max={Math.max(1, lesson.remaining)} onChange={(value) => setCount(typeof value === 'number' ? value : 1)} aria-label="本次消耗课时" />
        <span style={{ fontSize: 13 }}>节</span>
      </div>
    </Modal>
  )
}
