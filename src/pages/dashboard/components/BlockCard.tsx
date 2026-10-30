import type { ReactNode } from 'react'

// 四块内容的统一外壳（01-02）：标题行（图标 / 标题 / 计数 / 右侧动作）+ 三条内容 + 一行汇总。
// 为什么抽出来：四块的间距、边框、汇总行位置必须完全一致，否则 2×2 栅格里会一眼看出参差；
// 这里只负责结构与样式，内容由 MainBlocks 用派生数据填进来（四块内容只算不存）。
export default function BlockCard({
  icon,
  title,
  badge,
  action,
  footer,
  children,
}: {
  icon: ReactNode
  title: string
  badge?: ReactNode
  action?: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <section className="db-card" aria-label={title}>
      <header className="db-card__head">
        <span className="db-card__icon" aria-hidden>{icon}</span>
        <h2 className="db-card__title">{title}</h2>
        {badge != null ? <span className="db-card__badge">{badge}</span> : null}
        {action ? <div className="db-card__extra">{action}</div> : null}
      </header>
      <div className="db-card__body">{children}</div>
      <footer className="db-card__foot">{footer}</footer>
    </section>
  )
}

/** 一条内容行：整行是 button，键盘可点（SC 2.1.1），hover 底色与 focus 环都走 token。 */
export function BlockRow({
  leading,
  title,
  meta,
  extra,
  onClick,
  expanded,
  detail,
  ariaLabel,
}: {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  extra?: ReactNode
  onClick?: () => void
  expanded?: boolean
  detail?: ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className={'db-row' + (expanded ? ' db-row--open' : '')}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={detail ? Boolean(expanded) : undefined}
    >
      {leading}
      <span className="db-row__main">
        <span className="db-row__title">{title}</span>
        {meta ? <span className="db-row__meta">{meta}</span> : null}
        {expanded && detail ? <span className="db-row__detail">{detail}</span> : null}
      </span>
      {extra}
    </button>
  )
}
