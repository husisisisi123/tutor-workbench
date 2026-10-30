import type { EChartsOption } from 'echarts'
import { Tag } from 'antd'
import Chart from '@/components/Chart'
import type { Exam } from '@/types'
import { tokens } from '@/theme/tokens'
import type { StudentRow } from '../lib/data'
import { classLatestRate, subjectStats, weakSubject } from '../lib/derive'

// 数据分析 Tab（03-15）：只留统计——各科均分 / 最高 / 最低 / 得分率 + 强弱科对比（叠班级均分）。
// 为什么这里不放「AI 学习报告」入口：#8 定案把报告入口移到第四个 Tab「学习报告」，
// 本 Tab 若再放入口会出现两个入口，验收明确「报告入口不在本 Tab」。
// 班级均分是 mock 派生：每个学生取该科最近一次得分率再求平均（不新增数据表，04-08 只算不存）。
export default function AnalysisTab({ row, rows, exams }: { row: StudentRow; rows: StudentRow[]; exams: Exam[] }) {
  const stats = subjectStats(row.records, exams)
  const weak = weakSubject(row.records, exams)
  const strongest = stats.length ? [...stats].sort((a, b) => b.rate - a.rate)[0].subject : undefined

  const classRates = stats.map((stat) => {
    const rate = classLatestRate(rows, exams, stat.subject)
    return rate === undefined ? 0 : Math.round(rate * 100)
  })

  const barOption: EChartsOption = {
    grid: { left: 44, right: 16, top: 32, bottom: 24 },
    legend: { top: 0, textStyle: { color: tokens.color.textSecondary, fontSize: 11 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: stats.map((stat) => stat.subject),
      axisLabel: { color: tokens.color.textSecondary, fontSize: 11 },
      axisLine: { lineStyle: { color: tokens.color.border } },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { color: tokens.color.textTertiary, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: tokens.color.borderSecondary } },
    },
    series: [
      {
        name: '本人得分率',
        type: 'bar',
        barMaxWidth: 24,
        data: stats.map((stat) => Math.round(stat.rate * 100)),
        itemStyle: { color: tokens.color.primary },
      },
      {
        name: '班级平均',
        type: 'bar',
        barMaxWidth: 24,
        data: classRates,
        itemStyle: { color: tokens.color.borderStrong },
      },
    ],
  }

  if (!stats.length) {
    return <div style={{ padding: 24, color: 'var(--color-textTertiary)', fontSize: 13 }}>暂无成绩数据，先录入成绩后再看统计。</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>数据分析</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {weak ? <Tag color="error" style={{ marginInlineEnd: 0 }}>弱科：{weak}</Tag> : null}
          {strongest ? <Tag color="success" style={{ marginInlineEnd: 0 }}>强科：{strongest}</Tag> : null}
        </div>
      </div>

      <div className="p3-stat-grid">
        {stats.map((stat) => (
          <div key={stat.subject} className="section-card" style={{ padding: 12, boxShadow: 'none', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{stat.subject}</span>
              <span style={{ fontSize: 11, color: 'var(--color-textTertiary)' }}>{stat.count} 次考试</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <div className="p3-meta-label">均分</div>
                <div className="p3-meta-value num">{stat.avg}</div>
              </div>
              <div>
                <div className="p3-meta-label">得分率</div>
                <div className="p3-meta-value num">{Math.round(stat.rate * 100)}%</div>
              </div>
              <div>
                <div className="p3-meta-label">最高</div>
                <div className="p3-meta-value num" style={{ color: 'var(--color-successText)' }}>{stat.max}</div>
              </div>
              <div>
                <div className="p3-meta-label">最低</div>
                <div className="p3-meta-value num" style={{ color: 'var(--color-errorText)' }}>{stat.min}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>强弱科对比（叠班级均分）</div>
        <Chart option={barOption} height={240} />
      </div>
    </div>
  )
}
