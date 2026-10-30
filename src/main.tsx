// 应用入口。执行顺序：主题变量先落到 :root（cssVars），再挂载 React 树，
// 否则首帧会闪一下 AntD 默认蓝（见 #9 决议 4.2「先写 CSS 变量再更新 theme」）。
// React 19 必须加载 v5-patch，否则 message/Modal 静态方法与波纹失效（见 #6 落地约束 1）。
import '@ant-design/v5-patch-for-react-19'
import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/500.css'
import '@fontsource/fira-sans/600.css'
import 'dayjs/locale/zh-cn'
import './styles/global.css'
import dayjs from 'dayjs'

dayjs.locale('zh-cn')
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { applyCssVars } from './theme/cssVars'

applyCssVars()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
