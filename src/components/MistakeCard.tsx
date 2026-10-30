import type { Mistake, MistakeStudent, Student } from '@/types'
import StudentAvatar from './StudentAvatar'
import { MasteryTag } from './StatusTag'
import { causeLabel, difficultyLabel } from '@/utils/format'
import { Tag } from 'antd'

// 错题轻卡（#7 04-05）：题干 2 行 + 标签 chips + 学生首字圆标叠 3 + 掌握状态点。
// 为什么做成共享组件：错题库页与学生档案「错题库」Tab 必须同一实现（04-11），
// 两边都从这里渲染，改样式只改一处。只染掌握状态，错因不染色（彩色区 ≤2）。
export interface MistakeCardData extends Mistake {
  associations: Array<MistakeStudent & { student: Student }>
}

export default function MistakeCard({ mistake, onClick }: { mistake: MistakeCardData; onClick?: () => void }) {
  const assoc = mistake.associations.slice(0, 3)
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-base)', padding: '12px 14px',
        boxShadow: 'var(--shadow-card)', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--color-text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
        {mistake.question_text}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* 题型/难度用中性描边，把彩色让给掌握状态（04-05 每卡彩色区 ≤2） */}
        <Tag style={{ marginInlineEnd: 0, color: 'var(--color-textSecondary)', borderColor: 'var(--color-border)' }}>{mistake.question_type}</Tag>
        <Tag style={{ marginInlineEnd: 0, color: 'var(--color-textSecondary)', borderColor: 'var(--color-border)' }}>{difficultyLabel[mistake.difficulty]}</Tag>
        <Tag style={{ marginInlineEnd: 0 }}>{mistake.source === 'homework' ? '作业' : mistake.source === 'test' ? '测验' : '自测'}</Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {assoc.map((a, i) => (
            <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -6, border: '2px solid var(--color-bgContainer)', borderRadius: '50%' }}>
              <StudentAvatar student={a.student} size={22} />
            </div>
          ))}
          {mistake.associations.length > 3 ? <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>{'+' + (mistake.associations.length - 3)}</span> : null}
        </div>
        {assoc[0] ? <MasteryTag mastery={assoc[0].mastery} /> : null}
      </div>
      {assoc[0] ? <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>{'错因：' + (causeLabel[assoc[0].cause] ?? assoc[0].cause)}</div> : null}
    </div>
  )
}
