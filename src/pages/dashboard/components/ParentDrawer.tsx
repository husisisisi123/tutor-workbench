import { Button, Drawer, Input } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import StudentAvatar from '@/components/StudentAvatar'
import type { Feedback, ParentMessage, Student } from '@/types'

// 家长互动右侧抽屉（#13 / 01-12 / 01-13）。
// 数据流：DashboardPage 已拉回 listParentMessages + listFeedbacks → 本组件按 student_id 聚合，
// 每个学生内部再按 feedback_id 分会话（来源反馈的日期 + 科目），消息平铺展示（无标题、无独立状态）。
// 未读口径：只有 from='parent' 且 read=false 计入；打开抽屉即把「当前选中学生」的未读标已读
// （api.markStudentMessagesRead 后页面 reload，看板区块与汇总同步下降）。
// 回复只写内存（刷新回种子，GL-28）：追加一条 from='teacher'，会话由「待回复」派生为「已回复」。

interface FeedbackGroup {
  feedbackId: string
  date: string
  subjects: string
  messages: ParentMessage[]
  replied: boolean
}

interface StudentThread {
  student: Student
  messages: ParentMessage[]
  unread: number
  latestAt: string
}

/** 同一学生的消息按 feedback_id 分会话；日期/科目取挂载的那条反馈（#13 Q2：每条留言必须挂已发布反馈）。 */
function groupByFeedback(messages: ParentMessage[], feedbacks: Feedback[]): FeedbackGroup[] {
  const feedbackById = new Map(feedbacks.map((f) => [f.id, f]))
  const grouped = new Map<string, ParentMessage[]>()
  for (const message of messages) {
    if (!grouped.has(message.feedback_id)) grouped.set(message.feedback_id, [])
    grouped.get(message.feedback_id)!.push(message)
  }
  return [...grouped.entries()]
    .map(([feedbackId, list]) => {
      const feedback = feedbackById.get(feedbackId)
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const subjects = feedback && feedback.subject_details.length
        ? feedback.subject_details.map((detail) => detail.subject).join(' · ')
        : '综合'
      return {
        feedbackId,
        date: feedback?.date ?? sorted[0]?.created_at.slice(0, 10) ?? '',
        subjects,
        messages: sorted,
        replied: sorted.some((message) => message.from === 'teacher'),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.feedbackId.localeCompare(b.feedbackId))
}

export default function ParentDrawer({
  open,
  onClose,
  initialStudentId,
  students,
  messages,
  feedbacks,
  isMobile,
  onMarkRead,
  onReply,
}: {
  open: boolean
  onClose: () => void
  initialStudentId?: string
  students: Student[]
  messages: ParentMessage[]
  feedbacks: Feedback[]
  isMobile: boolean
  onMarkRead: (studentId: string) => Promise<void>
  onReply: (studentId: string, feedbackId: string, content: string) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // undefined = 本次打开还没初始化；null = 本次打开的入口没指定学生。两者必须区分，
  // 否则从「全部留言」进入（无入口学生）会被当成已初始化，抽屉里选不中任何学生。
  const initializedFor = useRef<string | null | undefined>(undefined)

  // 每次渲染重算、不 useMemo：listParentMessages 返回的是 db.parentMessages 的同一个数组引用，
  // 「已读 / 回复」是原地 push 与原字段 mutate；按引用做 memo 会导致 reload 后账面上数据变了、
  // 抽屉里却还是旧消息（实测：回复不出现、未读徽标不降）。数据量只有 10 余条，重算成本可忽略。
  const grouped = new Map<string, ParentMessage[]>()
  for (const message of messages) {
    if (!grouped.has(message.student_id)) grouped.set(message.student_id, [])
    grouped.get(message.student_id)!.push(message)
  }
  const threads: StudentThread[] = students
    .filter((student) => grouped.has(student.id))
    .map((student) => {
      const list = [...grouped.get(student.id)!].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return {
        student,
        messages: list,
        unread: list.filter((message) => message.from === 'parent' && !message.read).length,
        latestAt: list[list.length - 1]?.created_at ?? '',
      }
    })
    // 未读优先、最近优先（#13 Q6：与看板区块同一排序口径）
    .sort((a, b) => b.unread - a.unread || b.latestAt.localeCompare(a.latestAt))

  const totalUnread = threads.reduce((sum, thread) => sum + thread.unread, 0)
  const current = threads.find((thread) => thread.student.id === selectedId)
  const groups = current ? groupByFeedback(current.messages, feedbacks) : []
  const replyTarget = groups[groups.length - 1]

  // 打开抽屉时定位：入口指定的学生 > 第一个有未读的学生 > 第一个有留言的学生（只在打开/换入口时初始化一次）。
  useEffect(() => {
    if (!open) {
      initializedFor.current = undefined
      return
    }
    const init = initialStudentId ?? null
    if (initializedFor.current !== undefined && initializedFor.current === init) return
    initializedFor.current = init
    const firstUnread = threads.find((thread) => thread.unread > 0)?.student.id
    setSelectedId(init ?? firstUnread ?? threads[0]?.student.id)
  }, [open, initialStudentId, threads])

  // 选中学生后立即标已读：user 已经看到消息，未读继续留着会让看板数字失真（#13 Q6）。
  // 依赖「当前学生的未读数」而不是整个 threads 数组：threads 每次渲染都是新数组，
  // 依赖它会让 effect 在草稿输入等无关渲染时重复触发接口；未读数归 0 后自然停住。
  const selectedUnread = threads.find((thread) => thread.student.id === selectedId)?.unread ?? 0
  useEffect(() => {
    if (!open || !selectedId || selectedUnread === 0) return
    void onMarkRead(selectedId)
  }, [open, selectedId, selectedUnread, onMarkRead])

  useEffect(() => {
    setDraft('')
  }, [selectedId])

  const send = async () => {
    const content = draft.trim()
    if (!content || !selectedId || !replyTarget) return
    setSending(true)
    try {
      await onReply(selectedId, replyTarget.feedbackId, content)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={isMobile ? '100%' : 520}
      title="家长互动"
      extra={<span className="db-drawer-sub">{totalUnread} 条未读</span>}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      {threads.length === 0 ? (
        <div className="db-empty">暂无家长留言</div>
      ) : (
        <>
          <div className="db-parent-tabs" role="tablist" aria-label="按学生选择会话">
            {threads.map((thread) => (
              <button
                key={thread.student.id}
                type="button"
                role="tab"
                aria-selected={thread.student.id === selectedId}
                className={'db-parent-tab' + (thread.student.id === selectedId ? ' db-parent-tab--active' : '')}
                onClick={() => setSelectedId(thread.student.id)}
              >
                <StudentAvatar student={thread.student} size={26} />
                <span>{thread.student.name}</span>
                {thread.unread > 0 ? <span className="db-unread">{thread.unread}</span> : null}
              </button>
            ))}
          </div>

          <div className="db-parent-body">
            {groups.length === 0 ? (
              <div className="db-empty">该学生暂无留言</div>
            ) : (
              groups.map((group) => (
                <section key={group.feedbackId} className="db-msg-group">
                  <div className="db-msg-group__head">
                    来源反馈 · {group.date} · {group.subjects}
                    {group.replied ? <span className="db-muted">已回复</span> : null}
                  </div>
                  {group.messages.map((message) => (
                    <div key={message.id} className={'db-msg db-msg--' + message.from}>
                      <div className="db-msg__bubble">{message.content}</div>
                      <div className="db-msg__time">
                        {message.from === 'teacher' ? '老师 · ' : '家长 · '}
                        {dayjs(message.created_at).format('MM-DD HH:mm')}
                      </div>
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>

          <div className="db-composer">
            <div className="db-composer__hint">
              {replyTarget
                ? '回复至 ' + replyTarget.date + ' 的反馈（' + replyTarget.subjects + '）'
                : '当前没有可回复的反馈'}
            </div>
            <div className="db-composer__row">
              <Input.TextArea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="输入回复，发送后追加到该反馈会话…"
                aria-label="回复家长"
              />
              <Button type="primary" disabled={!draft.trim()} loading={sending} onClick={() => void send()}>
                发送
              </Button>
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}
