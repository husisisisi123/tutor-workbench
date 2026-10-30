import type { ReactNode } from 'react'

// 页头统一结构：标题 + 概要行（统计直接嵌在标题下，参考 LessonLedger）+ 右侧主操作。
export default function PageHeader({ title, summary, extra }: { title: ReactNode; summary?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="page-title">{title}</div>
        {summary ? <div className="page-summary">{summary}</div> : null}
      </div>
      {extra ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{extra}</div> : null}
    </div>
  )
}
