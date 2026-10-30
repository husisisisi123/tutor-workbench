import { useEffect, useRef, useState } from 'react'
import { App, Button, Form, Input, Modal, Progress, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import {
  deleteReport, generateReportDraft, MOCK_TODAY, publishReport, updateReport,
} from '@/mock/api'
import type { Exam, GrowthPlan, LearningReport, Student } from '@/types'
import type { StudentRow } from '../lib/data'
import { weakSubject } from '../lib/derive'
import MarkdownPreview from './MarkdownPreview'
import { useIsMobile } from './useIsMobile'

// 学习报告双栏弹窗（#8 05-04~05-08 / PRD §三）：
// 左栏「报告正文 Markdown + 家长可见摘要」，右栏实时预览；页脚 取消 / 存草稿 / 发布。
// 生成交互：AI 生成草稿走 api.generateReportDraft（内置 1500ms），这里用 15%→60%→88%→100%
// 的假进度把等待画出来（05-04 要求 1.5–2s 可见进度）；已有正文时重新生成先二次确认。
// 草稿存储的一个坑：api 没有「直接新建报告」的写接口，生成器才会落一条草稿行；
// 所以「没生成就直接存草稿」时先调生成器建行，再把正文覆盖成老师写的内容（ensureReport）。
// 取消时把本次生成的临时草稿删掉（deleteReport 只删草稿），避免列表里留下幽灵草稿。
export default function ReportEditorModal({
  open, student, row, plan, exams, report, onClose, onSaved,
}: {
  open: boolean
  student: Student
  row: StudentRow
  plan?: GrowthPlan
  exams: Exam[]
  report: LearningReport | null
  onClose: () => void
  onSaved: () => void
}) {
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  // 用 ref 记住「本次弹窗里生成出来的草稿行」与当前草稿 id，异步回调里读最新值（state 会滞后一帧）。
  const autoCreatedRef = useRef<string[]>([])
  const draftIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    draftIdRef.current = report?.id ?? null
    autoCreatedRef.current = []
    setDraftId(report?.id ?? null)
    setTitle(report?.title ?? MOCK_TODAY + ' 学习总结')
    setContent(report?.content_md ?? '')
    setSummary(report?.parent_summary ?? '')
    setGenerating(false)
    setProgress(0)
    setSaving(false)
  }, [open, report])

  const runGenerate = async () => {
    setGenerating(true)
    setProgress(15)
    const to60 = setTimeout(() => setProgress(60), 450)
    const to88 = setTimeout(() => setProgress(88), 1100)
    try {
      const temp = await generateReportDraft(student.id)
      setProgress(100)
      autoCreatedRef.current = [...autoCreatedRef.current, temp.id]
      if (!draftIdRef.current) {
        draftIdRef.current = temp.id
        setDraftId(temp.id)
      }
      // 无规划学生：api 只写「暂无成长规划」，这里补上「自动建议」第四段（05-03）。
      setContent(plan ? temp.content_md : withAutoSuggestion(temp.content_md, row, exams, student.name))
      setSummary(temp.parent_summary ?? '')
      setTitle(temp.title)
      message.success('草稿已生成，可直接编辑')
    } finally {
      clearTimeout(to60); clearTimeout(to88)
      setGenerating(false)
    }
  }

  const generate = () => {
    if (generating) return
    if (!content.trim()) { void runGenerate(); return }
    modal.confirm({
      title: '重新生成会覆盖当前正文',
      content: '当前正文与家长摘要将被新生成的内容替换，确定继续？',
      okText: '继续生成',
      cancelText: '取消',
      onOk: () => runGenerate(),
    })
  }

  /** 保证内存库里有一条可写的报告行；返回报告 id（没生成过时借生成器建行再覆盖正文）。 */
  const ensureReport = async (): Promise<string> => {
    if (draftIdRef.current) return draftIdRef.current
    const created = await generateReportDraft(student.id)
    autoCreatedRef.current = [...autoCreatedRef.current, created.id]
    draftIdRef.current = created.id
    setDraftId(created.id)
    return created.id
  }

  /** 只保留 keepId，其余本次生成的临时草稿全部删除。 */
  const cleanupAutoCreated = async (keepId: string) => {
    const ids = autoCreatedRef.current
    autoCreatedRef.current = []
    for (const id of ids) {
      if (id !== keepId) await deleteReport(id)
    }
  }

  const persist = async (publish: boolean) => {
    if (!content.trim()) { message.warning('报告正文不能为空'); return }
    setSaving(true)
    try {
      const id = await ensureReport()
      await updateReport(id, {
        title: title.trim() || MOCK_TODAY + ' 学习总结',
        content_md: content,
        parent_summary: summary.trim() || undefined,
      })
      if (publish) await publishReport(id)
      await cleanupAutoCreated(id)
      message.success(publish ? '已发布，家长可见' : '已存草稿')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (generating || saving) return
    const ids = autoCreatedRef.current
    autoCreatedRef.current = []
    for (const id of ids) await deleteReport(id)
    onClose()
  }

  const generateSummary = () => {
    setSummary(buildParentSummary(row, plan, exams))
    message.success('已生成 3 句家长摘要，可继续修改')
  }

  return (
    <Modal
      open={open}
      title={
        <span>
          {report ? '编辑学习报告' : '新建学习报告'} · {student.name}
          {report?.status === 'published' ? <Tag color="success" style={{ marginLeft: 8 }}>家长可见</Tag> : null}
        </span>
      }
      width={isMobile ? '100%' : 1000}
      rootClassName="p3-modal-root"
      onCancel={handleCancel}
      maskClosable={false}
      closable={!generating && !saving}
      footer={(
        <Space>
          <Button onClick={handleCancel} disabled={generating || saving}>取消</Button>
          <Button onClick={() => { void persist(false) }} loading={saving} disabled={generating}>存草稿</Button>
          <Button type="primary" onClick={() => { void persist(true) }} loading={saving} disabled={generating}>发布</Button>
        </Space>
      )}
    >
      {generating ? (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--color-primaryBg)', borderRadius: 'var(--radius-base)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-primaryText)', marginBottom: 6 }}>AI 正在生成草稿…（事实层来自成绩 / 错题 / 课时，约 1.5–2s）</div>
          <Progress percent={progress} size="small" status="active" />
        </div>
      ) : null}

      <div className="p3-editor">
        <div>
          <Form layout="vertical" size="small">
            <Form.Item label="标题" style={{ marginBottom: 8 }} help="按「YYYY-MM-DD 学习总结」自动生成，可改；同一天允许多份同名">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={40} />
            </Form.Item>
            <Form.Item label="报告正文（Markdown，四段）" style={{ marginBottom: 8 }}>
              <Input.TextArea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                autoSize={{ minRows: 12, maxRows: 18 }}
                placeholder={'## 一、本周学习概况\n…\n## 四、下阶段规划\n…'}
                disabled={generating}
              />
            </Form.Item>
            <Form.Item
              label={(
                <span>
                  家长可见摘要（可选）
                  <Button size="small" type="link" onClick={generateSummary} style={{ paddingInline: 6 }}>AI 生成家长版</Button>
                </span>
              )}
              style={{ marginBottom: 0 }}
              extra="可选。填写后家长端优先展示这段内容；留空则展示正文。"
            >
              <Input.TextArea value={summary} onChange={(event) => setSummary(event.target.value)} autoSize={{ minRows: 2, maxRows: 4 }} disabled={generating} />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 8 }}>
            <Button size="small" onClick={generate} disabled={generating}>AI 生成草稿</Button>
            <span style={{ fontSize: 12, color: 'var(--color-textTertiary)', marginLeft: 8 }}>重新生成会覆盖正文，先确认</span>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)', marginBottom: 6 }}>实时预览</div>
          <div className="p3-editor-preview">
            {content.trim()
              ? <><h2 style={{ marginTop: 0 }}>{title || '未命名报告'}</h2><MarkdownPreview markdown={content} /></>
              : <div style={{ color: 'var(--color-textTertiary)', fontSize: 12 }}>正文为空。点「AI 生成草稿」或在左侧直接写。</div>}
          </div>
        </div>
      </div>
      {draftId ? null : (
        <div style={{ fontSize: 12, color: 'var(--color-textTertiary)', marginTop: 8 }}>
          提示：直接写正文后点「存草稿 / 发布」也可以，底部会先落一条草稿再保存。
        </div>
      )}
    </Modal>
  )
}

