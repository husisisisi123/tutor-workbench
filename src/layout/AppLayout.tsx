import {
  BookOutlined,
  DashboardOutlined,
  FormOutlined,
  LineChartOutlined,
  MenuOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Drawer, Grid, Layout, Menu } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// 五页导航（#11/#12 定案）：首页看板 / 每日反馈 / 学生档案 / 错题库 / 成长规划。
// 菜单与路由表分开：菜单只关心「名字 + 图标 + 路径」，路由还要挂页面组件。
export const NAV_ITEMS = [
  { key: '/', label: '首页看板', icon: <DashboardOutlined /> },
  { key: '/feedback', label: '每日反馈', icon: <FormOutlined /> },
  { key: '/students', label: '学生档案', icon: <TeamOutlined /> },
  { key: '/mistakes', label: '错题库', icon: <BookOutlined /> },
  { key: '/growth', label: '成长规划', icon: <LineChartOutlined /> },
]

// 顶栏日期用 mock 当前日期（#8 裁决：页面 mock 当前日期），不跟随系统时间，保证种子可复现。
const MOCK_TODAY = '2026-10-30'

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 14px' }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: 'var(--radius-base)', background: 'var(--color-primary)',
          color: 'var(--color-onPrimary)', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 14,
        }}
      >
        托
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>托管教务</div>
        <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>教师工作台 · Demo</div>
      </div>
    </div>
  )
}

function TeacherCard() {
  return (
    <div style={{ padding: 12, background: 'var(--color-bgHover)', borderRadius: 'var(--radius-base)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar size={28} style={{ background: 'var(--color-primaryBg)', color: 'var(--color-primaryText)', fontWeight: 600 }}>王</Avatar>
        <div>
          <div style={{ fontSize: 13, color: 'var(--color-text)' }}>王老师</div>
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>26 秋季 · 一号教室</div>
        </div>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  // md 以下（<768px）收起侧栏，改 Drawer：375px 视口内容至少保留 ~350px 可用宽度（GL-27）。
  const isMobile = !screens.md
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 详情页 /students/:id 也高亮「学生档案」
  const selected = useMemo(() => {
    const first = '/' + location.pathname.split('/').filter(Boolean)[0]
    return NAV_ITEMS.some((i) => i.key === first) ? first : '/'
  }, [location.pathname])
  const current = NAV_ITEMS.find((i) => i.key === selected)

  const go = (key: string) => {
    navigate(key)
    setDrawerOpen(false)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile ? (
        <Layout.Sider
          theme="light"
          width={220}
          style={{ borderRight: '1px solid var(--color-border)', position: 'sticky', top: 0, height: '100vh' }}
        >
          <Brand />
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={NAV_ITEMS}
            onClick={({ key }) => go(key)}
            style={{ borderInlineEnd: 'none', padding: '4px 8px' }}
          />
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
            <TeacherCard />
          </div>
        </Layout.Sider>
      ) : null}
      <Layout>
        <Layout.Header
          style={{
            background: 'var(--color-bgContainer)', padding: isMobile ? '0 12px' : '0 24px', height: 56, lineHeight: '56px',
            borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {isMobile ? (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="打开导航" />
            ) : null}
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)' }}>{current?.label ?? ''}</div>
          </div>
          {!isMobile ? (
            <div style={{ fontSize: 13, color: 'var(--color-textSecondary)' }} className="num">
              {dayjs(MOCK_TODAY).format('YYYY 年 M 月 D 日 dddd')}
            </div>
          ) : null}
        </Layout.Header>
        <Layout.Content style={{ background: 'var(--color-bgLayout)', minWidth: 0 }}>{children}</Layout.Content>
      </Layout>
      <Drawer
        placement="left"
        width={248}
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
        title={null}
      >
        <Brand />
        <Menu mode="inline" selectedKeys={[selected]} items={NAV_ITEMS} onClick={({ key }) => go(key)} style={{ borderInlineEnd: 'none' }} />
        <div style={{ padding: 16 }}>
          <TeacherCard />
        </div>
      </Drawer>
    </Layout>
  )
}
