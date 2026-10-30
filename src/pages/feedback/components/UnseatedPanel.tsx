import { UserAddOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Select, App } from 'antd'
import { useState } from 'react'
import type { DragEvent } from 'react'
import type { Student } from '@/types'
import { tokens } from '@/theme/tokens'
import StudentAvatar from '@/components/StudentAvatar'
import { C } from '../helpers'
import { SEAT_DRAG_MIME } from './SeatWall'

export interface NewStudentInput {
  name: string
  grade: string
  school: string
  parent_name: string
  parent_phone: string
  note?: string
}

interface UnseatedPanelProps {
  /** 未入座学生（退班 + 新录入），已由页面用 unseatedStudents() 派生 */
  students: Student[]
  seatCount: number
  onDropStudent: (studentId: string) => void
  onAddStudent: (input: NewStudentInput) => Promise<void>
  isMobile: boolean
}

const GRADES = ['二年级', '三年级', '四年级', '五年级', '六年级']

/**
 * 右侧 240px「未入座」边栏（02-04，仅编辑画板模式）。
 * 怎么运行：名单里是在 seats[] 中找不到的学生；把墙上的卡拖进本栏 = 退班（只删座位记录，学生与反馈数据保留）；
 * 把本栏学生拖到墙上空格 = 入座；「添加学生」走 api.addStudent，与 P3 建档共用同一套 mock 学生表。
 */
export default function UnseatedPanel({ students, seatCount, onDropStudent, onAddStudent, isMobile }: UnseatedPanelProps) {
  const { message } = App.useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hover, setHover] = useState(false)
  const [form] = Form.useForm<NewStudentInput>()

  const submitAdd = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await onAddStudent(values)
      message.success('已加入名单，把它拖到座位上即可')
      setAddOpen(false)
      form.resetFields()
    } finally {
      setSaving(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setHover(false)
    const raw = e.dataTransfer.getData(SEAT_DRAG_MIME)
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as { kind: string; studentId: string }
      if (payload.kind === 'seat' && payload.studentId) onDropStudent(payload.studentId)
    } catch {
      // 非法载荷直接忽略：本栏只处理座位卡拖入
    }
  }

  return (
    <aside
      onDragOver={(e) => { e.preventDefault(); setHover(true) }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      style={{
        width: isMobile ? '100%' : 240, flex: '0 0 auto',
        background: hover ? C.primaryBg : C.bgContainer,
        border: '1px solid ' + (hover ? C.primary : C.border),
        borderRadius: tokens.radius.lg, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: isMobile ? 260 : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>未入座 · {students.length} 人</div>
          <div style={{ fontSize: 11, color: C.textTertiary }}>已入座 {seatCount} 人</div>
        </div>
        <Button size="small" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
          添加
        </Button>
      </div>

      <div style={{ fontSize: 11, color: C.textTertiary, lineHeight: 1.5 }}>
        先把学生录进名单，再拖到左侧座位；把墙上的卡拖回这里 = 退班（数据不删）。
      </div>

      <div className="fb-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
        {students.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textQuaternary, padding: '12px 0', textAlign: 'center' }}>
            全部学生已入座
          </div>
        ) : (
          students.map((student) => (
            <div
              key={student.id}
              data-student-id={student.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(SEAT_DRAG_MIME, JSON.stringify({ kind: 'unseated', studentId: student.id }))
                e.dataTransfer.effectAllowed = 'move'
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'grab',
                border: '1px solid ' + C.border, borderRadius: tokens.radius.base, background: C.bgLayout,
              }}
              title="拖到左侧空位入座"
            >
              <StudentAvatar student={student} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</div>
                <div style={{ fontSize: 11, color: C.textTertiary }}>{student.grade}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={addOpen}
        title="录入学生名单"
        okText="加入名单"
        cancelText="取消"
        confirmLoading={saving}
        onOk={submitAdd}
        onCancel={() => setAddOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ grade: '三年级', school: '实验小学' }} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
            <Input placeholder="学生姓名" maxLength={12} />
          </Form.Item>
          <Form.Item name="grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}>
            <Select options={GRADES.map((g) => ({ value: g, label: g }))} />
          </Form.Item>
          <Form.Item name="school" label="学校">
            <Input placeholder="就读学校" maxLength={20} />
          </Form.Item>
          <Form.Item name="parent_name" label="家长姓名">
            <Input placeholder="如 张女士" maxLength={12} />
          </Form.Item>
          <Form.Item name="parent_phone" label="家长电话" rules={[{ pattern: /^1\d{10}$/, message: '请填写 11 位手机号' }]}>
            <Input placeholder="11 位手机号" maxLength={11} />
          </Form.Item>
        </Form>
      </Modal>
    </aside>
  )
}
