import { Button, Progress, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import StudentAvatar from '@/components/StudentAvatar'
import { studentStatusLabel } from '@/utils/format'
import { FOLLOW_MISTAKE_THRESHOLD, riskOf, type StudentRow } from '../lib/data'
import { daysAgoLabel, trendText } from '../lib/derive'

// 列表视图（03-02 卡片/列表双视图数据一致）：与卡片墙读同一个 rows 数组，只换呈现方式。
// 为什么用 AntD Table 而不是手写行：列宽/表头底色/空态都由主题 token 接管（DS-17 Table 表头），
// 375px 下靠 scroll.x 在容器内横滚，不把整页撑出横向滚动条（GL-27）。
export default function StudentTable({
  rows, onOpen, onScore,
}: {
  rows: StudentRow[]
  onOpen: (row: StudentRow) => void
  onScore: (row: StudentRow) => void
}) {
  const columns: TableColumnsType<StudentRow> = [
    {
      title: '学生',
      dataIndex: ['student', 'name'],
      width: 180,
      fixed: 'left',
      render: (_value, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StudentAvatar student={row.student} size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{row.student.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>{row.student.grade}</div>
          </div>
        </div>
      ),
    },
    { title: '学校', dataIndex: ['student', 'school'], width: 130 },
    {
      title: '学生状态',
      dataIndex: ['student', 'status'],
      width: 96,
      render: (status: string) => <Tag style={{ marginInlineEnd: 0 }}>{studentStatusLabel[status] ?? status}</Tag>,
    },
    {
      title: '课时剩余',
      key: 'lesson',
      width: 150,
      sorter: (a, b) => a.lesson.remaining - b.lesson.remaining,
      render: (_value, row) => {
        const risk = riskOf(row.lesson.remaining)
        const color = risk === 'urgent' ? 'var(--color-errorText)' : risk === 'tense' ? 'var(--color-warningText)' : 'var(--color-text)'
        const pct = row.lesson.total ? Math.round((row.lesson.used / row.lesson.total) * 100) : 0
        return (
          <div>
            <div className="num" style={{ fontSize: 13, color }}>{row.lesson.remaining} / {row.lesson.total} 节</div>
            <Progress percent={pct} showInfo={false} size="small" strokeColor={risk === 'normal' ? 'var(--color-primary)' : color} trailColor="var(--color-border)" aria-label={'已用 ' + pct + '%'} />
          </div>
        )
      },
    },
    {
      title: '最近考试',
      key: 'latest',
      width: 200,
      sorter: (a, b) => (a.latest?.score ?? 0) - (b.latest?.score ?? 0),
      render: (_value, row) => row.latest ? (
        <div>
          <div className="num" style={{ fontSize: 13, color: 'var(--color-text)' }}>
            {row.latest.exam_name} <span style={{ fontWeight: 600 }}>{row.latest.score}</span>
            <span style={{ fontSize: 11, marginLeft: 4, color: row.delta > 0 ? 'var(--color-successText)' : row.delta < 0 ? 'var(--color-errorText)' : 'var(--color-textTertiary)' }}>{trendText(row.delta)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>{daysAgoLabel(row.latest.date)}</div>
        </div>
      ) : <span style={{ color: 'var(--color-textTertiary)' }}>暂无成绩</span>,
    },
    {
      title: '待跟进',
      key: 'follow',
      width: 110,
      render: (_value, row) => row.unmastered >= FOLLOW_MISTAKE_THRESHOLD
        ? <span style={{ fontSize: 12, color: 'var(--color-warningText)' }}>未掌握 {row.unmastered} 题</span>
        : <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>—</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_value, row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" type="primary" onClick={(event) => { event.stopPropagation(); onScore(row) }}>录成绩</Button>
          <Button size="small" onClick={(event) => { event.stopPropagation(); onOpen(row) }}>详情</Button>
        </div>
      ),
    },
  ]

  return (
    <Table<StudentRow>
      rowKey={(row) => row.student.id}
      size="small"
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 1000 }}
      onRow={(row) => ({ onClick: () => onOpen(row), style: { cursor: 'pointer' } })}
    />
  )
}
