import {
  AuditOutlined,
  CalendarOutlined,
  EditOutlined,
  FileAddOutlined,
  MessageOutlined,
  RightOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Tag } from 'antd'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import StudentAvatar from '@/components/StudentAvatar'
import type { DashboardSummary, ParentInteraction } from '@/mock/api'
import type { Feedback, Student } from '@/types'
import { deriveSchedule, deriveTodos, WARNING_META } from '../derive'
import BlockCard, { BlockRow } from './BlockCard'

// 主区 2×2 四块（01-01/01-02）：待办 / 日程 / 家长互动 / 学情预警。
// 四块都只接收派生结果并渲染，点击行为按 #6 Q5=A：
// 待办 → /feedback?filter=…；日程 → 就地展开；家长互动 → 右侧抽屉；学情预警 → /students/:id。

const TODO_ICONS: Record<string, ReactNode> = {
  missing: <FileAddOutlined />,
  draft: <EditOutlined />,
  pending: <AuditOutlined />,
  done: <AuditOutlined />,
}

export default function MainBlocks({
  summary,
  interactions,
  students,
  feedbacks,
  onOpenParents,
}: {
  summary: DashboardSummary
  interactions: { items: ParentInteraction[]; summary: { students: number; unread: number } }
  students: Student[]
  feedbacks: Feedback[]
  onOpenParents: (studentId?: string) => void
}) {
  const navigate = useNavigate()
  const [expandedSchedule, setExpandedSchedule] = useState<string | undefined>()
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const todos = useMemo(() => deriveTodos(students, feedbacks), [students, feedbacks])
  const schedule = useMemo(
    () => deriveSchedule(summary, feedbacks, students, interactions),
    [summary, feedbacks, students, interactions],
  )
  const warnings = summary.warningsTop

  return (
    <>
      {/* 1. 今日待办：数量全部来自当天反馈单状态，不另存待办表 */}
      <BlockCard
        icon={<EditOutlined />}
        title="今日待办"
        badge={todos.length}
        action={
          <Button type="link" size="small" onClick={() => navigate('/feedback')}>
            去反馈页
          </Button>
        }
        footer={
          <>
            <span>
              今日已写 <b>{summary.written}</b>/{summary.total}
            </span>
            <span>
              待审核 <b>{summary.pendingReview}</b> 份
            </span>
          </>
        }
      >
        {todos.map((item) => (
          <BlockRow
            key={item.key}
            leading={<span className="db-card__icon">{TODO_ICONS[item.key] ?? <EditOutlined />}</span>}
            title={item.title}
            meta={item.meta}
            extra={<RightOutlined className="db-row__arrow" />}
            onClick={() => navigate(item.to)}
            ariaLabel={item.title + '，' + item.meta}
          />
        ))}
      </BlockCard>

      {/* 2. 今日日程：点行就地展开（不跳转） */}
      <BlockCard
        icon={<CalendarOutlined />}
        title="今日日程"
        badge={schedule.length}
        footer={
          <>
            <span>今日 3 项</span>
            <span>人数与留言实时联动</span>
          </>
        }
      >
        {schedule.map((item) => (
          <BlockRow
            key={item.key}
            leading={<span className="db-row__time">{item.time}</span>}
            title={item.title}
            meta={item.meta}
            extra={<RightOutlined className="db-row__arrow" rotate={expandedSchedule === item.key ? 90 : 0} />}
            expanded={expandedSchedule === item.key}
            detail={item.detail}
            onClick={() => setExpandedSchedule((prev) => (prev === item.key ? undefined : item.key))}
            ariaLabel={item.time + ' ' + item.title}
          />
        ))}
      </BlockCard>

      {/* 3. 家长互动（#13）：未读优先、最近优先；点任意一行开抽屉并定位该学生 */}
      <BlockCard
        icon={<MessageOutlined />}
        title="家长互动"
        badge={interactions.summary.unread > 0 ? interactions.summary.unread + ' 未读' : undefined}
        action={
          <Button type="link" size="small" onClick={() => onOpenParents()}>
            全部留言
          </Button>
        }
        footer={
          <>
            <span>
              <b>{interactions.summary.students}</b> 位家长
            </span>
            <span>
              <b>{interactions.summary.unread}</b> 条未读
            </span>
          </>
        }
      >
        {interactions.items.length === 0 ? (
          <div className="db-empty">暂无家长留言</div>
        ) : (
          interactions.items.map((item) => {
            const student = byId.get(item.student_id)
            return (
              <BlockRow
                key={item.student_id}
                leading={student ? <StudentAvatar student={student} size={28} /> : undefined}
                title={
                  <>
                    <span>{item.student_name} 家长</span>
                    {item.unread > 0 ? <span className="db-unread">{item.unread}</span> : null}
                  </>
                }
                meta={item.latest.content}
                extra={
                  <span className="db-muted">
                    {item.unread > 0 ? '未读' : '已回复'} · {item.latest.created_at.slice(11, 16)}
                  </span>
                }
                onClick={() => onOpenParents(item.student_id)}
                ariaLabel={item.student_name + ' 家长，' + (item.unread > 0 ? item.unread + ' 条未读' : '已回复')}
              />
            )
          })
        )}
      </BlockCard>

      {/* 4. 学情预警：口径在 api.computeWarnings（完成度/错题/成绩三条任一），这里只取前 3 展示 */}
      <BlockCard
        icon={<WarningOutlined />}
        title="学情预警"
        badge={summary.warnings.length}
        action={
          <Button type="link" size="small" onClick={() => navigate('/students')}>
            学生档案
          </Button>
        }
        footer={
          <>
            <span>命中 {summary.warnings.length} 名学生</span>
            <span>完成度 / 错题 / 成绩三条任一</span>
          </>
        }
      >
        {warnings.length === 0 ? (
          <div className="db-empty">当前没有命中预警的学生</div>
        ) : (
          warnings.map((warning) => {
            const student = byId.get(warning.student_id)
            const meta = WARNING_META[warning.reason]
            return (
              <BlockRow
                key={warning.student_id + warning.reason}
                leading={student ? <StudentAvatar student={student} size={28} /> : undefined}
                title={
                  <>
                    <span>{student?.name ?? '学生'}</span>
                    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                      {meta.label}
                    </Tag>
                  </>
                }
                meta={warning.detail}
                extra={<RightOutlined className="db-row__arrow" />}
                onClick={() => navigate('/students/' + warning.student_id)}
                ariaLabel={(student?.name ?? '学生') + '，' + meta.label + '，' + warning.detail}
              />
            )
          })
        )}
      </BlockCard>
    </>
  )
}
