import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './layout/AppLayout'
import { AppRoutes } from './router'
import { antdTheme } from './theme/antdTheme'

// 全局壳：ConfigProvider（设计 token 单一来源）+ AntApp（hook 版 message/Modal，见 #9 核对项 11）。
export default function App() {
  return (
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <AntApp>
        <AppLayout>
          <AppRoutes />
        </AppLayout>
      </AntApp>
    </ConfigProvider>
  )
}
