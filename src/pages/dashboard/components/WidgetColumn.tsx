import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  FileTextOutlined,
  HeartOutlined,
  HolderOutlined,
  LinkOutlined,
  ReadOutlined,
  SettingOutlined,
  WechatOutlined,
} from '@ant-design/icons'
import { Switch } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DashboardConfig, DashboardWidget, QuickLink, WidgetKey } from '@/types'
import {
  DEMO_NEWS,
  DEMO_WEATHER,
  WIDGET_META,
  WEEKDAYS,
  initialHue,
  isHttpUrl,
  moveWidgetBy,
  moveWidgetTo,
  setWidgetVisible,
  sortWidgets,
} from '../derive'

// 右栏 320px 挂件列（01-01 / 01-08 / 01-09）。
// 交互双通道：桌面 HTML5 DnD 只在「本列 4 个挂件内纵向换位」（不跨区、不引 @dnd-kit）；
// 移动端靠 ↑↓ 按钮，hover/focus 时桌面也显示同一组按钮——DnD 本身不可键盘操作，按钮是 a11y 补救。
// 所有顺序/显隐改动都写回 config（DashboardPage 防抖 300ms 落 twb:v1:dashboard），组件内不另存状态。

const WIDGET_ICONS: Record<string, ReactNode> = {
  clock: <ClockCircleOutlined />,
  weather: <CloudOutlined />,
  news: <ReadOutlined />,
  links: <LinkOutlined />,
}

// 内置图标按 mock 种子里的 slug 映射（Simple Icons slug 逐个核对过 xiaohongshu/wechat/tencentdocs 的存在性，
// 这里用 @ant-design/icons 的内联 SVG 顶点，避免引入外链图标库；slug 不在表里就降级成首字母哈希圆标，永不为空）。
const LINK_ICONS: Record<string, ReactNode> = {
  xiaohongshu: <HeartOutlined />,
  wechat: <WechatOutlined />,
  tencentdocs: <FileTextOutlined />,
}

