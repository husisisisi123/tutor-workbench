import {
  CheckOutlined, DeleteOutlined, FileImageOutlined, FilePdfOutlined, PlusOutlined,
  RobotOutlined, SendOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import {
  App, Button, Cascader, Checkbox, Divider, Input, InputNumber, Modal, Progress, Radio, Segmented,
  Select, Space, Switch, Tooltip,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/mock/api'
import type { Feedback, MistakeCause, Subject, Tag as KnowledgeTag } from '@/types'
import { tokens } from '@/theme/tokens'
import {
  buildAiBody, buildParentSummary, C, cloneFeedback, dateLabel, doneCount, HOMEWORK_TOTAL,
  makeTemplateHomework, MISTAKE_CAUSE_OPTIONS, REJECT_REASONS, TEMPLATE_LABELS,
  timeLabel,
} from '../helpers'
import type { Student } from '@/types'
import { StatusPill } from './SeatCard'
import StudentAvatar from '@/components/StudentAvatar'

// 附件熔断阈值（#4 决议 12）：localStorage 总量约 5MB，21 人 × 人均 3 张图刚好顶到 4MB；
// 单图 500KB 是「拍照作业」在压缩后的经验上限。两档都在添加时同步校验，超限直接熔断并提示。
const MAX_IMAGE_BYTES = 500 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024

type CascaderOption = { value: string; label: string; children?: CascaderOption[] }

interface FeedbackEditorModalProps {
  open: boolean
  /** edit = 老师填写；review = 审核浮层（可直接改后通过，02-22） */
  mode: 'edit' | 'review'
  student: Student
  /** 打开瞬间的快照：页面之后因自动保存刷新列表也不会回灌，避免覆盖正在输入的内容 */
  initial: Feedback
  isMobile: boolean
  onClose: () => void
  /** 保存 / 提交 / 审核后通知页面刷新卡片墙（useAppStore().bumpRefresh()） */
  onSaved: () => void
}

/** 弹窗内小标题：左栏分组的统一写法，避免每段手写 margin。 */
function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>{title}</div>
        {extra}
      </div>
      {children}
    </div>
  )
}

/**
 * 反馈单编辑双栏弹窗（#4 决议 1/14）。
 * 怎么运行：
 * 1) 打开时把 feedback 深拷贝成 draft，之后所有输入只改 draft；
 * 2) draft 变化 600ms 后自动 api.saveFeedback（草稿不校验，02-13），保存成功回写 updated_at 并 bumpRefresh，
 *    卡片墙由此实时刷新完成度与角标；
 * 3) 「提交审核」先跑三项 + 分数校验（02-14），通过后 saveFeedback → submitFeedback，按钮转「待审核」禁用（02-15）；
 * 4) 审核模式（mode=review）不显示填写底栏，改为「退回（预置原因 + 自定义）/ 通过发布」，编辑内容先保存再通过，
 *    满足 02-22「审核浮层可直接改后通过」；已发布单在编辑模式给「撤回重审」（published→pending_review）。
 */
