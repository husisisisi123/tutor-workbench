// 规划起草/编辑抽屉（#8 05-02 / 05-03）。
// 为什么成长规划看板只对「无规划」行开放这个入口：05-10 定案「规划编辑入口归口详情页学习报告 Tab，
// 看板只读」；但无规划学生需要一个「起草规划」的动作（任务书 + #8 07-A2 空态），
// 所以这里只承担「把 api.draftGrowthPlan 的草稿改成正式规划并保存」，已规划行的修改仍走详情页。
// 运行逻辑：api.draftGrowthPlan(studentId) 返回四段草稿（目标/重点科目+知识点/行动/复评日）→
// 本抽屉把四段拆成可编辑控件 →「保存规划」调 api.saveGrowthPlan 写内存 → onSaved 让看板重拉，
// 行状态从「无规划」变「已规划」；刷新后回种子（#8 持久化口径）。
import { App as AntApp, Button, DatePicker, Drawer, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import type { GrowthPlan, Student, Subject, Tag as KnowledgeTag } from '@/types'
import * as api from '@/mock/api'
import { SUBJECT_ORDER } from './constants'
import { useIsMobile } from './useIsMobile'

interface Props {
  open: boolean
  student?: Student
  plan?: GrowthPlan
  tags: KnowledgeTag[]
  onClose: () => void
  onSaved: () => void
}

const fieldStyle: React.CSSProperties = { marginBottom: 14 }
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-textSecondary)', marginBottom: 6 }

export default function PlanDrawer({ open, student, plan, tags, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp()
  const isMobile = useIsMobile()
  const [saving, setSaving] = useState(false)
  const [goal, setGoal] = useState('')
  const [focusSubjects, setFocusSubjects] = useState<Subject[]>([])
  const [focusTags, setFocusTags] = useState<string[]>([])
  const [actions, setActions] = useState('')
  const [reviewAt, setReviewAt] = useState('')

  // 草稿每次打开重新灌入：同一抽屉会被不同学生复用，残留上一位学生的目标会写错人。
  useEffect(() => {
    if (!open || !plan) return
    setGoal(plan.goal)
    setFocusSubjects(plan.focus_subjects)
    setFocusTags(plan.focus_tags)
    setActions(plan.actions.join('\n'))
    setReviewAt(plan.review_at)
  }, [open, plan])

  // 知识点按科目分组，避免在 132 条平铺选项里找不到（04/05 两页共用同一棵树）。
  const tagOptions = SUBJECT_ORDER.map((subject) => ({
    label: subject,
    options: tags.filter((t) => t.subject === subject).map((t) => ({ value: t.id, label: t.name })),
  }))

  async function save() {
    if (!plan || !student) return
    if (!goal.trim()) {
      message.error('阶段目标不能为空')
      return
    }
    if (!reviewAt) {
      message.error('请选择复评日')
      return
    }
    setSaving(true)
    try {
      await api.saveGrowthPlan({
        ...plan,
        goal: goal.trim(),
        focus_subjects: focusSubjects,
        focus_tags: focusTags,
        actions: actions.split('\n').map((s) => s.trim()).filter(Boolean),
        review_at: reviewAt,
      })
      message.success('规划已保存，看板与详情页同步（演示：刷新回种子）')
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
      title={student ? '起草规划 · ' + student.name : '起草规划'}
      destroyOnHidden
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={save}>保存规划</Button>
        </div>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--color-textTertiary)', marginBottom: 14, lineHeight: 1.6 }}>
        四段已按规则自动起草（弱科 = 最近 3 次得分率最低；复评日默认期末前 2 周），可逐项修改后保存。
        保存只写内存 mock，刷新回种子。
      </div>

      <div style={fieldStyle}>
        <div style={labelStyle}>阶段目标</div>
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="如：期末数学进入班级前 1/3" />
      </div>

      <div style={fieldStyle}>
        <div style={labelStyle}>重点科目</div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={focusSubjects}
          options={SUBJECT_ORDER.map((s) => ({ value: s, label: s }))}
          onChange={(v: Subject[]) => setFocusSubjects(v)}
          placeholder="选择弱科"
        />
      </div>

      <div style={fieldStyle}>
        <div style={labelStyle}>重点知识点</div>
        <Select
          mode="multiple"
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          value={focusTags}
          options={tagOptions}
          onChange={(v: string[]) => setFocusTags(v)}
          placeholder="未掌握 + 复习中 TOP3"
        />
      </div>

      <div style={fieldStyle}>
        <div style={labelStyle}>具体行动（每行一条）</div>
        <Input.TextArea rows={4} value={actions} onChange={(e) => setActions(e.target.value)} placeholder="本周重做 5 道未掌握错题" />
      </div>

      <div style={fieldStyle}>
        <div style={labelStyle}>复评日（默认期末前 2 周）</div>
        <DatePicker
          style={{ width: '100%' }}
          value={reviewAt ? dayjs(reviewAt) : null}
          format="YYYY-MM-DD"
          onChange={(d) => setReviewAt(d ? d.format('YYYY-MM-DD') : '')}
        />
      </div>
    </Drawer>
  )
}
