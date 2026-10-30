import { useMemo, useState } from 'react'
import { App, Button, Empty, Modal, Segmented, Tag } from 'antd'
import {
  CheckCircleOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, RollbackOutlined,
} from '@ant-design/icons'
import EmptyState from '@/components/EmptyState'
import { useLoad } from '@/hooks/useLoad'
import { deleteReport, getGrowthPlan, listReports, listTags, withdrawReport } from '@/mock/api'
import type { Exam, LearningReport, Student } from '@/types'
import type { StudentRow } from '../lib/data'
import { formatDate } from '../lib/derive'
import MarkdownPreview from './MarkdownPreview'
import PlanDrawer from './PlanDrawer'
import ReportEditorModal from './ReportEditorModal'

// 学习报告 Tab（#8 05-02~05-10 / PRD §三）：顶部当前期规划卡 → + 新建报告 → 报告列表。
// 为什么规划卡放在报告 Tab 顶部：#8 05-10 定案「规划编辑入口归口在这里」，成长规划看板只读。
// 报告状态只有 draft / published 两态：草稿可删、已发布不可删只能撤回（05-06），
// 撤回用 api.withdrawReport（发布态→草稿、清 published_at），列表与徽标随之刷新。
type ReportFilter = 'all' | 'draft' | 'published'