export default function FeedbackEditorModal(props: FeedbackEditorModalProps) {
  const { open, mode, student, initial, isMobile, onClose, onSaved } = props
  const { message, modal } = App.useApp()
  const [draft, setDraft] = useState<Feedback>(() => cloneFeedback(initial))
  const [hasMistake, setHasMistake] = useState(Boolean(initial.mistake_analysis))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | undefined>(initial.updated_at)
  const [aiMode, setAiMode] = useState<'manual' | 'ai'>('manual')
  const [aiDraft, setAiDraft] = useState('')
  const [aiVariant, setAiVariant] = useState(0)
  const [parentSummary, setParentSummary] = useState('')
  const [labelEditing, setLabelEditing] = useState(false)
  const [banked, setBanked] = useState(false)
  const [bankSaving, setBankSaving] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const [bankSubject, setBankSubject] = useState('数学')
  const [bankTags, setBankTags] = useState<string[]>([])
  const [bankCause, setBankCause] = useState('concept')
  const [tags, setTags] = useState<KnowledgeTag[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [rejectCustom, setRejectCustom] = useState('')

  const sessionRef = useRef('')
  const lastSavedRef = useRef('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  // 每次「打开」或换学生才重置 draft：用 feedback.id + updated_at 做会话键。
  // 为什么不用 lead 的 feedback 对象直接同步：自动保存会刷新页面数据，若实时回灌会把用户正在输入的字覆盖掉。
  useEffect(() => {
    if (!open) {
      sessionRef.current = ''
      return
    }
    const key = initial.id + ':' + initial.updated_at
    if (sessionRef.current === key) return
    sessionRef.current = key
    const cloned = cloneFeedback(initial)
    setDraft(cloned)
    setHasMistake(Boolean(cloned.mistake_analysis))
    setErrors({})
    setSavedAt(cloned.updated_at)
    setAiMode('manual')
    setAiDraft('')
    setParentSummary('')
    setLabelEditing(false)
    setBanked(false)
    setPreviewUrls({})
    lastSavedRef.current = JSON.stringify({ ...cloned, updated_at: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  // 知识点树只在「入错题本」补全层用到，打开弹窗时按需拉一次（132 条，体积小）。
  useEffect(() => {
    if (!open) return
    void api.listTags().then(setTags)
  }, [open])

  const patch = (partial: Partial<Feedback>) => {
    setDraft((prev) => {
      const next = { ...prev, ...partial }
      // 完成度随勾选即时重算，保证卡片、弹窗、家长预览三处同源（#4：完成度 = 勾选数 / 9）
      next.completion = next.leave ? 0 : doneCount(next) / HOMEWORK_TOTAL
      return next
    })
  }

  // ---------- 自动存草稿（02-13） ----------
  useEffect(() => {
    if (!open) return
    const signature = JSON.stringify({ ...draft, updated_at: undefined })
    if (signature === lastSavedRef.current) return
    const timer = window.setTimeout(() => {
      setSaving(true)
      void api.saveFeedback(draft).then((saved) => {
        lastSavedRef.current = JSON.stringify({ ...saved, updated_at: undefined })
        // 只回写服务端重算的完成度与时间戳，避免把输入中的正文顶掉
        setDraft((prev) => ({ ...prev, completion: saved.completion, updated_at: saved.updated_at }))
        setSavedAt(saved.updated_at)
        onSaved()
      }).finally(() => setSaving(false))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [draft, open, onSaved])

  const done = doneCount(draft)
  const errorText = (key: string) =>
    errors[key] ? <div style={{ fontSize: 12, color: C.errorText, marginTop: 4 }}>{errors[key]}</div> : null

  // ---------- 提交校验：完成度 / 正文 / 分数 / 错题错因（02-14 + 票 #4 三项口径） ----------
  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (draft.leave) {
      if (!draft.comment.trim()) next.comment = '请假也要填写一句说明，家长端需要看到'
    } else {
      if (done === 0) next.homework = '完成度必填：请至少勾选一项作业'
      if (!draft.comment.trim()) next.comment = '反馈正文不能为空（家长端只看这段）'
      if (draft.score === undefined || draft.score === null) next.score = '请填写本次分数'
      if (hasMistake && !(draft.mistake_analysis ?? '').trim()) next.mistake = '标了错题必须填写错因'
    }
    setErrors(next)
    const count = Object.keys(next).length
    if (count > 0) message.error('提交前还有 ' + count + ' 项未通过校验，见红字提示')
    return count === 0
  }

  const saveNow = async (): Promise<Feedback | null> => {
    setSaving(true)
    try {
      const saved = await api.saveFeedback(draft)
      lastSavedRef.current = JSON.stringify({ ...saved, updated_at: undefined })
      setDraft((prev) => ({ ...prev, completion: saved.completion, updated_at: saved.updated_at, status: saved.status }))
      setSavedAt(saved.updated_at)
      onSaved()
      return saved
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!validate()) return
    const saved = await saveNow()
    if (!saved) return
    const submitted = await api.submitFeedback(saved.id)
    const nextDraft = { ...draft, status: submitted.status, updated_at: submitted.updated_at }
    setDraft(nextDraft)
    // 同步「最后已保存」签名：状态变化本身不需要再触发一次自动保存
    lastSavedRef.current = JSON.stringify({ ...nextDraft, updated_at: undefined })
    message.success('已提交审核，顶栏「待审核」+1')
    onSaved()
  }

  const handleApprove = async () => {
    const saved = await saveNow()
    if (!saved) return
    const ok = await api.approveFeedback(saved.id)
    message.success(ok.student_id === student.id ? '已通过，家长端可见' : '已通过')
    onSaved()
    onClose()
  }

  const handleReject = async () => {
    const reason = rejectReason === '__custom__' ? rejectCustom.trim() : rejectReason
    if (!reason) {
      message.error('请选择或填写退回原因')
      return
    }
    setSaving(true)
    try {
      await api.saveFeedback(draft)
      await api.rejectFeedback(draft.id, reason)
      message.warning('已退回：' + reason + '（状态回到草稿，卡片显示「已退回」）')
      setRejectOpen(false)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleWithdraw = async () => {
    setSaving(true)
    try {
      const next = await api.withdrawFeedback(draft.id)
      setDraft((prev) => ({ ...prev, status: next.status }))
      message.success('已撤回，重新进入待审核队列')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // ---------- 请假整单替换（#4 决议 9）：切到请假清空清单与分数，切回按模板重建 ----------
  const toggleLeave = (next: boolean) => {
    if (next) {
      patch({
        leave: true,
        homework_items: [],
        completion: 0,
        score: undefined,
        subject_details: [],
        mistake_analysis: undefined,
        attachments: [],
        comment: draft.comment.trim() || '今日请假，作业已由家长带回，返校后补交。',
        leave_reason: draft.leave_reason || '家长已请假',
      })
      setHasMistake(false)
    } else {
      patch({
        leave: false,
        leave_reason: undefined,
        homework_items: makeTemplateHomework(),
        score: draft.score ?? 80,
      })
    }
  }

  const toggleItem = (index: number, checkedValue: boolean) => {
    const items = draft.homework_items.map((item, i) => (i === index ? { ...item, done: checkedValue } : item))
    patch({ homework_items: items })
  }

  const editItem = (index: number, partial: { label?: string; book?: string; page?: string }) => {
    const items = draft.homework_items.map((item, i) => (i === index ? { ...item, ...partial } : item))
    patch({ homework_items: items })
  }

  // 全班模板：只重置文案与第 8 项书名页码占位，保留本学生的勾选状态（个别覆盖的还原入口）
  const applyTemplate = () => {
    const items = draft.homework_items.length
      ? draft.homework_items.map((item, i) => ({ ...item, label: TEMPLATE_LABELS[i] ?? item.label, book: i === 7 ? item.book ?? '《小王子》' : undefined, page: i === 7 ? item.page ?? '第 12 页' : undefined }))
      : makeTemplateHomework()
    patch({ homework_items: items })
    message.success('已套用全班模板（勾选状态保留）')
  }

  // ---------- AI 分段（#4 决议 10）：AI 草稿只存在 aiDraft，采用前不落盘 ----------
  const generateAi = (delta: number) => {
    const variant = aiVariant + delta
    setAiVariant(variant)
    setAiDraft(buildAiBody(draft, student.name, variant))
  }
  const adoptAi = () => {
    if (!aiDraft.trim()) return
    patch({ comment: aiDraft, ai_segments: ['comment'] })
    setAiMode('manual')
    message.success('已采用 AI 草稿，可继续手动修改')
  }

  // ---------- 附件：假上传 + 单图 ≤500KB / 总量 4MB 熔断（02-17） ----------
  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const existing = draft.attachments ?? []
    let total = existing.reduce((sum, item) => sum + (item.size ?? 0), 0)
    const accepted: Array<{ name: string; size?: number }> = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMAGE_BYTES) {
        message.error(file.name + ' 超过单图 500KB，已跳过')
        continue
      }
      total += file.size
      if (total > MAX_TOTAL_BYTES) {
        message.error('附件总量已超过 4MB 熔断线，停止添加')
        break
      }
      accepted.push({ name: file.name, size: file.size })
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file)
        setPreviewUrls((prev) => ({ ...prev, [file.name]: url }))
      }
    }
    if (accepted.length > 0) {
      patch({ attachments: [...existing, ...accepted] })
      message.success('已添加 ' + accepted.length + ' 个附件（本地示意，不写入 mock 存储）')
    }
  }

  const removeAttachment = (name: string) => {
    const count = (draft.attachments ?? []).length
    // 删除保护（02-18）：已填数据的栏目二次确认，文案带条数
    modal.confirm({
      title: '删除附件',
      content: '该栏已有 ' + count + ' 条数据，删除后不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => patch({ attachments: (draft.attachments ?? []).filter((item) => item.name !== name) }),
    })
  }

  const bankedLayer = useMemo(() => {
    const children = new Map<string, KnowledgeTag[]>()
    for (const tag of tags) {
      if (!tag.parent_id) continue
      const list = children.get(tag.parent_id) ?? []
      list.push(tag)
      children.set(tag.parent_id, list)
    }
    const toOption = (tag: KnowledgeTag): CascaderOption => ({
      value: tag.id,
      label: tag.name,
      children: (children.get(tag.id) ?? []).map(toOption),
    })
    const roots = tags.filter((tag) => tag.level === 1).map(toOption)
    // mock 种子里语文 / 英语 / 科学的根节点缺失（模块的 parent_id 指向不存在的根），
    // 直接按 level=1 取会只剩「数学」；这里按 subject 把孤儿模块补成根节点，
    // 保证「科目 → 模块 → 节」级联完整。修 seed 后这段会自动跳过（已有同名根）。
    for (const subject of ['数学', '语文', '英语', '科学']) {
      if (roots.some((root) => root.label === subject)) continue
      const modules = tags.filter((tag) => tag.subject === subject && tag.level === 2).map(toOption)
      if (modules.length > 0) roots.push({ value: 'subject-' + subject, label: subject, children: modules })
    }
    return roots
  }, [tags])

  // 「入错题本」真入库（#4 修订 / #7 联动）：先建题目，再建「某生 × 某题」关联。
  // 为什么分两步：mock 是 mistake + mistake_student 两张表，错因与掌握属于学生而不属于题目；
  // 自动带入学生 / 日期 / 来源（作业），题目描述直接取反馈单里的错题分析文本；
  // 写库后调 onSaved() 让错题库 / 学生档案重新拉数；刷新仍回种子（04-08 口径）。
  const confirmBank = async () => {
    if (bankTags.length === 0) {
      message.error('请选择知识点（科目 / 模块 / 节）再入库')
      return
    }
    setBankSaving(true)
    try {
      const tagId = bankTags[bankTags.length - 1]
      const mistake = await api.createMistake({
        subject: bankSubject as Subject,
        question_text: draft.mistake_analysis?.trim() || '每日反馈单错题（' + dateLabel(draft.date) + '）',
        answer: '待补全',
        analysis: draft.mistake_analysis,
        question_type: '解答',
        difficulty: 2,
        tag_ids: [tagId],
        source: 'homework',
      })
      await api.createMistakeStudent({
        mistake_id: mistake.id,
        student_id: student.id,
        cause: bankCause as MistakeCause,
        mastery: 'unmastered',
        source_date: draft.date,
        source_type: 'homework',
        note: '来自 ' + draft.date + ' 每日反馈单',
      })
      setBanked(true)
      setBankOpen(false)
      onSaved()
      message.success('已加入错题库并关联本学生（刷新回种子）')
    } catch (error) {
      message.error('入库失败：' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setBankSaving(false)
    }
  }

  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span>{mode === 'review' ? '审核反馈' : '反馈编辑'} · {student.name}</span>
      <StatusPill fb={draft} maxWidth={180} />
      <span style={{ fontSize: 12, fontWeight: 400, color: C.textTertiary }}>
        {student.grade} · {dateLabel(draft.date)}
      </span>
    </div>
  )

  const leftPane = (
    <>
      {mode === 'review' ? (
        <div style={{ marginBottom: 12, padding: '8px 10px', background: C.warningBg, borderRadius: tokens.radius.base, fontSize: 12, color: C.warningText }}>
          待审核 · 提交于 {timeLabel(draft.updated_at)}。可在左侧直接改，确认无误后「通过发布」；不符要求「退回」并写原因（#5）。
        </div>
      ) : null}

      <Section
        title="状态"
        extra={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textSecondary }}>
            <Switch size="small" checked={draft.leave} onChange={toggleLeave} />
            请假（整单替换）
          </span>
        }
      >
        {draft.leave ? (
          <div style={{ padding: 10, background: C.bgHover, borderRadius: tokens.radius.base, borderStyle: 'dashed', borderWidth: 1, borderColor: C.borderStrong }}>
            <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 6 }}>请假单不保留作业清单与分数，家长端只显示请假说明。</div>
            <Input
              size="small"
              value={draft.leave_reason}
              placeholder="请假原因（卡片琥珀标签显示）"
              onChange={(e) => patch({ leave_reason: e.target.value })}
            />
            {errorText('comment')}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill fb={draft} maxWidth={180} />
            <span style={{ fontSize: 12, color: C.textTertiary }}>
              {draft.status === 'published'
                ? '已发布：家长端可见，修改保存后会同步'
                : draft.status === 'pending_review'
                  ? '待审核：审核通过后家长可见，当前家长端不可见'
                  : draft.reject_reason
                    ? '已退回：按原因修改后重新提交审核'
                    : '草稿：只有老师端可见，家长端不可见'}
            </span>
          </div>
        )}
      </Section>

      {!draft.leave ? (
        <>
          <Section
            title={'作业清单 · 完成度 ' + done + '/' + HOMEWORK_TOTAL}
            extra={
              <Space size={4}>
                <Button size="small" type="link" onClick={applyTemplate}>套用全班模板</Button>
                <Button size="small" type="link" onClick={() => setLabelEditing((v) => !v)}>
                  {labelEditing ? '完成个别覆盖' : '个别覆盖'}
                </Button>
              </Space>
            }
          >
            <Progress
              percent={Math.round((done / HOMEWORK_TOTAL) * 100)}
              size="small"
              showInfo={false}
              strokeColor={C.primary}
              style={{ marginBottom: 4 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {draft.homework_items.map((item, index) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Checkbox checked={item.done} onChange={(e) => toggleItem(index, e.target.checked)} aria-label={item.label} />
                  <span style={{ fontSize: 12, color: C.textTertiary, width: 12 }}>{index + 1}</span>
                  {labelEditing ? (
                    <Input size="small" value={item.label} onChange={(e) => editItem(index, { label: e.target.value })} />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13, color: item.done ? C.text : C.textSecondary }}>{item.label}</span>
                  )}
                  {index === 7 ? (
                    // 第 8 项书名/页码逐生可改（#4 决议：Excel 里每个学生不一样）
                    <Space size={4}>
                      <Input size="small" style={{ width: 92 }} value={item.book} placeholder="书名" onChange={(e) => editItem(index, { book: e.target.value })} />
                      <Input size="small" style={{ width: 66 }} value={item.page} placeholder="页码" onChange={(e) => editItem(index, { page: e.target.value })} />
                    </Space>
                  ) : null}
                </div>
              ))}
            </div>
            {errorText('homework')}
            <div style={{ fontSize: 11, color: C.textQuaternary, marginTop: 4 }}>
              完成度 = 勾选数 / 9；个别覆盖只改本学生的栏目文案，不影响其他学生。
            </div>
          </Section>

          <Section title="分数">
            <Space>
              <InputNumber
                value={draft.score}
                min={0}
                max={draft.score_full ?? 100}
                onChange={(value) => patch({ score: value === null ? undefined : Number(value) })}
                placeholder="本次分数"
                style={{ width: 120 }}
              />
              <span style={{ fontSize: 12, color: C.textSecondary }}>/ {draft.score_full ?? 100}</span>
              <span style={{ fontSize: 12, color: C.textTertiary }}>提交校验要求非空；草稿不校验</span>
            </Space>
            {errorText('score')}
          </Section>

          <Section
            title="错题"
            extra={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textSecondary }}>
                <Switch size="small" checked={hasMistake} onChange={(v) => { setHasMistake(v); if (!v) patch({ mistake_analysis: undefined }) }} />
                本次有错题
              </span>
            }
          >
            {hasMistake ? (
              <>
                <Input.TextArea
                  value={draft.mistake_analysis}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  placeholder="错因概述，如「列式计算错 3，应用题效率问题错 3 分」"
                  onChange={(e) => patch({ mistake_analysis: e.target.value })}
                />
                {errorText('mistake')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Button size="small" type="dashed" icon={<PlusOutlined />} disabled={banked} onClick={() => setBankOpen(true)}>
                    {banked ? '已入库' : '入错题本'}
                  </Button>
                  <span style={{ fontSize: 11, color: C.textQuaternary }}>
                    入库时补全科目 / 知识点 / 错因（#7 联动），写入 mock 错题库并关联本学生
                  </span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.textTertiary }}>没有错题时无需填写错因；提交校验只在勾选「有错题」后才要求。</div>
            )}
          </Section>

          <Section title={'附件（' + (draft.attachments?.length ?? 0) + '）'}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(draft.attachments ?? []).map((file) => {
                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(file.name)
                return (
                  <div key={file.name} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', border: '1px solid ' + C.border, borderRadius: tokens.radius.base, background: C.bgContainer }}>
                    {isImage && previewUrls[file.name] ? (
                      <img src={previewUrls[file.name]} alt={file.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 2 }} />
                    ) : isImage ? (
                      <FileImageOutlined style={{ color: C.icon }} />
                    ) : (
                      <FilePdfOutlined style={{ color: C.icon }} />
                    )}
                    <Tooltip title={file.name}>
                      <span style={{ fontSize: 12, color: C.textSecondary, maxWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                    </Tooltip>
                    <Button size="small" type="text" aria-label={'删除附件 ' + file.name} icon={<DeleteOutlined />} onClick={() => removeAttachment(file.name)} />
                  </div>
                )
              })}
              <Button size="small" icon={<PlusOutlined />} onClick={() => fileRef.current?.click()}>
                添加图片 / PDF
              </Button>
            </div>
            <div style={{ fontSize: 11, color: C.textQuaternary, marginTop: 4 }}>单图 ≤500KB、总量 ≤4MB；图片可点缩略图预览（示意数据不落库）。</div>
          </Section>
        </>
      ) : null}
    </>
  )

  const rightPane = (
    <>
      <Section
        title="反馈方式"
        extra={<Segmented size="small" value={aiMode} onChange={(v) => setAiMode(v as 'manual' | 'ai')} options={[{ label: '手动反馈', value: 'manual' }, { label: 'AI 反馈', value: 'ai' }]} />}
      >
        {aiMode === 'manual' ? (
          <>
            <Input.TextArea
              value={draft.comment}
              autoSize={{ minRows: 6, maxRows: 10 }}
              placeholder="写给家长的反馈正文：分数、错题分析、各科作业明细"
              onChange={(e) => patch({ comment: e.target.value })}
            />
            {errorText('comment')}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button size="small" type="primary" ghost icon={<ThunderboltOutlined />} onClick={() => generateAi(0)}>
                {aiDraft ? '重新生成' : 'AI 生成正文草稿'}
              </Button>
              <span style={{ fontSize: 11, color: C.textQuaternary }}>草稿需点「采用」才写入正文（未确认不落盘）</span>
            </div>
            {aiDraft ? (
              <>
                <Input.TextArea
                  value={aiDraft}
                  autoSize={{ minRows: 6, maxRows: 10 }}
                  onChange={(e) => setAiDraft(e.target.value)}
                  style={{ background: C.primaryBg, borderColor: C.primaryBg }}
                />
                <Space>
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={adoptAi}>采用到正文</Button>
                  <Button size="small" onClick={() => generateAi(1)}>换一版</Button>
                </Space>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.textTertiary, padding: 10, background: C.bgContainer, border: '1px dashed ' + C.borderStrong, borderRadius: tokens.radius.base }}>
                点击上方按钮，AI 会按今日清单完成度、分数与错题分析生成一段可编辑草稿。
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        title="AI 家长版摘要"
        extra={
          <Button size="small" icon={<RobotOutlined />} onClick={() => setParentSummary(buildParentSummary(draft, student.name, aiVariant))}>
            生成家长版
          </Button>
        }
      >
        {parentSummary ? (
          <div style={{ padding: '8px 10px', background: C.primaryBg, borderRadius: tokens.radius.base, fontSize: 12, lineHeight: 1.6, color: C.primaryTextHover }}>
            {parentSummary}
            <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 4 }}>摘要仅用于预览，不写入反馈单（mock 无对应字段，已列入交付待办）</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.textTertiary }}>生成 3 句家长可读的摘要，配合「家长端预览」检查表述。</div>
        )}
      </Section>

      <Section title="家长端预览（发布后家长可见）">
        <div style={{ background: C.bgContainer, border: '1px solid ' + C.border, borderRadius: tokens.radius.lg, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StudentAvatar student={student} size={28} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{student.name} · {student.grade}</div>
              <div style={{ fontSize: 11, color: C.textTertiary }}>{dateLabel(draft.date)} · 王老师</div>
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          {draft.leave ? (
            <div style={{ fontSize: 13, color: C.warningText }}>【请假】{draft.leave_reason || '今日请假'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 8 }}>
                {draft.homework_items.map((item, index) => (
                  <span key={item.id} style={{ fontSize: 12, color: item.done ? C.text : C.textTertiary }}>
                    <CheckOutlined style={{ color: item.done ? C.successText : C.textQuaternary, marginRight: 2 }} />
                    {item.label}{index === 7 && item.book ? '（' + item.book + (item.page ? ' ' + item.page : '') + '）' : ''}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: C.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {draft.comment || '（正文为空，家长端不可见）'}
              </div>
              <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 6 }}>本次分数：{draft.score ?? '—'} / {draft.score_full ?? 100}</div>
              {draft.mistake_analysis ? <div style={{ fontSize: 12, color: C.errorText, marginTop: 4 }}>错题：{draft.mistake_analysis}</div> : null}
            </>
          )}
          <div style={{ marginTop: 8, fontSize: 11, color: C.textQuaternary, borderTop: '1px solid ' + C.borderSecondary, paddingTop: 6 }}>
            状态：{draft.status === 'published' ? '已发布' : '发布后家长可见'}（草稿 / 待审核 / 已退回不展示给家长）
          </div>
        </div>
      </Section>
    </>
  )

  const footerExtra = (
    <span style={{ fontSize: 12, color: C.textTertiary }}>
      {saving ? '自动保存中…' : savedAt ? '已自动保存 ' + timeLabel(savedAt) : '修改后自动存草稿'}
    </span>
  )

  const actionButtons = mode === 'review' ? (
    <>
      <Button onClick={onClose}>关闭</Button>
      <Button danger icon={<DeleteOutlined />} onClick={() => setRejectOpen(true)}>退回</Button>
      <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={handleApprove}>通过发布</Button>
    </>
  ) : draft.status === 'published' ? (
    <>
      <Button onClick={onClose}>关闭</Button>
      <Button onClick={handleWithdraw} loading={saving}>撤回重审</Button>
    </>
  ) : draft.status === 'pending_review' ? (
    <>
      <Button onClick={onClose}>关闭</Button>
      <Button type="primary" disabled>待审核（已提交）</Button>
    </>
  ) : (
    <>
      <Button onClick={onClose}>取消</Button>
      <Button onClick={() => void saveNow().then(() => message.success('已存草稿'))} loading={saving}>存草稿</Button>
      <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit} loading={saving}>提交审核</Button>
    </>
  )

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={isMobile ? '100%' : 1040}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: 24 }}
      styles={{ body: { padding: 0 } }}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          {footerExtra}
          <Space wrap>{actionButtons}</Space>
        </div>
      }
      maskClosable={false}
      destroyOnHidden
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          height: isMobile ? 'calc(100vh - 160px)' : '66vh',
          minHeight: 380,
          overflowY: isMobile ? 'auto' : 'hidden',
          background: C.bgContainer,
        }}
      >
        <div
          className={isMobile ? undefined : 'fb-pane'}
          style={{
            flex: isMobile ? undefined : '1 1 55%',
            padding: 16,
            borderRight: isMobile ? undefined : '1px solid ' + C.border,
            borderBottom: isMobile ? '1px solid ' + C.border : undefined,
          }}
        >
          {leftPane}
        </div>
        <div
          className={isMobile ? undefined : 'fb-pane'}
          style={{ flex: isMobile ? undefined : '1 1 45%', padding: 16, background: C.bgLayout }}
        >
          {rightPane}
        </div>
      </div>

      {/* 退回原因（#5：预置 3 条快捷 + 自定义） */}
      <Modal
        open={rejectOpen}
        title="退回反馈"
        okText="确认退回"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: saving }}
        onOk={handleReject}
        onCancel={() => setRejectOpen(false)}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: C.textSecondary }}>退回后状态回到「草稿」并带上原因，卡片显示琥珀「已退回 · 原因」（#5 四态口径）。</div>
          <Radio.Group value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {REJECT_REASONS.map((reason) => (
              <Radio key={reason} value={reason}>{reason}</Radio>
            ))}
            <Radio value="__custom__">自定义原因</Radio>
          </Radio.Group>
          {rejectReason === '__custom__' ? (
            <Input.TextArea value={rejectCustom} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="写清楚要补什么" onChange={(e) => setRejectCustom(e.target.value)} />
          ) : null}
        </div>
      </Modal>

      {/* 入错题本补全层（#4 修订 / #7 联动）：本地示意标记，缺 createMistake 接口 */}
      <Modal
        open={bankOpen}
        title="加入错题库"
        okText="确认入库"
        cancelText="取消"
        confirmLoading={bankSaving}
        onOk={confirmBank}
        onCancel={() => setBankOpen(false)}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textSecondary, width: 56 }}>科目</span>
            <Select
              size="small"
              value={bankSubject}
              onChange={setBankSubject}
              style={{ width: 140 }}
              options={['数学', '语文', '英语', '科学'].map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textSecondary, width: 56 }}>知识点</span>
            <Cascader
              size="small"
              options={bankedLayer}
              value={bankTags}
              onChange={(value) => setBankTags((value as string[] | undefined) ?? [])}
              placeholder="科目 / 模块 / 节"
              style={{ width: 280 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textSecondary, width: 56, paddingTop: 4 }}>错因</span>
            <Radio.Group value={bankCause} onChange={(e) => setBankCause(e.target.value)}>
              <Space direction="vertical" size={4}>
                {MISTAKE_CAUSE_OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value}>{option.label}</Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
          <div style={{ fontSize: 11, color: C.textQuaternary }}>题目描述取本单错题分析，自动带入学生 / 日期 / 来源（作业）；入库后写 mock 错题库 + 学生关联，刷新回种子（04-08）。</div>
        </div>
      </Modal>
    </Modal>
  )
}
