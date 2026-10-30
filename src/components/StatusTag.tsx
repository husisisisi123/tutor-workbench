import { Tag } from 'antd'
import { feedbackStatusColor, feedbackStatusLabel, masteryColor, masteryLabel } from '@/utils/format'

// 反馈状态 / 掌握状态统一标签。颜色只用 token 或 AntD 预设，不写裸 hex（DS-1）。
export function FeedbackStatusTag({ status }: { status: string }) {
  return <Tag color={feedbackStatusColor[status]}>{feedbackStatusLabel[status] ?? status}</Tag>
}

export function MasteryTag({ mastery }: { mastery: string }) {
  return (
    <span style={{ color: masteryColor[mastery], fontSize: 12 }}>
      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 4, verticalAlign: 'middle' }} />
      {masteryLabel[mastery] ?? mastery}
    </span>
  )
}
