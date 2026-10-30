import { CheckOutlined } from '@ant-design/icons'
import { Button, Progress, Tag } from 'antd'
import StudentAvatar from '@/components/StudentAvatar'
import { studentStatusLabel } from '@/utils/format'
import { riskOf, type StudentRow } from '../lib/data'
import { daysAgoLabel, trendText } from '../lib/derive'

// 富卡六区（#12 03-01 / PRD §3.2）：身份行 / 标签行 / 元信息双列 / 强调面板 / 最近动态 / 操作行。
// 为什么整卡可点、三个操作按钮各自 stopPropagation：老师扫读时点卡片任意处都想进详情，
// 但「排课 / 录成绩」必须独立触发，否则点录成绩会顺带跳详情页。
// 颜色纪律（03-13）：白卡不整卡染色，彩色只出现在 ① 左侧 3px 风险竖条 ② 强调面板；
// 状态标签用中性灰、涨跌用 ▲▼ + 语义文字色，保证 grayscale 下仍可读（GL-08）。
const riskBarColor: Record<ReturnType<typeof riskOf>, string> = {
  urgent: 'var(--color-errorText)',
  tense: 'var(--color-amber)',
  normal: 'transparent',
}

/** 强调面板配色：告急红底 / 紧张琥珀底 / 正常中性底（浅底 + 深字，见 MASTER §1.3）。 */
const panels = {
  urgent: { bg: 'var(--color-errorBg)', fg: 'var(--color-errorText)', bar: 'var(--color-error)' },
  tense: { bg: 'var(--color-warningBg)', fg: 'var(--color-warningText)', bar: 'var(--color-amber)' },
  normal: { bg: 'var(--color-bgHover)', fg: 'var(--color-textSecondary)', bar: 'var(--color-primary)' },
} as const

const riskLabel = { urgent: '告急', tense: '紧张', normal: '课时充足' } as const
const riskAdvice = { urgent: '建议尽快续费', tense: '注意余量', normal: '可正常排课' } as const

export default function StudentCard({
  row, selected, onToggleSelect, onOpen, onSchedule, onScore, onDetail,
}: {
  row: StudentRow
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onSchedule: () => void
  onScore: () => void
  onDetail: () => void
}) {
  const risk = riskOf(row.lesson.remaining)
  const panel = panels[risk]
  const pct = row.lesson.total ? Math.round((row.lesson.used / row.lesson.total) * 100) : 0
  const { latest } = row

  return (
    <div
      className={'p3-card' + (selected ? ' p3-card-selected' : '')}
      role="button"
      tabIndex={0}
      aria-label={'查看 ' + row.student.name + ' 详情'}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }}
    >
      {/* ① 左侧 3px 风险竖条：课时 <5 红 / 5–10 琥珀 / 正常透明（03-13） */}
      <div className="p3-risk-bar" style={{ background: riskBarColor[risk] }} aria-hidden />

      {/* ② 身份行：多选点 + 首字头像 + 姓名 16px 粗 + 状态标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          aria-label={(selected ? '取消选择 ' : '选择 ') + row.student.name}
          aria-pressed={selected}
          onClick={(event) => { event.stopPropagation(); onToggleSelect() }}
          style={{
            width: 16, height: 16, borderRadius: '50%', padding: 0, flex: '0 0 auto', cursor: 'pointer',
            border: '1.5px solid var(--color-borderStrong)',
            background: selected ? 'var(--color-primary)' : 'transparent',
            display: 'grid', placeItems: 'center',
          }}
        >
          {selected ? <CheckOutlined style={{ fontSize: 9, color: 'var(--color-onPrimary)' }} /> : null}
        </button>
        <StudentAvatar student={row.student} size={30} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
          {row.student.name}
        </div>
        <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>{studentStatusLabel[row.student.status] ?? row.student.status}</Tag>
      </div>

      {/* ③ 标签行：年级·学校 + 业务类型标签 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--color-textTertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.student.grade} · {row.student.school}
        </span>
        <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>托管</Tag>
      </div>

      {/* ④ 元信息双列：课时剩余 / 最近考试与环比 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="p3-meta-label">课时剩余</div>
          <div className="p3-meta-value num">{row.lesson.remaining} 节</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="p3-meta-label">最近考试</div>
          <div className="p3-meta-value num" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {latest ? latest.subject + ' ' + latest.score : '—'}
            {latest ? (
              <span style={{ fontSize: 11, marginLeft: 4, color: row.delta > 0 ? 'var(--color-successText)' : row.delta < 0 ? 'var(--color-errorText)' : 'var(--color-textTertiary)' }}>
                {trendText(row.delta)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ⑤ 强调面板：大数字 + 进度条 + 风险标签 + 建议（唯一整块彩色区） */}
      <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 'var(--radius-base)', background: panel.bg }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: panel.fg }}>{row.lesson.remaining}</span>
          <span style={{ fontSize: 11, color: panel.fg }}>节剩余 / 共 {row.lesson.total} 节</span>
        </div>
        <Progress
          percent={pct}
          showInfo={false}
          size="small"
          strokeColor={panel.bar}
          trailColor="var(--color-border)"
          style={{ margin: '2px 0 0' }}
          aria-label={'已用 ' + pct + '%'}
        />
        <div style={{ fontSize: 11, color: panel.fg, marginTop: 2 }}>{riskLabel[risk]} · {riskAdvice[risk]}</div>
      </div>

      {/* ⑥ 最近动态：最新成绩（科目 / 分数 / 趋势），无记录时给快捷录入 */}
      <div style={{ marginTop: 8, padding: '5px 8px', borderRadius: 'var(--radius-base)', background: latest ? 'var(--color-bgHover)' : 'var(--color-warningBg)' }}>
        <div style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>最近动态</div>
        {latest ? (
          <div style={{ fontSize: 12, color: 'var(--color-textSecondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {daysAgoLabel(latest.date)} · {latest.exam_name} {latest.score} 分
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--color-warningText)' }}>暂无成绩记录，点「录成绩」补录</div>
        )}
      </div>

      {/* ⑦ 操作行：排课（琥珀次主，占位）/ 录成绩（teal 主）/ 详情（描边），吸底对齐 */}
      <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 6 }}>
        <Button
          size="small"
          style={{ flex: 1, color: 'var(--color-warningText)', borderColor: 'var(--color-amber)' }}
          onClick={(event) => { event.stopPropagation(); onSchedule() }}
        >
          排课
        </Button>
        <Button
          size="small"
          type="primary"
          style={{ flex: 1 }}
          onClick={(event) => { event.stopPropagation(); onScore() }}
        >
          录成绩
        </Button>
        <Button
          size="small"
          style={{ flex: 1 }}
          onClick={(event) => { event.stopPropagation(); onDetail() }}
        >
          详情
        </Button>
      </div>
    </div>
  )
}
