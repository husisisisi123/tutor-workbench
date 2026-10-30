// 错题详情抽屉（#7 04-05 / 04-09）：题干、答案、解析 + 按学生的错因与掌握就地编辑。
// 为什么「错因/掌握」放在抽屉而不是卡片上：两者属于「某生 × 某题」关联表（#7 数据模型），
// 一题可能被多名学生做错，卡片只叠前 3 个圆标 + 第 1 人的掌握点；抽屉列出全部关联逐条改。
// 运行逻辑：每次下拉变更只调 api.updateMistakeStudent(关联 id, patch)（mock 内存 120ms），
// 成功后回调 onChanged 让页面重拉 listMistakes —— 卡片上的掌握点随之同步，刷新仍回种子（04-08）。
import { App as AntApp, Divider, Drawer, Select, Tag } from 'antd'
import { useState } from 'react'
import type { Mastery, MistakeCause, MistakeStudent, Tag as KnowledgeTag } from '@/types'
import type { MistakeWithStudents } from '@/mock/api'
import * as api from '@/mock/api'
import StudentAvatar from '@/components/StudentAvatar'
import { MasteryTag } from '@/components/StatusTag'
import { CAUSE_OPTIONS, DIFFICULTY_LABEL, MASTERY_OPTIONS, SOURCE_LABEL } from './mistakeOptions'
import { questionTypeColor } from '@/utils/format'
import { useIsMobile } from './useIsMobile'

interface Props {
  open: boolean
  mistake?: MistakeWithStudents
  tagById: Map<string, KnowledgeTag>
  onClose: () => void
  onChanged: () => void
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-textSecondary)', marginBottom: 6 }
const blockStyle: React.CSSProperties = { fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }

export default function MistakeDetailDrawer({ open, mistake, tagById, onClose, onChanged }: Props) {
  const { message } = AntApp.useApp()
  const isMobile = useIsMobile()
  const [savingId, setSavingId] = useState<string>()

  // 掌握状态下拉直接复用共享 MasteryTag 的「圆点 + 文案」，保证抽屉与卡片同一视觉口径（04-05 只染掌握状态）。
  const masteryOptions = MASTERY_OPTIONS.map((o) => ({ value: o.value, label: <MasteryTag mastery={o.value} /> }))
  const causeOptions = CAUSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

  async function patchAssoc(id: string, patch: Partial<Pick<MistakeStudent, 'cause' | 'mastery' | 'note'>>) {
    setSavingId(id)
    try {
      await api.updateMistakeStudent(id, patch)
      message.success('已更新该生的错因/掌握状态')
      onChanged()
    } finally {
      setSavingId(undefined)
    }
  }

  const tags = mistake ? mistake.tag_ids.map((id) => tagById.get(id)).filter(Boolean) as KnowledgeTag[] : []

  return (
    <Drawer open={open} onClose={onClose} width={isMobile ? '100%' : 520} title="错题详情" destroyOnHidden>
      {mistake ? (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <Tag color={questionTypeColor[mistake.question_type]} style={{ marginInlineEnd: 0 }}>{mistake.question_type}</Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{'难度：' + (DIFFICULTY_LABEL[mistake.difficulty] ?? mistake.difficulty)}</Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{SOURCE_LABEL[mistake.source] ?? mistake.source}</Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{mistake.subject}</Tag>
          </div>

          <div style={labelStyle}>题干</div>
          <div style={blockStyle}>{mistake.question_text}</div>

          <div style={{ ...labelStyle, marginTop: 14 }}>答案</div>
          <div style={{ ...blockStyle, color: 'var(--color-primaryText)', fontWeight: 500 }}>{mistake.answer || '—'}</div>

          <div style={{ ...labelStyle, marginTop: 14 }}>解析</div>
          <div style={{ ...blockStyle, color: 'var(--color-textSecondary)' }}>{mistake.analysis || '—'}</div>

          {mistake.images && mistake.images.length ? (
            <>
              <div style={{ ...labelStyle, marginTop: 14 }}>原题图片</div>
              {/* 录入时拍的照片是本地 dataURL，只存在当次页面内存，刷新即失（与「编辑不落盘」同口径） */}
              <img src={mistake.images[0]} alt="原题照片" style={{ maxWidth: '100%', borderRadius: 'var(--radius-base)', border: '1px solid var(--color-border)' }} />
            </>
          ) : null}

          <div style={{ ...labelStyle, marginTop: 14 }}>知识点</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.length ? tags.map((t) => <Tag key={t.id} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>) : <span style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>未关联知识点</span>}
          </div>

          <Divider style={{ margin: '16px 0 8px' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
            学生错因与掌握（{mistake.associations.length} 位）
          </div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>错因与掌握属于「某生 × 某题」，改一条只影响这名学生</div>

          {mistake.associations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-textTertiary)', padding: '12px 0' }}>还没有学生关联记录</div>
          ) : (
            mistake.associations.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
                  borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
                }}
              >
                <StudentAvatar student={a.student} size={28} />
                <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text)' }}>{a.student.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>
                    {a.student.grade} · {SOURCE_LABEL[a.source_type] ?? a.source_type} {a.source_date}
                  </div>
                </div>
                <Select
                  value={a.cause}
                  options={causeOptions}
                  style={{ width: 110 }}
                  loading={savingId === a.id}
                  onChange={(v: MistakeCause) => patchAssoc(a.id, { cause: v })}
                  aria-label={a.student.name + ' 的错因'}
                />
                <Select
                  value={a.mastery}
                  options={masteryOptions}
                  style={{ width: 110 }}
                  loading={savingId === a.id}
                  onChange={(v: Mastery) => patchAssoc(a.id, { mastery: v })}
                  aria-label={a.student.name + ' 的掌握状态'}
                />
              </div>
            ))
          )}
        </div>
      ) : null}
    </Drawer>
  )
}
