// P5 成长规划（#8）：全班 21 人规划表格看板（行=学生），只做规划总览。
// 数据流：api.listStudents / listGrowthPlans / listReports / listExams / listTags
//   → 每生再取 getStudentExamRecords（算最近 3 次得分率）+ getWeakSubjects（弱科候选）
//   → 汇总成 GrowthRow（学生 + 当前期规划 + 弱科判定 + 最近报告）→ 一次渲染表格。
// 看板只读：点行跳学生档案详情页「学习报告」Tab（05-02）；唯一写操作是给「无规划」行
// 开起草抽屉（任务书要求 + 07-A2 空态），已规划行的编辑入口在详情页规划卡（05-10）。
// 375px：表格转竖列卡片（GL-27），不横向滚动。
import { App as AntApp, Button, Input, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, MinusCircleOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import StudentAvatar from '@/components/StudentAvatar'
import { useLoad } from '@/hooks/useLoad'
import * as api from '@/mock/api'
import { MOCK_TODAY } from '@/mock/api'
import type { GrowthPlan, LearningReport, Student, Subject, Tag as KnowledgeTag } from '@/types'
import PlanDrawer from './components/PlanDrawer'
import { WEAK_RATE_THRESHOLD } from './components/constants'
import { useIsMobile } from './components/useIsMobile'

type PlanStatus = 'planned' | 'none' | 'review'
type FilterKey = 'all' | 'review' | 'none' | 'weak'

interface GrowthRow {
  student: Student
  plan?: GrowthPlan
  /** api.getWeakSubjects 的候选（最低 1~2 科），用于抽屉起草与解释口径，不直接决定「弱科」筛选。 */
  weakSubjects: Subject[]
  /** 最近 3 次该生各科得分率均值的全局最低值；undefined = 无成绩数据。 */
  lowestRate?: number
  isWeak: boolean
  latestReport?: LearningReport
  status: PlanStatus
}

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'review', label: '待复评' },
  { key: 'none', label: '无规划' },
  { key: 'weak', label: '弱科' },
]

const dash = <span style={{ color: 'var(--color-textTertiary)' }}>—</span>

/** 规划状态徽标（颜色非唯一手段：图标 + 文案 + 底色三重编码，GL-08）。 */
function PlanStatusTag({ status }: { status: PlanStatus }) {
  const map: Record<PlanStatus, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    planned: { label: '已规划', bg: 'var(--color-primaryBg)', color: 'var(--color-primaryText)', icon: <CheckCircleOutlined aria-hidden /> },
    none: { label: '无规划', bg: 'var(--color-bgHover)', color: 'var(--color-textSecondary)', icon: <MinusCircleOutlined aria-hidden /> },
    review: { label: '待复评', bg: 'var(--color-warningBg)', color: 'var(--color-warningText)', icon: <ClockCircleOutlined aria-hidden /> },
  }
  const it = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 4, background: it.bg, color: it.color, fontSize: 12 }}>
      {it.icon}
      {it.label}
    </span>
  )
}

/** 学生单元格：首字圆标 + 姓名 + 年级（#12 统一头像口径）。 */
function StudentCell({ student }: { student: Student }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <StudentAvatar student={student} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{student.name}</div>
        <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>{student.grade}</div>
      </div>
    </div>
  )
}

