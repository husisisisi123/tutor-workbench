// 统一空态：标题 + 一行说明 + 可选操作。避免各页面各写一套「暂无数据」。
export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-textTertiary)' }}>
      <div style={{ fontSize: 13 }}>{title}</div>
      {description ? <div style={{ fontSize: 12, marginTop: 4 }}>{description}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  )
}
