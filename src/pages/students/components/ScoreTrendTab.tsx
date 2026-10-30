import { useMemo, useState } from 'react'
import { App, Button, Empty, Select, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import type { EChartsOption } from 'echarts'
import Chart from '@/components/Chart'
import type { Exam, Subject } from '@/types'
import { tokens } from '@/theme/tokens'
import type { StudentRow } from '../lib/data'
import { fullScoreOf, latestOfSubject, SUBJECTS, trendText } from '../lib/derive'
import type { StudentRecord } from '../lib/data'

// 成绩轨迹 Tab（03-11 / PRD §4.2-1）：三图（单科折线 / 各科雷达 / 班内分位）+ 明细表。
// 三图共用同一份 records（loadStudentsBundle 已按日期排好序），保证「图表数据与录入一致」；
// 班内分位是简化版：只算当前名次与超过百分比，不做时间序列（PRD §4.2-1 明确简化）。
// 图表颜色从 tokens.ts 取：cssVar 下 useToken() 返回 var(--ant-*) 字符串，ECharts 会渲染成黑/NaN（DS-8）。
export default function ScoreTrendTab({
  row, rows, exams, onEntry, onBatch,
}: {
  row: StudentRow
  rows: StudentRow[]
  exams: Exam[]
  onEntry: () => void
  onBatch: () => void
}) {
  const { message } = App.useApp()
  const [subject, setSubject] = useState<Subject>('数学')

  const subjectRecords = useMemo(() => row.records.filter((r) => r.subject === subject), [row.records, subject])

  const lineOption: EChartsOption = {
    grid: { left: 42, right: 20, top: 24, bottom: 28 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: subjectRecords.map((r) => r.date.slice(5)),
      axisLabel: { color: tokens.color.textTertiary, fontSize: 11 },
      axisLine: { lineStyle: { color: tokens.color.border } },
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { color: tokens.color.textTertiary, fontSize: 11 },
      splitLine: { lineStyle: { color: tokens.color.borderSecondary } },
    },
    series: [{
      type: 'line', smooth: true, symbolSize: 7,
      data: subjectRecords.map((r) => ({ value: r.score, name: r.exam_name })),
      lineStyle: { color: tokens.color.primary, width: 2 },
      itemStyle: { color: tokens.color.primary },
      areaStyle: { color: tokens.color.primaryBg },
      label: { show: true, position: 'top', color: tokens.color.textSecondary, fontSize: 11 },
    }],
  }

  // 雷达取各科「最近一次」得分率，与数据分析 Tab 的强弱科口径一致（03-15）。
  const radarRates = SUBJECTS.map((s) => {
    const last = latestOfSubject(row.records, s)
    return last ? Math.round((last.score / fullScoreOf(exams, last.exam_id)) * 100) : 0
  })
  const radarOption: EChartsOption = {
    tooltip: {},
    radar: {
      indicator: SUBJECTS.map((s) => ({ name: s, max: 100 })),
      radius: '64%',
      axisName: { color: tokens.color.textSecondary, fontSize: 11 },
      axisLine: { lineStyle: { color: tokens.color.border } },
      splitLine: { lineStyle: { color: tokens.color.border } },
      splitArea: { areaStyle: { color: [tokens.color.bgContainer, tokens.color.bgHover] } },
    },
    series: [{
      type: 'radar',
      symbolSize: 5,
      data: [{ value: radarRates, name: '得分率' }],
      lineStyle: { color: tokens.color.primary, width: 2 },
      itemStyle: { color: tokens.color.primary },
      areaStyle: { color: tokens.color.primaryBg },
    }],
  }

  // 班内分位基于「最近一次考试」：同 exam_id 的班级成绩里数名次，缺记录时按班排字段兜底。
  const latest = row.latest
  const classScores = latest
    ? rows
      .map((r) => r.records.find((rec) => rec.exam_id === latest.exam_id))
      .filter((rec): rec is StudentRecord => Boolean(rec))
    : []
  const rank = latest
    ? (latest.class_rank > 0 ? latest.class_rank : 1 + classScores.filter((rec) => rec.score > latest.score).length)
    : 0
  const classSize = classScores.length
  const percentile = classSize && rank ? Math.round(((classSize - rank) / classSize) * 100) : 0
  const gaugeOption: EChartsOption = {
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      splitNumber: 4,
      radius: '92%',
      progress: { show: true, width: 10, itemStyle: { color: tokens.color.primary } },
      axisLine: { lineStyle: { width: 10, color: [[1, tokens.color.bgHover]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        color: tokens.color.text,
        fontSize: 26,
        offsetCenter: [0, '-8%'],
      },
      data: [{ value: percentile }],
    }],
  }

  const columns: TableColumnsType<StudentRecord> = [
    { title: '日期', dataIndex: 'date', width: 110, sorter: (a, b) => a.date.localeCompare(b.date) },
    { title: '考试', dataIndex: 'exam_name', width: 200 },
    { title: '科目', dataIndex: 'subject', width: 80 },
    {
      title: '分数', dataIndex: 'score', width: 90,
      render: (score: number, rec) => <span className="num">{score}<span style={{ color: 'var(--color-textTertiary)', fontSize: 11 }}> / {fullScoreOf(exams, rec.exam_id)}</span></span>,
    },
    { title: '班排', dataIndex: 'class_rank', width: 80, render: (value: number) => value > 0 ? value : '—' },
    { title: '备注', dataIndex: 'comment', render: (value?: string) => value ?? '—' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          成绩轨迹
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-textTertiary)', marginLeft: 8 }}>
            共 {row.records.length} 条记录 · 最近 {latest ? latest.exam_name + ' ' + latest.score + ' 分' + ' ' + trendText(row.delta) : '暂无'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={onBatch}>整班批量录入</Button>
          <Button size="small" type="primary" onClick={onEntry}>+ 录成绩</Button>
        </div>
      </div>

      <div className="p3-charts">
        <div className="p3-chart-wide section-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>单科折线</span>
            <Select<Subject>
              size="small"
              value={subject}
              style={{ width: 96 }}
              options={SUBJECTS.map((s) => ({ value: s, label: s }))}
              onChange={setSubject}
            />
          </div>
          {subjectRecords.length
            ? <Chart option={lineOption} height={220} />
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={'暂无' + subject + '成绩'} style={{ padding: '48px 0' }} />}
        </div>

        <div className="section-card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>各科雷达（最近得分率）</div>
          <Chart option={radarOption} height={220} />
        </div>

        <div className="section-card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>班内分位</div>
          {latest ? (
            <>
              <Chart option={gaugeOption} height={220} />
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-textSecondary)' }}>
                最近一次 · 班内第 <span className="num" style={{ fontWeight: 600 }}>{rank}</span> / {classSize || '—'} 名
              </div>
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成绩" style={{ padding: '48px 0' }} />}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>成绩明细</span>
        <Button size="small" onClick={() => message.info('成绩编辑/删除走「再录一次」覆盖同一次考试（api 按考试×学生 upsert）')}>
          说明
        </Button>
      </div>
      <Table<StudentRecord>
        rowKey={(rec) => rec.id}
        size="small"
        columns={columns}
        dataSource={[...row.records].reverse()}
        pagination={false}
        scroll={{ x: 640 }}
        style={{ marginTop: 8 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成绩记录，点「+ 录成绩」补录" /> }}
      />
    </div>
  )
}
