import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Input, Segmented, Space, Spin } from 'antd'
import { AppstoreOutlined, BarsOutlined, ClearOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { useLoad } from '@/hooks/useLoad'
import { isFollowUp, isLessonUrgent, loadStudentsBundle, type StudentRow } from './lib/data'
import ScoreEntryModal from './components/ScoreEntryModal'
import StudentCard from './components/StudentCard'
import StudentTable from './components/StudentTable'
import './students.css'

// 学生档案卡片墙（#12 03-01~03-08 / PRD §三）。
// 数据流：loadStudentsBundle() 并发读 21 名学生的课时 / 成绩 + 错题关联 → 派生页头统计与卡片；
// 搜索与筛选只是对 rows 做内存过滤，卡片/列表两个视图读同一个数组，保证 03-02「切换数据一致」。
// 返回保持状态（03-03）：筛选与滚动位置放在模块级 wallMemory，详情页返回后还在原处；
// 刷新整页重置——与「刷新回种子」同一套口径，不额外落 localStorage。

type WallFilter = 'all' | 'urgent' | 'follow'
type WallView = 'card' | 'list'

const wallMemory: { query: string; filter: WallFilter; view: WallView; scrollY: number } = {
  query: '', filter: 'all', view: 'card', scrollY: 0,
}

export default function StudentsPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const { data, loading, reload } = useLoad(loadStudentsBundle, [])
  const [query, setQuery] = useState(wallMemory.query)
  const [filter, setFilter] = useState<WallFilter>(wallMemory.filter)
  const [view, setView] = useState<WallView>(wallMemory.view)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scoreFor, setScoreFor] = useState<StudentRow | null>(null)
  const restored = useRef(false)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const exams = useMemo(() => data?.exams ?? [], [data])

  // 统计与筛选共用同一批谓词（isLessonUrgent / isFollowUp），页头数字必须与筛选结果一致（03-02）。
  const urgentCount = rows.filter(isLessonUrgent).length
  const followCount = rows.filter(isFollowUp).length

  const filtered = useMemo(() => {
    const keyword = query.trim()
    return rows
      .filter((row) => (keyword ? [row.student.name, row.student.school, row.student.grade].some((text) => text.includes(keyword)) : true))
      .filter((row) => (filter === 'urgent' ? isLessonUrgent(row) : filter === 'follow' ? isFollowUp(row) : true))
  }, [rows, query, filter])

  useEffect(() => { wallMemory.query = query }, [query])
  useEffect(() => { wallMemory.filter = filter }, [filter])
  useEffect(() => { wallMemory.view = view }, [view])

  // 滚动位置：页面用 window 滚动（Layout.Content 不独立滚动），离开前记录、回来一次性恢复。
  useEffect(() => {
    const onScroll = () => { wallMemory.scrollY = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (restored.current || loading) return
    restored.current = true
    requestAnimationFrame(() => window.scrollTo(0, wallMemory.scrollY))
  }, [loading])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openDetail = (row: StudentRow) => navigate('/students/' + row.student.id)

  return (
    <div className="page p3-wall">
      <PageHeader
        title="学生档案"
        summary={'共 ' + rows.length + ' 名学生 · 课时告急 ' + urgentCount + ' 人 · 待跟进 ' + followCount + ' 人'}
        extra={(
          <Space wrap size={8}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--color-icon)' }} />}
              placeholder="搜索姓名 / 学校 / 年级"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="p3-search"
              aria-label="搜索学生"
            />
            <Segmented<WallFilter>
              value={filter}
              onChange={(value) => setFilter(value)}
              options={[
                { value: 'all', label: '全部' },
                { value: 'urgent', label: '课时告急 ' + urgentCount },
                { value: 'follow', label: '待跟进 ' + followCount },
              ]}
            />
            <Segmented<WallView>
              value={view}
              onChange={(value) => setView(value)}
              options={[
                { value: 'card', icon: <AppstoreOutlined /> },
                { value: 'list', icon: <BarsOutlined /> },
              ]}
            />
          </Space>
        )}
      />

      {selected.size ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '6px 10px', background: 'var(--color-primaryBg)', borderRadius: 'var(--radius-base)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-primaryText)' }}>已选 {selected.size} 人</span>
          <Button size="small" type="text" icon={<ClearOutlined />} onClick={() => setSelected(new Set())}>清除选择</Button>
          <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>多选点仅用于扫读标记，批量操作后续版本上线</span>
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的学生"
          description="换个关键词，或清空筛选条件"
          action={<Button size="small" onClick={() => { setQuery(''); setFilter('all') }}>清空筛选</Button>}
        />
      ) : view === 'card' ? (
        <div className="p3-wall-grid">
          {filtered.map((row) => (
            <StudentCard
              key={row.student.id}
              row={row}
              selected={selected.has(row.student.id)}
              onToggleSelect={() => toggleSelect(row.student.id)}
              onOpen={() => openDetail(row)}
              onSchedule={() => message.info('排课流程后续版本上线，本期占位（#12）')}
              onScore={() => setScoreFor(row)}
              onDetail={() => openDetail(row)}
            />
          ))}
        </div>
      ) : (
        <StudentTable rows={filtered} onOpen={openDetail} onScore={setScoreFor} />
      )}

      {scoreFor ? (
        <ScoreEntryModal
          open
          student={scoreFor.student}
          rows={rows}
          exams={exams}
          onClose={() => setScoreFor(null)}
          onSaved={reload}
        />
      ) : null}
    </div>
  )
}