export default function ReportsTab({
  student, row, exams,
}: {
  student: Student
  row: StudentRow
  exams: Exam[]
}) {
  const { message, modal } = App.useApp()
  const { data: plan, reload: reloadPlan } = useLoad(() => getGrowthPlan(student.id), [student.id])
  const { data: reports, loading, reload: reloadReports } = useLoad(() => listReports(student.id), [student.id])
  const { data: tags } = useLoad(listTags, [])
  const [filter, setFilter] = useState<ReportFilter>('all')
  const [planOpen, setPlanOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<LearningReport | null>(null)
  const [preview, setPreview] = useState<LearningReport | null>(null)

  const tagName = (id: string) => (tags ?? []).find((tag) => tag.id === id)?.name ?? id
  const sorted = useMemo(
    () => [...(reports ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [reports],
  )
  const filtered = sorted.filter((report) => (filter === 'all' ? true : report.status === filter))
  const draftCount = sorted.filter((report) => report.status === 'draft').length
  const publishedCount = sorted.filter((report) => report.status === 'published').length

  const openNew = () => { setEditing(null); setEditorOpen(true) }
  const openEdit = (report: LearningReport) => { setEditing(report); setEditorOpen(true) }

  const removeDraft = (report: LearningReport) => {
    modal.confirm({
      title: '删除草稿？',
      content: '「' + report.title + '」将被删除，且不可恢复（已发布报告不能删除，只能撤回）。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteReport(report.id)
        message.success('草稿已删除')
        reloadReports()
      },
    })
  }

  const withdraw = (report: LearningReport) => {
    modal.confirm({
      title: '撤回报告？',
      content: '撤回后回到草稿状态，家长端立即下架（家长预览不可见），可再次发布。',
      okText: '撤回',
      cancelText: '取消',
      onOk: async () => {
        await withdrawReport(report.id)
        message.success('已撤回，家长端已下架')
        reloadReports()
      },
    })
  }

  return (
    <div>
      {/* 顶部：当前期规划卡（四段：目标 / 重点科目与知识点 / 行动 / 复评日） */}
      <div className="section-card" style={{ padding: 14, marginBottom: 14, boxShadow: 'none', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>当前期成长规划</span>
            <Tag style={{ marginInlineEnd: 0 }}>{plan?.term ?? '本学期'}</Tag>
          </div>
          <Button size="small" onClick={() => setPlanOpen(true)}>{plan ? '编辑规划' : '起草规划'}</Button>
        </div>
        {plan ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-textTertiary)', marginRight: 8 }}>阶段目标</span>{plan.goal}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-textTertiary)', marginRight: 8 }}>重点科目</span>
              {plan.focus_subjects.map((subject) => <Tag key={subject} style={{ marginInlineEnd: 4 }}>{subject}</Tag>)}
              {plan.focus_tags.length ? (
                <span style={{ fontSize: 12, color: 'var(--color-textSecondary)' }}>
                  知识点：{plan.focus_tags.map(tagName).join('、')}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-textTertiary)', marginRight: 8 }}>具体行动</span>
              {plan.actions.join('；')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
              <span style={{ color: 'var(--color-textTertiary)', marginRight: 8 }}>复评日</span>{plan.review_at}
            </div>
          </div>
        ) : (
          <EmptyState
            title="该生本学期暂无成长规划"
            description="生成报告时第四段会自动起草并标「自动建议」，但不写入规划表（05-03）"
            action={<Button size="small" onClick={() => setPlanOpen(true)}>起草规划</Button>}
          />
        )}
      </div>

      {/* 报告列表：筛选 + 新建 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>学习报告</span>
          <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>
            共 {sorted.length} 份 · 草稿 {draftCount} · 已发布 {publishedCount}
          </span>
          <Segmented
            size="small"
            value={filter}
            onChange={(value) => setFilter(value as ReportFilter)}
            options={[{ value: 'all', label: '全部' }, { value: 'draft', label: '草稿' }, { value: 'published', label: '已发布' }]}
          />
        </div>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openNew}>新建报告</Button>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-textTertiary)', fontSize: 13 }}>加载中…</div>
      ) : filtered.length ? (
        <div className="p3-report-grid">
          {filtered.map((report) => (
            <div key={report.id} className="section-card" style={{ padding: 12, boxShadow: 'none', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{report.title}</div>
                <ReportStatusTag status={report.status} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>
                {formatDate(report.created_at)} 创建 · {formatDate(report.updated_at)} 更新
              </div>
              <div style={{
                fontSize: 12, color: 'var(--color-textSecondary)', lineHeight: 1.6,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {stripMarkdown(report.content_md)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(report)}>编辑</Button>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setPreview(report)}>家长预览</Button>
                {report.status === 'draft' ? (
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeDraft(report)}>删除</Button>
                ) : (
                  <Button size="small" icon={<RollbackOutlined />} onClick={() => withdraw(report)}>撤回</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={filter === 'all' ? '还没有学习报告' : '没有符合筛选条件的报告'}
          description={filter === 'all' ? '点「新建报告」，AI 会按成绩 / 错题 / 课时起草四段正文' : '切换到「全部」看看'}
          action={filter === 'all' ? <Button size="small" type="primary" onClick={openNew}>新建报告</Button> : null}
        />
      )}

      <PlanDrawer open={planOpen} student={student} plan={plan ?? undefined} onClose={() => setPlanOpen(false)} onSaved={reloadPlan} />

      <ReportEditorModal
        open={editorOpen}
        student={student}
        row={row}
        plan={plan ?? undefined}
        exams={exams}
        report={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={reloadReports}
      />

      {/* 家长预览：只显示已发布报告（05-06）；草稿只给「发布后可见」说明，不泄露正文。 */}
      <Modal
        open={Boolean(preview)}
        title="家长端预览"
        width={720}
        rootClassName="p3-modal-root"
        onCancel={() => setPreview(null)}
        footer={<Button onClick={() => setPreview(null)}>关闭</Button>}
      >
        {preview ? (
          preview.status === 'published' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>{preview.title}</span>
                <ReportStatusTag status="published" />
              </div>
              {preview.parent_summary ? (
                <div style={{ padding: '8px 10px', background: 'var(--color-primaryBg)', borderRadius: 'var(--radius-base)', fontSize: 13, color: 'var(--color-primaryText)', marginBottom: 10 }}>
                  家长摘要：{preview.parent_summary}
                </div>
              ) : null}
              <MarkdownPreview markdown={preview.content_md} />
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="该报告为草稿，家长端不可见；发布后家长可见。"
            />
          )
        ) : null}
      </Modal>
    </div>
  )
}

/** 状态徽标：草稿灰 / 已发布绿 + 勾图标（图标+m文字，满足「颜色非唯一手段」GL-08）。 */
function ReportStatusTag({ status }: { status: LearningReport['status'] }) {
  return status === 'published'
    ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>家长可见</Tag>
    : <Tag style={{ marginInlineEnd: 0 }}>草稿</Tag>
}

/** 列表摘要：剥掉 Markdown 标记后的纯文本前两行由 CSS line-clamp 控制。 */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}
