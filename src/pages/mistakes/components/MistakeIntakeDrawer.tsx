// 错题录入抽屉（#7 04-09）：拍照识别 / 手动录入两路共用一套表单。
// 为什么两路合成一个抽屉：两路最终都写同一张 mistakes 表 + 一条 mistake_student 关联，
// 只是「题干/答案/解析」来源不同；合并后校验、关联学生、错因只写一份。
// 拍照路运行逻辑：选图 → FileReader 转 dataURL 本地预览（不上传）→「识别题干」800ms 假识别回填
// 题干/答案/解析（04-09 要求预览 + 假识别回填）→ 老师可逐字改 → 保存调 api.createMistake
// + api.createMistakeStudent 内存入库；刷新回种子（04-08）。
// 手动路：直接填表单。两路都不依赖真实 OCR / 上传服务（demo 边界）。
import { App as AntApp, Button, Cascader, Drawer, Input, Segmented, Select, Tag } from 'antd'
import { CameraOutlined, ScanOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import type { Mastery, MistakeCause, QuestionType, Student, Subject, Tag as KnowledgeTag } from '@/types'
import * as api from '@/mock/api'
import { MOCK_TODAY } from '@/mock/api'
import { buildTagTree, subjectRootValue } from './tagTree'
import { CAUSE_OPTIONS, DIFFICULTY_LABEL, MASTERY_OPTIONS, QUESTION_TYPES } from './mistakeOptions'
import { useIsMobile } from './useIsMobile'

export type IntakeMode = 'photo' | 'manual'

interface Props {
  open: boolean
  initialMode: IntakeMode
  tags: KnowledgeTag[]
  students: Student[]
  onClose: () => void
  /** 录入成功后回调，页面据此重拉错题列表，新题立即可见。 */
  onSaved: () => void
}

/** 假识别句式库：按图片字节数取模选一条，同一张图重复识别结果一致（演示可复现，不调真实 OCR）。 */
const FAKE_OCR = [
  { text: '计算：5/6 − 1/3 = ?', answer: '1/2', analysis: '异分母分数减法先通分：5/6 − 2/6 = 3/6 = 1/2' },
  { text: '解方程：3x − 7 = 14', answer: 'x = 7', analysis: '移项得 3x = 21，两边同除 3 得 x = 7' },
  { text: '一个正方形的边长是 6cm，求它的面积。', answer: '36 cm²', analysis: '正方形面积 = 边长 × 边长 = 6 × 6 = 36 cm²' },
]

const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-textSecondary)', marginBottom: 6 }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  )
}

