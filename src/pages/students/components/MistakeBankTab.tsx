import { useState } from 'react'
import { Input, Segmented } from 'antd'
import EmptyState from '@/components/EmptyState'
import MistakeCard from '@/components/MistakeCard'
import { listMistakes } from '@/mock/api'
import type { MistakeWithStudents } from '@/mock/api'
import type { Subject } from '@/types'
import { useLoad } from '@/hooks/useLoad'
import { SUBJECTS } from '../lib/derive'

// 个人错题库 Tab（03-07 / 04-11）= 06 错题库「按学生过滤的视图」，不维护第二套数据。
// 数据流：api.listMistakes({ studentId }) 已按关联表过滤 associations（只留该生），
// 但 api 不会丢掉「该生无关」的题目，所以这里再按 associations.length > 0 过滤一次。
// 卡片复用共享 MistakeCard：与错题库页同一实现，改样式只改一处（04-11 明确要求）。
export default function MistakeBankTab({ studentId }: { studentId: string }) {
  const { data, loading } = useLoad(() => listMistakes({ studentId }), [studentId])
  const [subject, setSubject] = useState<'全部' | Subject>('全部')
  const [keyword, setKeyword] = useState('')

  const mine = (data ?? []).filter((m) => m.associations.length > 0)
  const filtered = mine
    .filter((m) => (subject === '全部' ? true : m.subject === subject))
    .filter((m) => (keyword ? m.question_text.includes(keyword) : true))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
          个人错题库
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-textTertiary)', marginLeft: 8 }}>
            共 {mine.length} 题 · 未掌握 {mine.filter((m) => m.associations.some((a) => a.mastery === 'unmastered')).length} 题
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Segmented
            size="small"
            value={subject}
            onChange={(value) => setSubject(value as '全部' | Subject)}
            options={['全部', ...SUBJECTS].map((s) => ({ value: s, label: s }))}
          />
          <Input.Search size="small" allowClear placeholder="搜题干" style={{ width: 160 }} onChange={(event) => setKeyword(event.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-textTertiary)', fontSize: 13 }}>加载中…</div>
      ) : filtered.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((mistake: MistakeWithStudents) => <MistakeCard key={mistake.id} mistake={mistake} />)}
        </div>
      ) : (
        <EmptyState
          title="该生暂无符合条件的错题"
          description={keyword || subject !== '全部' ? '试试清空筛选条件' : '在错题库录入后，这里会自动出现'}
        />
      )}
    </div>
  )
}
