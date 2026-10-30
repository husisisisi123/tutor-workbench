import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Input, Switch, Tabs } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { BACKGROUND_PRESETS } from '@/mock/backgrounds'
import type { DashboardConfig, QuickLink, WidgetKey } from '@/types'
import { WIDGET_META, isHttpUrl, moveWidgetBy, setWidgetVisible, sortWidgets } from '../derive'
import { encodeBackgroundImage } from '../backgroundImage'

// 右上「自定义」→ 右侧 420px 抽屉，三 Tab（背景 / 挂件 / 快捷链接），无保存按钮（01-03）。
// 为什么无保存按钮：Q10=A 定的是「不遮主区的实时预览」——抽屉打开时主区就在左边，
// 改动立刻反映到 config（页面背景/挂件列实时变），再防抖 300ms 写入 twb:v1:dashboard；
// 多一个保存按钮反而会出现「预览已变、没点保存就关掉」的不一致。
// 移动端整抽屉转全屏 Sheet（01-11）。

export type CustomizeTab = 'background' | 'widgets' | 'links'

export default function CustomizeDrawer({
  open,
  onClose,
  config,
  onChange,
  isMobile,
  defaultTab,
}: {
  open: boolean
  onClose: () => void
  config: DashboardConfig
  onChange: (next: DashboardConfig) => void
  isMobile: boolean
  defaultTab: CustomizeTab
}) {
  const [tab, setTab] = useState<CustomizeTab>(defaultTab)
  const [encoding, setEncoding] = useState(false)
  const [hint, setHint] = useState<{ text: string; warn?: boolean } | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)

  // 每次打开都按入口 tab 重新落位（例如从右栏「编辑快捷链接」进来直接到第三 Tab）
  useEffect(() => {
    if (open) {
      setTab(defaultTab)
      setHint(undefined)
    }
  }, [open, defaultTab])

  const background = config.background
  const activePreset = background.kind === 'preset' ? background.presetId : undefined

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    setEncoding(true)
    setHint(undefined)
    const encoded = await encodeBackgroundImage(file)
    setEncoding(false)
    if (!encoded) {
      // 解码失败静默回退：保留当前背景，只在抽屉里留一行说明，绝不弹错误框（01-06）
      setHint({ text: '图片无法解码，已保留当前背景（静默回退，不弹框）', warn: true })
      return
    }
    onChange({ ...config, background: { kind: 'image', imageDataUrl: encoded.dataUrl } })
    const kb = Math.round(encoded.bytes / 1024)
    setHint({
      text: '已重编码 WebP：长边 ' + encoded.edge + 'px · ' + kb + 'KB（目标 <400KB）',
      warn: encoded.bytes > 400 * 1024,
    })
  }

  const visible = sortWidgets(config.widgets).filter((w) => w.visible)

  const updateLink = (id: string, patch: Partial<QuickLink>) => {
    onChange({ ...config, links: config.links.map((link) => (link.id === id ? { ...link, ...patch } : link)) })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={isMobile ? '100%' : 420}
      title="自定义看板"
      mask={false}
      extra={<span className="db-drawer-sub">改动自动保存</span>}
      styles={{ body: { padding: 16 } }}
    >
      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as CustomizeTab)}
        items={[
          {
            key: 'background',
            label: '背景',
            children: (
              <div className="db-cfg">
                <div className="db-cfg__label">预设背景（4 套纯 CSS 渐变，零位图）</div>
                <div className="db-preset-grid">
                  {BACKGROUND_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={'db-preset' + (activePreset === preset.id ? ' db-preset--active' : '')}
                      style={{ background: preset.gradient }}
                      aria-pressed={activePreset === preset.id}
                      onClick={() => onChange({ ...config, background: { kind: 'preset', presetId: preset.id } })}
                    >
                      <span className="db-preset__name">{preset.name}</span>
                      {activePreset === preset.id ? (
                        <span className="db-preset__check">
                          <CheckOutlined />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="db-cfg__label">自定义背景图</div>
                <div className="db-cfg__actions">
                  <Button icon={<UploadOutlined />} loading={encoding} onClick={() => fileRef.current?.click()}>
                    上传图片
                  </Button>
                  <Button type="text" onClick={() => onChange({ ...config, background: { kind: 'default' } })}>
                    恢复默认
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      void onPickFile(file)
                    }}
                  />
                </div>

                {background.kind === 'image' && background.imageDataUrl ? (
                  <div className="db-bg-preview">
                    <img src={background.imageDataUrl} alt="当前自定义背景" />
                    <span>当前背景 · 重编码 WebP</span>
                  </div>
                ) : null}

                {hint ? <p className={'db-hint' + (hint.warn ? ' db-hint--warn' : '')}>{hint.text}</p> : null}
                <p className="db-hint">
                  上传图只做重编码（长边 1600 · 目标 &lt;400KB · WebP），不取色、不改卡片中性层（#14 定案）；解码失败自动保留原背景。
                </p>
              </div>
            ),
          },
          {
            key: 'widgets',
            label: '挂件',
            children: (
              <div className="db-cfg">
                <p className="db-hint">
                  右栏 4 个挂件，桌面可直接拖动换位（只在右栏内纵向）；这里用 ↑↓ 按钮改顺序，与拖拽共享同一份 order。
                </p>
                <div>
                  {sortWidgets(config.widgets).map((widget) => {
                    const visibleIndex = visible.findIndex((w) => w.key === widget.key)
                    return (
                      <div
                        key={widget.key}
                        className={'db-cfg-row' + (widget.visible ? '' : ' db-cfg-row--hidden')}
                      >
                        <span className="db-cfg-row__grip" aria-hidden>
                          <HolderOutlined />
                        </span>
                        <span className="db-cfg-row__name">
                          {WIDGET_META[widget.key].name}
                          <span className="db-cfg-row__hint"> · {WIDGET_META[widget.key].hint}</span>
                        </span>
                        <button
                          type="button"
                          className="db-iconbtn"
                          aria-label={'上移' + WIDGET_META[widget.key].name}
                          disabled={!widget.visible || visibleIndex <= 0}
                          onClick={() => onChange({ ...config, widgets: moveWidgetBy(config.widgets, widget.key as WidgetKey, -1) })}
                        >
                          <ArrowUpOutlined />
                        </button>
                        <button
                          type="button"
                          className="db-iconbtn"
                          aria-label={'下移' + WIDGET_META[widget.key].name}
                          disabled={!widget.visible || visibleIndex >= visible.length - 1}
                          onClick={() => onChange({ ...config, widgets: moveWidgetBy(config.widgets, widget.key as WidgetKey, 1) })}
                        >
                          <ArrowDownOutlined />
                        </button>
                        <Switch
                          size="small"
                          checked={widget.visible}
                          aria-label={'显示' + WIDGET_META[widget.key].name}
                          onChange={(checked) =>
                            onChange({ ...config, widgets: setWidgetVisible(config.widgets, widget.key, checked) })
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ),
          },
          {
            key: 'links',
            label: '快捷链接',
            children: (
              <div className="db-cfg">
                <p className="db-hint">
                  默认 3 条；缺内置图标的链接自动降级为首字母圆标。URL 需 http(s)，不合法会标红但照常保存（#6 Q6）。
                </p>
                {config.links.map((link) => {
                  const invalid = !isHttpUrl(link.url)
                  return (
                    <div key={link.id} className="db-link-row">
                      <div className="db-link-row__fields">
                        <Input
                          size="small"
                          value={link.name}
                          maxLength={12}
                          placeholder="名称"
                          aria-label="链接名称"
                          onChange={(event) => updateLink(link.id, { name: event.target.value })}
                        />
                        <Input
                          size="small"
                          value={link.url}
                          placeholder="https://"
                          aria-label="链接地址"
                          status={invalid ? 'error' : undefined}
                          onChange={(event) => updateLink(link.id, { url: event.target.value })}
                        />
                        {invalid ? <span className="db-link-row__err">需 http(s) 开头，仍会保存</span> : null}
                      </div>
                      <Button
                        type="text"
                        size="small"
                        danger
                        aria-label={'删除' + link.name}
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          onChange({ ...config, links: config.links.filter((item) => item.id !== link.id) })
                        }
                      />
                    </div>
                  )
                })}
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  onClick={() =>
                    onChange({
                      ...config,
                      links: [
                        ...config.links,
                        { id: 'link-' + Date.now(), name: '新链接', url: 'https://' },
                      ],
                    })
                  }
                >
                  添加链接
                </Button>
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  )
}