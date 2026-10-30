import { useEffect, useMemo, useState } from 'react'
import { App, Button, Spin, Tabs, Tag } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import StudentAvatar from '@/components/StudentAvatar'
import { useLoad } from '@/hooks/useLoad'
import { studentStatusLabel } from '@/utils/format'
import { loadStudentsBundle } from './lib/data'
import { latestOfSubject } from './lib/derive'
import AnalysisTab from './components/AnalysisTab'
import BatchScoreModal from './components/BatchScoreModal'
import LessonDeductModal from './components/LessonDeductModal'
import MistakeBankTab from './components/MistakeBankTab'
import ReportsTab from './components/ReportsTab'
import ScoreEntryModal from './components/ScoreEntryModal'
import ScoreTrendTab from './components/ScoreTrendTab'
import StudentSidebar from './components/StudentSidebar'
import './students.css'

// 学生档案详情页（#12 03-09~03-15 + #8 05-02/05-10）。
// 结构：顶部吸顶信息条（返回 / 头像 / 姓名 / 标签 / 关键指标 / 记课时·录成绩·编辑资料）
//  + 主区四 Tabs（成绩轨迹 / 错题库 / 数据分析 / 学习报告）+ 右侧栏（基本资料 / 课时包 / 联系家长）。
// 四 Tabs 严格按 DEMO-CHECKLIST 03-09：没有「基本信息」Tab，七字段在右栏（03-10 仍满足）。
// Tab 与 URL query 联动（?tab=scores|mistakes|analysis|reports）：成长规划看板点行直接落「学习报告」Tab，
// 浏览器前进/后退也能回到同一 Tab；未知值回落到 scores（#8 05-02 的跨页入口契约）。
const TAB_KEYS = ['scores', 'mistakes', 'analysis', 'reports'] as const
type TabKey = typeof TAB_KEYS[number]

export default function StudentDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, reload } = useLoad(loadStudentsBundle, [id])
  const [entryOpen, setEntryOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [deductOpen, setDeductOpen] = useState(false)

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'scores'
  const changeTab = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  // 从卡片墙点进来时浏览器会保持原来的滚动位置；详情页必须从顶部开始看。
  // 卡片墙的滚动记忆在它自己的卸载前已记好，这里滚到顶部不会覆盖它（监听已随页面卸载移除）。
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  const row = useMemo(() => data?.rows.find((item) => item.student.id === id), [data, id])
  const latestMath = row ? latestOfSubject(row.records, '数学') : undefined

  if (loading && !data) {
    return <div className="page" style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
  }
  if (!row) {
    return (
      <div className="page">
        <EmptyState
          title="没有找到这名学生"
          description={'学生 id：' + id + '，可能已被删除或链接有误'}
          action={<Button onClick={() => navigate('/students')}>返回学生档案</Button>}
        />
      </div>
    )
  }

  const { student, lesson } = row

  return (
    <div className="page p3-detail">
      {/* 顶部吸顶信息条（03-09）：滚动时保持学生身份与主操作可见 */}
      <div className="p3-info-bar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/students')}>返回</Button>
        <StudentAvatar student={student} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text)' }}>{student.name}</span>
            <Tag style={{ marginInlineEnd: 0 }}>{student.grade}</Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{student.school}</Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{studentStatusLabel[student.status] ?? student.status}</Tag>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>入学 {student.enrolled_at}</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="p3-meta-label">课时剩余</div>
            <div className="p3-meta-value num">{lesson.remaining} 节</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="p3-meta-label">最近数学</div>
            <div className="p3-meta-value num">{latestMath ? latestMath.score + ' 分' : '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="small" onClick={() => setDeductOpen(true)}>记课时</Button>
            <Button size="small" type="primary" onClick={() => setEntryOpen(true)}>录成绩</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => message.info('编辑资料接口待接入，本期七字段只读演示')}>编辑资料</Button>
          </div>
        </div>
      </div>

      <div className="p3-detail-layout">
        <div className="section-card p3-detail-main">
          <Tabs
            activeKey={activeTab}
            onChange={changeTab}
            items={[
              {
                key: 'scores',
                label: '成绩轨迹',
                children: (
                  <ScoreTrendTab
                    row={row}
                    rows={data?.rows ?? []}
                    exams={data?.exams ?? []}
                    onEntry={() => setEntryOpen(true)}
                    onBatch={() => setBatchOpen(true)}
                  />
                ),
              },
              { key: 'mistakes', label: '错题库', children: <MistakeBankTab studentId={student.id} /> },
              {
                key: 'analysis',
                label: '数据分析',
                children: <AnalysisTab row={row} rows={data?.rows ?? []} exams={data?.exams ?? []} />,
              },
              {
                key: 'reports',
                label: '学习报告',
                children: <ReportsTab student={student} row={row} exams={data?.exams ?? []} />,
              },
            ]}
          />
        </div>

        <StudentSidebar row={row} onDeduct={() => setDeductOpen(true)} />
      </div>

      {entryOpen ? (
        <ScoreEntryModal
          open
          student={student}
          rows={data?.rows ?? []}
          exams={data?.exams ?? []}
          onClose={() => setEntryOpen(false)}
          onSaved={reload}
        />
      ) : null}

      {batchOpen ? (
        <BatchScoreModal
          open
          rows={data?.rows ?? []}
          onClose={() => setBatchOpen(false)}
          onSaved={reload}
        />
      ) : null}

      {deductOpen ? (
        <LessonDeductModal
          open
          student={student}
          lesson={lesson}
          onClose={() => setDeductOpen(false)}
          onSaved={reload}
        />
      ) : null}

    </div>
  )
}