export default function WidgetColumn({
  config,
  onChange,
  onOpenCustomize,
}: {
  config: DashboardConfig
  onChange: (next: DashboardConfig) => void
  onOpenCustomize: (tab: 'background' | 'widgets' | 'links') => void
}) {
  // 时钟每秒走字：清理 interval，避免切页后还在 setState
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const sorted = useMemo(() => sortWidgets(config.widgets), [config.widgets])
  const visible = sorted.filter((w) => w.visible)
  const [dragKey, setDragKey] = useState<WidgetKey | undefined>()
  const [overKey, setOverKey] = useState<WidgetKey | undefined>()

  const moveBy = (widget: DashboardWidget, dir: -1 | 1) => {
    onChange({ ...config, widgets: moveWidgetBy(config.widgets, widget.key, dir) })
  }

  const renderBody = (widget: DashboardWidget) => {
    if (widget.key === 'clock') {
      return (
        <div className="db-clock">
          <div className="db-clock__time">{dayjs(now).format('HH:mm:ss')}</div>
          <div className="db-clock__date">
            {dayjs(now).format('YYYY 年 M 月 D 日')} · {WEEKDAYS[now.getDay()]}
          </div>
          <div className="db-clock__term">26 秋季学期 · 一号教室</div>
        </div>
      )
    }
    if (widget.key === 'weather') {
      return (
        <div className="db-weather">
          <div className="db-weather__main">
            <span className="db-weather__temp">{DEMO_WEATHER.temp}°</span>
            <span className="db-weather__cond">{DEMO_WEATHER.condition}</span>
          </div>
          <div className="db-weather__grid">
            <span>最高 {DEMO_WEATHER.high}°</span>
            <span>最低 {DEMO_WEATHER.low}°</span>
            <span>湿度 {DEMO_WEATHER.humidity}</span>
            <span>风力 {DEMO_WEATHER.wind}</span>
            <span>空气 {DEMO_WEATHER.quality}</span>
            <span>更新 {DEMO_WEATHER.updated}</span>
          </div>
        </div>
      )
    }
    if (widget.key === 'news') {
      return (
        <ul className="db-news">
          {DEMO_NEWS.map((news) => (
            <li key={news.title}>
              <span className="db-news__tag">{news.tag}</span>
              <span className="db-news__text" title={news.title}>
                {news.title}
              </span>
              <span className="db-news__meta">{news.meta}</span>
            </li>
          ))}
        </ul>
      )
    }
    return (
      <div className="db-links">
        {config.links.map((link) => (
          <QuickLinkChip key={link.id} link={link} />
        ))}
      </div>
    )
  }

  const visibleIdx = (key: string) => visible.findIndex((w) => w.key === key)

  return (
    <aside className="db-rail" aria-label="看板挂件">
      <div className="db-rail__head">
        <span>右栏挂件 · 可拖动换位</span>
        <button
          type="button"
          className="db-iconbtn"
          aria-label="挂件与背景设置"
          onClick={() => onOpenCustomize('widgets')}
        >
          <SettingOutlined />
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="db-widget db-rail-empty">
          全部挂件已隐藏
          <div style={{ marginTop: 8 }}>
            <button type="button" className="db-iconbtn" style={{ width: 'auto', padding: '0 8px' }} onClick={() => onOpenCustomize('widgets')}>
              去恢复显示
            </button>
          </div>
        </div>
      ) : null}

      {visible.map((widget) => {
        const idx = visibleIdx(widget.key)
        const dragging = dragKey === widget.key
        const over = overKey === widget.key && dragKey !== widget.key
        return (
          <section
            key={widget.key}
            className={'db-widget' + (dragging ? ' db-widget--dragging' : '') + (over ? ' db-widget--over' : '')}
            aria-label={WIDGET_META[widget.key].name}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (overKey !== widget.key) setOverKey(widget.key)
            }}
            onDragLeave={() => setOverKey((prev) => (prev === widget.key ? undefined : prev))}
            onDrop={(event) => {
              event.preventDefault()
              if (dragKey && dragKey !== widget.key) {
                onChange({ ...config, widgets: moveWidgetTo(config.widgets, dragKey, widget.key) })
              }
              setDragKey(undefined)
              setOverKey(undefined)
            }}
          >
            <header
              className="db-widget__head"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', widget.key)
                setDragKey(widget.key)
              }}
              onDragEnd={() => {
                setDragKey(undefined)
                setOverKey(undefined)
              }}
              title="拖动调整顺序"
            >
              <span className="db-widget__grip" aria-hidden>
                <HolderOutlined />
              </span>
              <span className="db-widget__name">
                {WIDGET_META[widget.key].name}
              </span>
              <span className="db-widget__ctrls">
                <button
                  type="button"
                  className="db-iconbtn"
                  aria-label={'上移' + WIDGET_META[widget.key].name}
                  disabled={idx <= 0}
                  onClick={() => moveBy(widget, -1)}
                >
                  <ArrowUpOutlined />
                </button>
                <button
                  type="button"
                  className="db-iconbtn"
                  aria-label={'下移' + WIDGET_META[widget.key].name}
                  disabled={idx >= visible.length - 1}
                  onClick={() => moveBy(widget, 1)}
                >
                  <ArrowDownOutlined />
                </button>
                <Switch
                  size="small"
                  checked={widget.visible}
                  aria-label={'显示' + WIDGET_META[widget.key].name}
                  onChange={(checked) => onChange({ ...config, widgets: setWidgetVisible(config.widgets, widget.key, checked) })}
                />
              </span>
            </header>
            <div className="db-widget__body">{renderBody(widget)}</div>
          </section>
        )
      })}
    </aside>
  )
}

/** 快捷链接圆标：有内置图标用图标，否则用「首字母 + 名字哈希色相」圆标（01-09：永不为空）。 */
function QuickLinkChip({ link }: { link: QuickLink }) {
  const valid = isHttpUrl(link.url)
  const icon = link.icon ? LINK_ICONS[link.icon] : undefined
  const hue = initialHue(link.name)
  return (
    <button
      type="button"
      className={'db-link' + (valid ? '' : ' db-link--invalid')}
      title={valid ? link.url : 'URL 不是 http(s)，已标红但保留配置'}
      aria-label={link.name + (valid ? '' : '（URL 不合法）')}
      onClick={() => {
        // 不合法 URL 不打开（避免 javascript: 之类协议被点开），但配置照存不拦保存
        if (valid) window.open(link.url, '_blank', 'noopener,noreferrer')
      }}
    >
      {icon ? (
        <span className="db-link__icon db-link__icon--brand">{icon}</span>
      ) : (
        <span
          className="db-link__icon"
          style={{ background: 'hsl(' + hue + ' 55% 92%)', color: 'hsl(' + hue + ' 45% 32%)' }}
        >
          {link.name.slice(0, 1)}
        </span>
      )}
      <span className="db-link__name">{link.name}</span>
    </button>
  )
}
