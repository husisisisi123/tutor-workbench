import { useEffect, useState } from 'react'
import { App, DatePicker, Form, Input, InputNumber, Modal, Select, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import StudentAvatar from '@/components/StudentAvatar'
import { createExam, MOCK_TODAY, saveExamRecords } from '@/mock/api'
import type { Exam, Subject } from '@/types'
import type { StudentRow } from '../lib/data'
import { useIsMobile } from './useIsMobile'

// 整班批量录入（#12 03-05 / PRD §七）：选/新建考试 → 21 人分数网格 → 一次保存。
// 为什么分数默认填入该生该科最近一次成绩：老师改的是「本次相对上次的变化」，全空让 21 格手填不现实；
// 默认值只作起点，保存时按输入值重算班排（班排 = 分数降序名次），轨迹图会多出一个新点。
// 写入走 api.createExam + api.saveExamRecords（内部按考试×学生 upsert），保存后父页面重新拉数据。
const SUBJECT_OPTIONS: Subject[] = ['数学', '语文', '英语', '科学']

export default function BatchScoreModal({
  open, rows, onClose, onSaved,
}: {
  open: boolean
  rows: StudentRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const isMobile = useIsMobile()
  const [subject, setSubject] = useState<Subject>('数学')
  const [examName, setExamName] = useState<string>('')
  const [date, setDate] = useState<Dayjs>(dayjs(MOCK_TODAY))
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [saving, setSaving] = useState(false)

  const prefill = (next: Subject) => {
    const nextScores: Record<string, number | null> = {}
    for (const row of rows) {
      const rs = row.records.filter((r) => r.subject === next)
      nextScores[row.student.id] = rs.length ? rs[rs.length - 1].score : 80
    }
    setScores(nextScores)
  }

  useEffect(() => {
    if (!open) return
    setSubject('数学')
    setExamName('数学随堂测（' + MOCK_TODAY + '）')
    setDate(dayjs(MOCK_TODAY))
    prefill('数学')
    setSaving(false)
    // rows 只在打开时用来取默认分；重开时 rows 已是最新数据，不需要额外依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const columns: TableColumnsType<StudentRow> = [
    {
      title: '学生',
      key: 'student',
      width: 180,
      render: (_value, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StudentAvatar student={row.student} size={24} />
          <span>{row.student.name}</span>
          <span style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>{row.student.grade}</span>
        </div>
      ),
    },
    {
      title: '当前成绩',
      key: 'current',
      width: 120,
      render: (_value, row) => {
        const rs = row.records.filter((r) => r.subject === subject)
        const last = rs[rs.length - 1]
        return <span className="num" style={{ color: 'var(--color-textTertiary)' }}>{last ? last.score : '—'}</span>
      },
    },
    {
      title: '本次分数',
      key: 'score',
      render: (_value, row) => (
        <InputNumber
          value={scores[row.student.id] ?? null}
          min={0}
          max={100}
          style={{ width: 120 }}
          onChange={(value) => setScores((prev) => ({ ...prev, [row.student.id]: typeof value === 'number' ? value : null }))}
          aria-label={row.student.name + ' 本次分数'}
        />
      ),
    },
  ]

  const submit = async () => {
    if (!examName.trim()) { message.warning('请填写考试名称'); return }
    const missing = rows.filter((row) => scores[row.student.id] === null || scores[row.student.id] === undefined)
    if (missing.length) { message.warning('还有 ' + missing.length + ' 人未填分数'); return }
    setSaving(true)
    try {
      const dateText = date.format('YYYY-MM-DD')
      const exam: Exam = await createExam({ name: examName.trim(), date: dateText, subject, full_score: 100 })
      // 班排按本次输入分数降序：先排序再取名次，保证同分也有稳定顺序（与种子 examRecords 口径一致）。
      const ranked = [...rows].sort((a, b) => (scores[b.student.id] ?? 0) - (scores[a.student.id] ?? 0))
      await saveExamRecords(rows.map((row) => ({
        exam_id: exam.id,
        student_id: row.student.id,
        subject,
        score: scores[row.student.id] ?? 0,
        class_rank: ranked.findIndex((r) => r.student.id === row.student.id) + 1,
        date: dateText,
      })))
      message.success('已保存 ' + rows.length + ' 人成绩')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="整班批量录入成绩"
      width={isMobile ? '100%' : 760}
      rootClassName="p3-modal-root"
      onCancel={onClose}
      onOk={submit}
      okText={'保存 ' + rows.length + ' 人成绩'}
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form layout="inline" size="small" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <Form.Item label="科目" style={{ marginInlineEnd: 8 }}>
          <Select<Subject>
            value={subject}
            style={{ width: 100 }}
            options={SUBJECT_OPTIONS.map((s) => ({ value: s, label: s }))}
            onChange={(next) => {
              setSubject(next)
              setExamName(next + '随堂测（' + MOCK_TODAY + '）')
              prefill(next)
            }}
          />
        </Form.Item>
        <Form.Item label="考试名称" style={{ marginInlineEnd: 8 }}>
          <Input value={examName} onChange={(event) => setExamName(event.target.value)} maxLength={40} style={{ width: 220 }} />
        </Form.Item>
        <Form.Item label="日期" style={{ marginInlineEnd: 0 }}>
          <DatePicker value={date} onChange={(value) => setDate(value ?? dayjs(MOCK_TODAY))} allowClear={false} />
        </Form.Item>
      </Form>
      <Table<StudentRow>
        rowKey={(row) => row.student.id}
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ y: 320 }}
      />
    </Modal>
  )
}