/** 无规划学生的第四段：同一规则自动起草并标「自动建议」，只改报告文本，不写入 growth_plan（05-03）。 */
function withAutoSuggestion(content: string, row: StudentRow, exams: Exam[], name: string): string {
  const weak = weakSubject(row.records, exams) ?? '数学'
  const head = content.includes('## 四、') ? content.slice(0, content.indexOf('## 四、')) : content + '\n\n'
  const review = dayjs(MOCK_TODAY).add(14, 'day').format('YYYY-MM-DD')
  const section = [
    '## 四、下阶段规划',
    '',
    '> 自动建议：' + name + ' 本学期暂无成长规划，以下内容由规则起草，不会写入规划表。',
    '',
    '- 阶段目标：把' + weak + '的得分率稳定到 80% 以上',
    '- 重点科目：' + weak,
    '- 具体行动：每天 10 分钟计算专项；未掌握错题每周复盘一次；家长每周检查一次作业签字',
    '- 复评日：建议两周后（' + review + '）',
    '',
  ].join('\n')
  return head + section
}

/** 家长摘要固定 3 句：成绩亮点 / 薄弱点 / 下阶段目标（05-05），可改。 */
function buildParentSummary(row: StudentRow, plan: GrowthPlan | undefined, exams: Exam[]): string {
  const latest = row.latest
  const bright = latest
    ? '孩子最近一次' + latest.subject + '考试 ' + latest.score + ' 分' +
      (row.delta > 0 ? '，比上次提升 ' + row.delta + ' 分' : row.delta < 0 ? '，比上次下降 ' + Math.abs(row.delta) + ' 分' : '，成绩保持稳定')
    : '孩子近期学习状态平稳'
  const weak = weakSubject(row.records, exams) ?? '基础计算'
  const goal = plan ? plan.goal : '夯实基础、每天做 10 分钟计算专项'
  return bright + '。薄弱环节主要是' + weak + '，建议每天安排 10 分钟专项练习。下阶段目标是' + goal + '，也请家长在周末一起复盘错题。'
}