export default function GrowthPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // 一次装载整张看板：学生 × 规划 × 报告 × 成绩。成绩按学生并发取（21 人），
  // 串行会让 80ms 假延迟叠成 1.7s，演示首屏会明显卡顿。
  const { data, loading, reload } = useLoad(async () => {
    const [students, plans, reports, exams, tags] = await Promise.all([
      api.listStudents(),
      api.listGrowthPlans(),
      api.listReports(),
      api.listExams(),
      api.listTags(),
    ])
    const [recordsByStudent, weakByStudent] = await Promise.all([
      Promise.all(students.map((s) => api.getStudentExamRecords(s.id))),
      Promise.all(students.map((s) => api.getWeakSubjects(s.id))),
    ])
    const fullByExam = new Map(exams.map((e) => [e.id, e.full_score]))

    const rows: GrowthRow[] = students.map((student, i) => {
      // 各科最近 3 次得分率均值（分母取该场考试满分），取全局最低一科作为「最弱科」。
      // 与 api.getWeakSubjects 同源同口径，这里只是为了拿到数值做阈值判定（api 只返回科目名）。
      const rateBySubject = new Map<Subject, number[]>()
      for (const r of recordsByStudent[i]) {
        const arr = rateBySubject.get(r.subject) ?? []
        arr.push(r.score / (fullByExam.get(r.exam_id) ?? 100))
        rateBySubject.set(r.subject, arr)
      }
      let lowestRate: number | undefined
      for (const rates of rateBySubject.values()) {
        const last3 = rates.slice(-3)
        const mean = last3.reduce((a, b) => a + b, 0) / last3.length
        if (lowestRate === undefined || mean < lowestRate) lowestRate = mean
      }

      const plan = plans.find((p) => p.student_id === student.id)
      // 待复评 = 复评日 ≤ mock 今天 + 7 天（含已逾期）；与看板筛选、页头统计同一判定，避免三处不一致。
      const reviewDue = plan ? dayjs(plan.review_at).diff(dayjs(MOCK_TODAY), 'day') <= 7 : false
      const status: PlanStatus = !plan ? 'none' : reviewDue ? 'review' : 'planned'
      const latestReport = reports
        .filter((r) => r.student_id === student.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      return {
        student,
        plan,
        weakSubjects: weakByStudent[i],
        lowestRate,
        isWeak: lowestRate !== undefined && lowestRate <= WEAK_RATE_THRESHOLD,
        latestReport,
        status,
      }
    })
    return { rows, tags }
  }, [])

  const rows = data?.rows ?? []
  const tags: KnowledgeTag[] = data?.tags ?? []

  // 页头统计与筛选 pills 共用同一组计数，保证「统计 = 筛选结果」（05-01）。
  const counts = useMemo(
    () => ({
      all: rows.length,
      review: rows.filter((r) => r.status === 'review').length,
      none: rows.filter((r) => r.status === 'none').length,
      weak: rows.filter((r) => r.isWeak).length,
    }),
    [rows],
  )

  const [filter, setFilter] = useState<FilterKey>('all')
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      const byFilter =
        filter === 'all' ? true : filter === 'weak' ? r.isWeak : r.status === filter
      return byFilter && (!kw || r.student.name.includes(kw))
    })
  }, [rows, filter, keyword])

  // 无规划行「起草规划」：先 api.draftGrowthPlan 生成四段草稿，再开抽屉编辑保存。
  const [drawer, setDrawer] = useState<{ student: Student; plan: GrowthPlan }>()
  const [draftingId, setDraftingId] = useState<string>()
  async function startDraft(student: Student) {
    setDraftingId(student.id)
    try {
      const plan = await api.draftGrowthPlan(student.id)
      setDrawer({ student, plan })
    } finally {
      setDraftingId(undefined)
    }
  }

  // 点行 → 详情页「学习报告」Tab（05-02）；tab 参数由 P3 详情页读取。
  const openReportTab = (id: string) => navigate('/students/' + id + '?tab=reports')

  const term = rows.find((r) => r.plan)?.plan?.term

  const columns: TableColumnsType<GrowthRow> = [
    {
      title: '学生', key: 'student', width: 170,
      render: (_, r) => <StudentCell student={r.student} />,
    },
    {
      title: '当前期目标', key: 'goal', width: 260,
      render: (_, r) =>
        r.plan ? (
          <span style={{ fontSize: 13, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
            {r.plan.goal}
          </span>
        ) : (
          // 空态（07-A2）：无规划行就地给「起草规划」，点击不触发行跳转（stopPropagation）
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>暂无规划</span>
            <Button type="link" style={{ paddingInline: 0 }} loading={draftingId === r.student.id} onClick={() => startDraft(r.student)}>
              起草规划
            </Button>
          </div>
        ),
    },
    {
      title: '重点科目', key: 'focus', width: 150,
      render: (_, r) =>
        r.plan ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {r.plan.focus_subjects.map((s) => <Tag key={s} style={{ marginInlineEnd: 0 }}>{s}</Tag>)}
          </div>
        ) : dash,
    },
    {
      title: '规划状态', key: 'status', width: 110,
      render: (_, r) => <PlanStatusTag status={r.status} />,
    },
    {
      title: '复评日', key: 'review', width: 130,
      sorter: (a, b) => (a.plan?.review_at ?? '').localeCompare(b.plan?.review_at ?? ''),
      render: (_, r) =>
        r.plan ? (
          <span className="num" style={{ fontSize: 13, color: r.status === 'review' ? 'var(--color-warningText)' : 'var(--color-text)' }}>
            {r.plan.review_at}
          </span>
        ) : dash,
    },
    {
      title: '最近报告', key: 'report', width: 250,
      render: (_, r) =>
        r.latestReport ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.latestReport.title}
            </span>
            <Tag color={r.latestReport.status === 'published' ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
              {r.latestReport.status === 'published' ? '家长可见' : '草稿'}
            </Tag>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>暂无报告</span>
        ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="成长规划"
        summary={
          <span className="num">
            共 {counts.all} 人 · 无规划 {counts.none} · 待复评 {counts.review} · 弱科 {counts.weak}
            {term ? ' · 当前期 ' + term : ''}
          </span>
        }
        extra={
          // 375px 下这行说明会把页头挤到换行/溢出，桌面才展示（GL-27 底线：不横向滚动）
          isMobile ? null : <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>看板只读 · 编辑规划在详情页「学习报告」Tab</span>
        }
      />

      {/* 筛选 pills（全部/待复评/无规划/弱科）+ 姓名搜索；计数与页头共用同一组判定 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                minHeight: 28, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                border: '1px solid ' + (active ? 'var(--color-primary)' : 'var(--color-borderStrong)'),
                background: active ? 'var(--color-primaryBg)' : 'var(--color-bgContainer)',
                color: active ? 'var(--color-primaryText)' : 'var(--color-textSecondary)',
              }}
            >
              {f.label} <span className="num">{counts[f.key]}</span>
            </button>
          )
        })}
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--color-icon)' }} aria-hidden />}
          placeholder="搜索学生姓名"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: isMobile ? '100%' : 200, marginLeft: isMobile ? 0 : 'auto' }}
        />
      </div>

      {loading && !rows.length ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
      ) : isMobile ? (
        /* 375px：表格转竖列卡片（05-09 / GL-27），每张卡是同一行数据 */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r) => (
            <div
              key={r.student.id}
              onClick={() => openReportTab(r.student.id)}
              style={{ background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-base)', boxShadow: 'var(--shadow-card)', padding: 12, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <StudentCell student={r.student} />
                <PlanStatusTag status={r.status} />
              </div>
              <MobileInfo label="当前期目标">
                {r.plan ? r.plan.goal : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ color: 'var(--color-textTertiary)' }}>暂无规划</span>
                    <Button type="link" style={{ paddingInline: 0 }} loading={draftingId === r.student.id} onClick={() => startDraft(r.student)}>
                      起草规划
                    </Button>
                  </span>
                )}
              </MobileInfo>
              <MobileInfo label="重点科目">
                {r.plan?.focus_subjects.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.plan.focus_subjects.map((s) => <Tag key={s} style={{ marginInlineEnd: 0 }}>{s}</Tag>)}
                  </div>
                ) : dash}
              </MobileInfo>
              <MobileInfo label="复评日">
                {r.plan ? <span className="num" style={{ color: r.status === 'review' ? 'var(--color-warningText)' : undefined }}>{r.plan.review_at}</span> : dash}
              </MobileInfo>
              <MobileInfo label="最近报告">
                {r.latestReport ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {r.latestReport.title}
                    <Tag color={r.latestReport.status === 'published' ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
                      {r.latestReport.status === 'published' ? '家长可见' : '草稿'}
                    </Tag>
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-textTertiary)' }}>暂无报告</span>
                )}
              </MobileInfo>
            </div>
          ))}
          {filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-textTertiary)' }}>没有符合条件的学生</div> : null}
        </div>
      ) : (
        <div style={{ background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-base)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
          <Table<GrowthRow>
            rowKey={(r) => r.student.id}
            dataSource={filtered}
            columns={columns}
            pagination={false}
            loading={loading}
            onRow={(r) => ({ onClick: () => openReportTab(r.student.id), style: { cursor: 'pointer' } })}
            locale={{ emptyText: <div style={{ padding: 32, color: 'var(--color-textTertiary)' }}>没有符合条件的学生</div> }}
          />
        </div>
      )}

      <PlanDrawer
        open={Boolean(drawer)}
        student={drawer?.student}
        plan={drawer?.plan}
        tags={tags}
        onClose={() => setDrawer(undefined)}
        onSaved={reload}
      />
    </div>
  )
}

/** 移动端卡片的「标签 + 值」行：标签定宽 76px，值可换行，避免 375px 挤成两行错位。 */
function MobileInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--color-text)' }}>
      <span style={{ flex: '0 0 76px', color: 'var(--color-textSecondary)', fontSize: 12 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
