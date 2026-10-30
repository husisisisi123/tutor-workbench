import { useEffect, useMemo, useState } from 'react'
import { App, Col, DatePicker, Divider, Form, Input, InputNumber, Modal, Radio, Row, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { EChartsOption } from 'echarts'
import Chart from '@/components/Chart'
import { createExam, MOCK_TODAY, saveExamRecord } from '@/mock/api'
import type { Exam, Student, Subject } from '@/types'
import { tokens } from '@/theme/tokens'
import type { StudentRow } from '../lib/data'
import { useIsMobile } from './useIsMobile'

// 单条录成绩（#12 03-04 / PRD §七）：左表单、右「插入后轨迹」实时预览，保存后卡片墙与轨迹图即时刷新。
// 为什么右侧预览自己算点而不是另存一份数据：预览用的就是「已有成绩 + 待保存这一条」，
// 保存成功后详情页重新拉 getStudentExamRecords，两边口径一致（05-04 要求数字对账）。
// 新建考试走 api.createExam + api.saveExamRecord；已有考试走 upsert（覆盖同一次成绩，不重复插点）。
export default function ScoreEntryModal({
  open, student, rows, exams, onClose, onSaved,
}: {
  open: boolean
  student: Student
  rows: StudentRow[]
  exams: Exam[]
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const isMobile = useIsMobile()
  const [subject, setSubject] = useState<Subject>('数学')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [examId, setExamId] = useState<string>('')
  const [examName, setExamName] = useState<string>('')
  const [date, setDate] = useState<Dayjs>(dayjs(MOCK_TODAY))
  const [score, setScore] = useState<number | null>(null)
  const [fullScore, setFullScore] = useState<number>(100)
  const [comment, setComment] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const row = rows.find((r) => r.student.id === student.id)
  const subjectRecords = useMemo(() => (row ? row.records.filter((r) => r.subject === subject) : []), [row, subject])
  const subjectExams = useMemo(() => exams.filter((e) => e.subject === subject), [exams, subject])
  const existingRecord = subjectRecords.find((r) => r.exam_id === examId)

  // 每次打开重置成默认值：默认「新建考试」而不是选已有考试，避免演示时误覆盖历史成绩。
  useEffect(() => {
    if (!open) return
    setSubject('数学')
    setMode('new')
    setExamId('')
    setExamName('数学随堂测（' + MOCK_TODAY + '）')
    setDate(dayjs(MOCK_TODAY))
    setScore(null)
    setFullScore(100)
    setComment('')
    setSaving(false)
  }, [open])

  // 切换科目时同步默认考试名与满分：沿用该科最近一次考试的满分，减少手填（雷达/得分率都按满分算）。
  const onSubjectChange = (next: Subject) => {
    setSubject(next)
    setMode('new')
    setExamId('')
    setExamName(next + '随堂测（' + MOCK_TODAY + '）')
    const sameSubjectExams = exams.filter((e) => e.subject === next)
    setFullScore(sameSubjectExams.length ? sameSubjectExams[sameSubjectExams.length - 1].full_score : 100)
    setScore(null)
  }

  // 预览序列：已有该科成绩 + 待保存点；已有考试覆盖时替换同 exam_id 的点，保证不出现重复 x。
  const preview = useMemo(() => {
    const points = subjectRecords.map((r) => ({ label: r.date.slice(5), value: r.score, examId: r.exam_id }))
    if (score !== null) {
      if (mode === 'existing' && examId) {
        const idx = points.findIndex((p) => p.examId === examId)
        if (idx >= 0) points[idx] = { ...points[idx], value: score }
        else points.push({ label: date.format('MM-DD'), value: score, examId })
      } else {
        points.push({ label: date.format('MM-DD'), value: score, examId: 'pending' })
      }
    }
    return points.sort((a, b) => a.label.localeCompare(b.label))
  }, [subjectRecords, score, mode, examId, date])

  const option: EChartsOption = {
    grid: { left: 40, right: 16, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: preview.map((p) => p.label),
      axisLabel: { color: tokens.color.textTertiary, fontSize: 11 },
      axisLine: { lineStyle: { color: tokens.color.border } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: tokens.color.textTertiary, fontSize: 11 },
      splitLine: { lineStyle: { color: tokens.color.borderSecondary } },
    },
    series: [{
      type: 'line',
      smooth: true,
      symbolSize: 6,
      data: preview.map((p) => p.value),
      lineStyle: { color: tokens.color.primary, width: 2 },
      itemStyle: { color: tokens.color.primary },
    }],
  }

  const submit = async () => {
    if (score === null) { message.warning('请填写分数'); return }
    if (score < 0 || score > fullScore) { message.warning('分数需在 0–' + fullScore + ' 之间'); return }
    if (mode === 'new' && !examName.trim()) { message.warning('请填写考试名称'); return }
    if (mode === 'existing' && !examId) { message.warning('请选择考试'); return }
    setSaving(true)
    try {
      const dateText = date.format('YYYY-MM-DD')
      let targetExamId = examId
      if (mode === 'new') {
        const exam = await createExam({ name: examName.trim(), date: dateText, subject, full_score: fullScore })
        targetExamId = exam.id
      }
      // 班排：已有考试按班级同考次成绩重算；新建考试当前只有本人一条，班排记 0 = 「— 未排名」，
      // 等整班批量录入后才会出现真实名次（03-11 班内分位依赖班排）。
      const classmates = rows
        .map((r) => r.records.find((x) => x.exam_id === targetExamId))
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
      const classRank = classmates.length
        ? 1 + classmates.filter((x) => x.student_id !== student.id && x.score > score).length
        : 0
      await saveExamRecord({
        exam_id: targetExamId, student_id: student.id, subject, score,
        class_rank: classRank, date: dateText, comment: comment.trim() || undefined,
      })
      message.success('成绩已保存')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={'录成绩 · ' + student.name}
      width={isMobile ? '100%' : 860}
      rootClassName="p3-modal-root"
      onCancel={onClose}
      onOk={submit}
      okText="保存成绩"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Row gutter={20}>
        <Col xs={24} md={13}>
          <Form layout="vertical" size="small">
            <Form.Item label="科目" style={{ marginBottom: 8 }}>
              <Select<Subject>
                value={subject}
                options={(['数学', '语文', '英语', '科学'] as Subject[]).map((s) => ({ value: s, label: s }))}
                onChange={onSubjectChange}
              />
            </Form.Item>
            <Form.Item label="考试" style={{ marginBottom: 8 }}>
              <Radio.Group
                value={mode}
                onChange={(event) => setMode(event.target.value as 'new' | 'existing')}
                options={[{ value: 'new', label: '新建考试' }, { value: 'existing', label: '选已有考试' }]}
              />
            </Form.Item>
            {mode === 'new' ? (
              <Form.Item label="考试名称" style={{ marginBottom: 8 }}>
                <Input value={examName} onChange={(event) => setExamName(event.target.value)} maxLength={40} />
              </Form.Item>
            ) : (
              <Form.Item label="选择考试" style={{ marginBottom: 8 }}>
                <Select
                  value={examId || undefined}
                  placeholder="选择一次已有考试"
                  options={subjectExams.map((e) => ({ value: e.id, label: e.date + ' · ' + e.name }))}
                  onChange={(value: string) => {
                    setExamId(value)
                    const exam = subjectExams.find((e) => e.id === value)
                    if (exam) setFullScore(exam.full_score)
                  }}
                />
              </Form.Item>
            )}
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="分数" style={{ marginBottom: 8 }}>
                  <InputNumber
                    value={score}
                    min={0}
                    max={fullScore}
                    style={{ width: '100%' }}
                    onChange={(value) => setScore(typeof value === 'number' ? value : null)}
                    placeholder="0–" aria-label="分数"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="满分" style={{ marginBottom: 8 }}>
                  <InputNumber
                    value={fullScore}
                    min={1}
                    max={300}
                    disabled={mode === 'existing'}
                    style={{ width: '100%' }}
                    onChange={(value) => setFullScore(typeof value === 'number' ? value : 100)}
                    aria-label="满分"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="考试日期" style={{ marginBottom: 8 }}>
                  <DatePicker value={date} onChange={(value) => setDate(value ?? dayjs(MOCK_TODAY))} style={{ width: '100%' }} allowClear={false} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="备注" style={{ marginBottom: 8 }}>
                  <Input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={40} placeholder="可选" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Col>
        <Col xs={24} md={11}>
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>插入后轨迹（{subject}）</div>
          <Chart option={option} height={220} />
          <div style={{ fontSize: 12, color: mode === 'existing' && existingRecord ? 'var(--color-warningText)' : 'var(--color-textSecondary)' }}>
            {mode === 'existing' && existingRecord
              ? '该次考试已有 ' + existingRecord.score + ' 分，保存将覆盖为 ' + (score ?? '—') + ' 分'
              : '保存后新增 1 个成绩点'}
          </div>
          <Divider style={{ margin: '10px 0 6px' }} />
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>
            当前满分按该科最近一次考试取 {fullScore} 分；得分率与雷达图都按这个满分折算。
          </div>
        </Col>
      </Row>
    </Modal>
  )
}
