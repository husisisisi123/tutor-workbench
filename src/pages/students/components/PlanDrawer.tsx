import { useEffect, useState } from 'react'
import { App, Button, DatePicker, Drawer, Form, Input, Select, Space } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { draftGrowthPlan, listTags, saveGrowthPlan } from '@/mock/api'
import type { GrowthPlan, Student, Subject } from '@/types'
import { useLoad } from '@/hooks/useLoad'
import { SUBJECTS } from '../lib/derive'
import { useIsMobile } from './useIsMobile'

// 「编辑规划」抽屉（#8 05-02 / 05-10）：规划编辑入口只在这里（成长规划看板只读）。
// 数据流：打开时用 api.getGrowthPlan 传进来的 plan 回填；没有规划时先调 api.draftGrowthPlan 让规则引擎
// 起草一份（弱科/知识点/行动都是规则产物），老师改完再 api.saveGrowthPlan 落内存库；
// 保存后报告 Tab 的规划卡刷新，成长规划看板重新挂载时读同一份 db（05-02 同步）。
// 复评日默认「期末前 2 周」由 draftGrowthPlan 给 2026-11-20，这里只允许改、不重算。
export default function PlanDrawer({
  open, student, plan, onClose, onSaved,
}: {
  open: boolean
  student: Student
  plan?: GrowthPlan
  onClose: () => void
  onSaved: () => void
}) {
  const { message, modal } = App.useApp()
  const isMobile = useIsMobile()
  const { data: tags } = useLoad(listTags, [open])
  const [goal, setGoal] = useState('')
  const [focusSubjects, setFocusSubjects] = useState<Subject[]>([])
  const [focusTags, setFocusTags] = useState<string[]>([])
  const [actionsText, setActionsText] = useState('')
  const [reviewAt, setReviewAt] = useState<Dayjs>(dayjs('2026-11-20'))
  const [saving, setSaving] = useState(false)

  // 每次打开都按当前 plan 回填；plan 为空时给一套可直接保存的默认值（与 getWeakSubjects 规则不冲突）。
  useEffect(() => {
    if (!open) return
    setGoal(plan?.goal ?? '稳住基础，逐步提升')
    setFocusSubjects(plan?.focus_subjects ?? ['数学'])
    setFocusTags(plan?.focus_tags ?? [])
    setActionsText((plan?.actions ?? ['每天 10 分钟计算专项', '错题本每周复盘一次']).join('\n'))
    setReviewAt(dayjs(plan?.review_at ?? '2026-11-20'))
    setSaving(false)
  }, [open, plan])

  const tagOptions = (tags ?? [])
    .filter((tag) => tag.level >= 2)
    .filter((tag) => (focusSubjects.length ? focusSubjects.includes(tag.subject) : true))
    .map((tag) => ({ value: tag.id, label: tag.subject + ' · ' + tag.name }))

  const submit = async () => {
    if (!goal.trim()) { message.warning('请填写阶段目标'); return }
    if (!focusSubjects.length) { message.warning('请至少选一科重点科目'); return }
    setSaving(true)
    try {
      // 无规划学生先让规则引擎起草一份基础记录，再叠加老师编辑内容（不凭空构造 id/term）。
      const base: GrowthPlan = plan ?? await draftGrowthPlan(student.id)
      await saveGrowthPlan({
        ...base,
        student_id: student.id,
        goal: goal.trim(),
        focus_subjects: focusSubjects,
        focus_tags: focusTags,
        actions: actionsText.split('\n').map((line) => line.trim()).filter(Boolean),
        review_at: reviewAt.format('YYYY-MM-DD'),
      })
      message.success('规划已保存')
      onSaved()
      onClose()
    } catch {
      modal.error({ title: '保存失败', content: '请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={'编辑规划 · ' + student.name}
      width={isMobile ? '100%' : 460}
      onClose={onClose}
      destroyOnHidden
      footer={(
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={submit}>保存规划</Button>
        </Space>
      )}
    >
      <Form layout="vertical" size="small">
        <Form.Item label="阶段目标（一句）" required>
          <Input.TextArea value={goal} onChange={(event) => setGoal(event.target.value)} autoSize={{ minRows: 2, maxRows: 3 }} maxLength={60} showCount />
        </Form.Item>
        <Form.Item label="重点科目" required>
          <Select<Subject[]>
            mode="multiple"
            value={focusSubjects}
            options={SUBJECTS.map((s) => ({ value: s, label: s }))}
            onChange={(value) => setFocusSubjects(value)}
            placeholder="选择 1–2 科"
          />
        </Form.Item>
        <Form.Item label="重点知识点">
          <Select
            mode="multiple"
            value={focusTags}
            options={tagOptions}
            onChange={(value) => setFocusTags(value)}
            placeholder="从该科知识点里选（可搜索）"
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
          />
        </Form.Item>
        <Form.Item label="具体行动（一行一条）">
          <Input.TextArea value={actionsText} onChange={(event) => setActionsText(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} />
        </Form.Item>
        <Form.Item label="复评日">
          <DatePicker value={reviewAt} onChange={(value) => setReviewAt(value ?? dayjs('2026-11-20'))} allowClear={false} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
