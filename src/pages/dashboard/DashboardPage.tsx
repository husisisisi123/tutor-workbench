import { SettingOutlined } from '@ant-design/icons'
import { Button, Skeleton } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { useLoad } from '@/hooks/useLoad'
import {
  MOCK_TODAY,
  getDashboardConfig,
  getDashboardSummary,
  getParentInteractions,
  listFeedbacks,
  listParentMessages,
  listStudents,
  markStudentMessagesRead,
  replyToParent,
  saveDashboardConfig,
} from '@/mock/api'
import { backgroundCss } from '@/mock/backgrounds'
import type { DashboardConfig } from '@/types'
import { feedbackDateOf } from './derive'
import CustomizeDrawer, { type CustomizeTab } from './components/CustomizeDrawer'
import MainBlocks from './components/MainBlocks'
import ParentDrawer from './components/ParentDrawer'
import WidgetColumn from './components/WidgetColumn'
import { useIsMobile } from './hooks/useMediaQuery'
import './dashboard.css'

// P1 首页看板（#6 + #13）。页面是本模块唯一的数据入口，四块内容与右栏挂件共用同一次拉取：
// 1) useLoad 一次并发拉 summary / interactions / students / feedbacks / parentMessages
//    —— 四块内容全部由这些原始记录派生（derive.ts），不建独立视图表、不写回存储（01-02）；
// 2) config（背景 + 挂件顺序/显隐 + 快捷链接）单独加载，改动立即进 state 做实时预览，
//    再防抖 300ms 落 twb:v1:dashboard（01-03/01-07，无保存按钮）；
// 3) 家长抽屉里的「已读 / 假回复」只进内存，操作后 reload 让看板区块计数同步下降，
//    刷新页面回到种子口径（01-13 / GL-28）。
export default function DashboardPage() {
  const isMobile = useIsMobile()

  const { data, reload } = useLoad(async () => {
    const [summary, interactions, students, todayFeedbacks, messages] = await Promise.all([
      getDashboardSummary(),
      getParentInteractions(),
      listStudents(),
      listFeedbacks(),
      listParentMessages(),
    ])
    // 家长留言可能挂在 10-28/10-29 的反馈上（#13：覆盖 ≥2 个反馈日），
    // listFeedbacks() 默认只取今天 → 按 feedback_id 反查缺失日期补齐，
    // 四块的待办/日程仍只用今天的单（todayFeedbacks），抽屉用 feedbacks 全量还原来源科目。
    const extraDates = [...new Set(messages.map((message) => feedbackDateOf(message.feedback_id)))]
      .filter((date) => date && date !== MOCK_TODAY)
    const extraFeedbacks = extraDates.length
      ? (await Promise.all(extraDates.map((date) => listFeedbacks(date)))).flat()
      : []
    return {
      summary,
      interactions,
      students,
      todayFeedbacks,
      messages,
      feedbacks: [...todayFeedbacks, ...extraFeedbacks],
    }
  }, [])

  // 配置只在挂载时读一次：之后以 state 为唯一事实源（实时预览），写入走防抖。
  const [config, setConfig] = useState<DashboardConfig | undefined>()
  useEffect(() => {
    let alive = true
    void getDashboardConfig().then((next) => {
      if (alive) setConfig(next)
    })
    return () => {
      alive = false
    }
  }, [])

  // 防抖写盘：300ms（#6 Q10=A）。skipFirstSave 防止「刚读出来的配置」立刻又写一次；
  // 卸载时 clearTimeout，避免把关闭前的中间态写进 localStorage。
  const skipFirstSave = useRef(true)
  useEffect(() => {
    if (!config) return
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void saveDashboardConfig(config)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [config])

  const [parentsOpen, setParentsOpen] = useState(false)
  const [parentsStudent, setParentsStudent] = useState<string | undefined>()
  const openParents = useCallback((studentId?: string) => {
    setParentsStudent(studentId)
    setParentsOpen(true)
  }, [])

  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeTab, setCustomizeTab] = useState<CustomizeTab>('background')
  const openCustomize = useCallback((tab: CustomizeTab) => {
    setCustomizeTab(tab)
    setCustomizeOpen(true)
  }, [])

  // 标已读 / 回复都走 mock api，然后 reload：看板区块与汇总的数字跟着变，抽屉拿到最新消息列表。
  const handleMarkRead = useCallback(
    async (studentId: string) => {
      await markStudentMessagesRead(studentId)
      reload()
    },
    [reload],
  )
  const handleReply = useCallback(
    async (studentId: string, feedbackId: string, content: string) => {
      await replyToParent(feedbackId, studentId, content)
      reload()
    },
    [reload],
  )

  const backgroundStyle = useMemo(() => backgroundCss(config?.background ?? { kind: 'default' }), [config])

  return (
    <div className="page dashboard" style={{ background: backgroundStyle }}>
      <div className="db-headband">
        <PageHeader
          title="首页看板"
          summary={
            data ? (
              <span className="db-summary">
                <span>
                  已写 <b>{data.summary.written}</b>/{data.summary.total}
                </span>
                <span className="db-summary__dot" aria-hidden>
                  ·
                </span>
                <span>
                  待审核 <b>{data.summary.pendingReview}</b>
                </span>
                <span className="db-summary__dot" aria-hidden>
                  ·
                </span>
                <span>
                  预警 <b>{data.summary.warnings.length}</b>
                </span>
              </span>
            ) : (
              '加载中…'
            )
          }
          extra={
            <Button type="primary" icon={<SettingOutlined />} onClick={() => openCustomize('background')}>
              自定义
            </Button>
          }
        />
      </div>

      {data && config ? (
        <div className="db-main">
          <div className="db-blocks">
            <MainBlocks
              summary={data.summary}
              interactions={data.interactions}
              students={data.students}
              feedbacks={data.todayFeedbacks}
              onOpenParents={openParents}
            />
          </div>
          <WidgetColumn config={config} onChange={setConfig} onOpenCustomize={openCustomize} />
        </div>
      ) : (
        <div className="db-headband">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      )}

      {config ? (
        <CustomizeDrawer
          open={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          config={config}
          onChange={setConfig}
          isMobile={isMobile}
          defaultTab={customizeTab}
        />
      ) : null}

      {data ? (
        <ParentDrawer
          open={parentsOpen}
          onClose={() => setParentsOpen(false)}
          initialStudentId={parentsStudent}
          students={data.students}
          messages={data.messages}
          feedbacks={data.feedbacks}
          isMobile={isMobile}
          onMarkRead={handleMarkRead}
          onReply={handleReply}
        />
      ) : null}
    </div>
  )
}