export default function MistakeIntakeDrawer({ open, initialMode, tags, students, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp()
  const isMobile = useIsMobile()
  const fileSizeRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<IntakeMode>('manual')
  const [imageUrl, setImageUrl] = useState<string>()
  const [recognizing, setRecognizing] = useState(false)
  const [recognized, setRecognized] = useState(false)
  const [saving, setSaving] = useState(false)

  const [subject, setSubject] = useState<Subject>('数学')
  const [tagId, setTagId] = useState<string>()
  const [questionType, setQuestionType] = useState<QuestionType>('计算')
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2)
  const [questionText, setQuestionText] = useState('')
  const [answer, setAnswer] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [studentId, setStudentId] = useState<string>()
  const [cause, setCause] = useState<MistakeCause>('concept')
  const [mastery, setMastery] = useState<Mastery>('unmastered')

  // 每次打开都重置：录入是「一次性表单」，残留上一次的题干/照片会让下一次误存（04-09）。
  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setImageUrl(undefined)
    setRecognized(false)
    setRecognizing(false)
    setSaving(false)
    fileSizeRef.current = 0
    setSubject('数学')
    setTagId(undefined)
    setQuestionType('计算')
    setDifficulty(2)
    setQuestionText('')
    setAnswer('')
    setAnalysis('')
    setStudentId(undefined)
    setCause('concept')
    setMastery('unmastered')
  }, [open, initialMode])

  const tagOptions = buildTagTree(tags).filter((n) => n.value === subjectRootValue(subject))

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    fileSizeRef.current = file.size
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(String(reader.result ?? ''))
      setRecognized(false)
    }
    reader.readAsDataURL(file)
  }

  function fakeRecognize() {
    if (!imageUrl) return
    setRecognizing(true)
    // 800ms 模拟识别耗时；结束后回填三个字段，老师可继续改写（04-09「假识别回填」）。
    window.setTimeout(() => {
      const hit = FAKE_OCR[fileSizeRef.current % FAKE_OCR.length]
      setQuestionText(hit.text)
      setAnswer(hit.answer)
      setAnalysis(hit.analysis)
      setRecognized(true)
      setRecognizing(false)
    }, 800)
  }

  async function save() {
    if (!questionText.trim()) {
      message.error('请填写题干，或先拍照识别回填')
      return
    }
    setSaving(true)
    try {
      const mistake = await api.createMistake({
        subject,
        question_text: questionText.trim(),
        answer: answer.trim() || '—',
        analysis: analysis.trim() || undefined,
        question_type: questionType,
        difficulty,
        tag_ids: tagId ? [tagId] : [],
        source: 'selftest',
        images: imageUrl ? [imageUrl] : undefined,
      })
      const student = students.find((s) => s.id === studentId)
      if (student) {
        await api.createMistakeStudent({
          mistake_id: mistake.id,
          student_id: student.id,
          cause,
          mastery,
          source_date: MOCK_TODAY,
          source_type: 'selftest',
        })
      }
      message.success('已录入错题' + (student ? '，并关联到 ' + student.name : '') + '（演示：刷新后回种子）')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={isMobile ? '100%' : 520}
      title="录入错题"
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={save}>保存录入</Button>
        </div>
      }
    >
      <Segmented
        value={mode}
        onChange={(v) => setMode(v as IntakeMode)}
        options={[
          { value: 'photo', label: '拍照识别' },
          { value: 'manual', label: '手动录入' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {mode === 'photo' ? (
        <div style={{ marginBottom: 16 }}>
          {/* 上传区用 label 包隐藏 input：375px 下整块可点，避免小按钮点不中（GL-27） */}
          <label
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 140, border: '1px dashed var(--color-borderStrong)', borderRadius: 'var(--radius-base)',
              background: 'var(--color-bgHover)', cursor: 'pointer', padding: 12, textAlign: 'center',
            }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile} />
            {imageUrl ? (
              <img src={imageUrl} alt="错题照片预览" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 'var(--radius-sm)' }} />
            ) : (
              <>
                <CameraOutlined style={{ fontSize: 24, color: 'var(--color-icon)' }} aria-hidden />
                <span style={{ fontSize: 13, color: 'var(--color-textSecondary)' }}>点击选择错题照片</span>
                <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>演示不上传服务器，仅本地预览</span>
              </>
            )}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <Button icon={<ScanOutlined />} loading={recognizing} disabled={!imageUrl} onClick={fakeRecognize}>
              识别题干
            </Button>
            {recognized ? <Tag color="success" style={{ marginInlineEnd: 0 }}>假识别完成，已回填可改</Tag> : null}
            {imageUrl ? <Button type="link" onClick={() => fileInputRef.current?.click()}>重新选择</Button> : null}
          </div>
        </div>
      ) : null}

      <Field label="题干（必填）">
        <Input.TextArea rows={3} value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="输入或识别题目原文" />
      </Field>
      <Field label="答案">
        <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="如：x = 6" />
      </Field>
      <Field label="解析">
        <Input.TextArea rows={2} value={analysis} onChange={(e) => setAnalysis(e.target.value)} placeholder="错因归因与正确思路" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <Field label="科目">
          <Select
            value={subject}
            style={{ width: '100%' }}
            options={['数学', '语文', '英语', '科学'].map((s) => ({ value: s, label: s }))}
            onChange={(v: Subject) => { setSubject(v); setTagId(undefined) }}
          />
        </Field>
        <Field label="知识点">
          <Cascader
            allowClear
            changeOnSelect
            style={{ width: '100%' }}
            options={tagOptions}
            value={tagId ? [subjectRootValue(subject), tagId] : []}
            displayRender={(labels) => labels.join(' / ')}
            onChange={(value) => {
              const last = value && value.length ? String(value[value.length - 1]) : undefined
              setTagId(last && !last.startsWith('subject:') ? last : undefined)
            }}
            placeholder="选择到节/模块"
          />
        </Field>
        <Field label="题型">
          <Select value={questionType} style={{ width: '100%' }} options={QUESTION_TYPES.map((t) => ({ value: t, label: t }))} onChange={(v: QuestionType) => setQuestionType(v)} />
        </Field>
        <Field label="难度">
          <Select value={difficulty} style={{ width: '100%' }} options={[1, 2, 3].map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} onChange={(v: 1 | 2 | 3) => setDifficulty(v)} />
        </Field>
      </div>

      <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0 12px' }} />
      <div style={labelStyle}>关联学生（录入后该生错题库可见，03-07）</div>
      <Select
        allowClear
        placeholder="选择做错的学生"
        style={{ width: '100%', marginBottom: 12 }}
        value={studentId}
        options={students.map((s) => ({ value: s.id, label: s.name + ' · ' + s.grade }))}
        onChange={(v) => setStudentId(v ?? undefined)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <Field label="错因">
          <Select value={cause} style={{ width: '100%' }} disabled={!studentId} options={CAUSE_OPTIONS} onChange={(v: MistakeCause) => setCause(v)} />
        </Field>
        <Field label="掌握状态">
          <Select value={mastery} style={{ width: '100%' }} disabled={!studentId} options={MASTERY_OPTIONS} onChange={(v: Mastery) => setMastery(v)} />
        </Field>
      </div>
    </Drawer>
  )
}
