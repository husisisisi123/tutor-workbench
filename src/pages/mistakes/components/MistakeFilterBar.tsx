// 错题库顶部筛选条（#7 04-03）：科目 / 知识点级联 / 题型 / 难度四维 + 已选 chips 回显。
// 为什么筛选值不出现在本组件的 state 里：全部由页面从 URL query 派生后传进来，
// 变更只走 onPatch 写回 URL。这样刷新、深链、清空筛选、已选 chips 只有一条链路，
// 不会出现「本地选择与地址栏不一致」——04-03 要求可刷新可深链，本地态会破坏它。
import { Button, Cascader, Select, Tag } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import type { Tag as KnowledgeTag } from '@/types'
import { DIFFICULTY_LABEL, QUESTION_TYPES } from './mistakeOptions'
import { buildTagTree, SUBJECT_ORDER, tagPath } from './tagTree'

export interface MistakeFilterState {
  subject?: string
  tagId?: string
  questionType?: string
  difficulty?: number
}

interface Props {
  tags: KnowledgeTag[]
  state: MistakeFilterState
  resultCount: number
  totalCount: number
  /** 把变更写回 URL query；undefined 表示删除该维。 */
  onPatch: (patch: Record<string, string | undefined>) => void
  onClear: () => void
}

export default function MistakeFilterBar({ tags, state, resultCount, totalCount, onPatch, onClear }: Props) {
  const tree = buildTagTree(tags)
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const activeTag = state.tagId ? tagById.get(state.tagId) : undefined
  const hasAny = Boolean(state.subject || state.tagId || state.questionType || state.difficulty)

  // 已选 chips：每个活跃维度一个可关闭标签；关闭即从 URL 删除对应键（04-03）。
  const chips: Array<{ key: string; label: string; onClose: () => void }> = []
  if (state.subject) chips.push({ key: 'subject', label: '科目：' + state.subject, onClose: () => onPatch({ subject: undefined }) })
  if (state.tagId) {
    chips.push({ key: 'tag', label: '知识点：' + (activeTag?.name ?? state.tagId), onClose: () => onPatch({ tag: undefined }) })
  }
  if (state.questionType) chips.push({ key: 'type', label: '题型：' + state.questionType, onClose: () => onPatch({ type: undefined }) })
  if (state.difficulty) {
    const label = DIFFICULTY_LABEL[state.difficulty] ?? String(state.difficulty)
    chips.push({ key: 'difficulty', label: '难度：' + label, onClose: () => onPatch({ difficulty: undefined }) })
  }

  return (
    <div style={{ background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-base)', boxShadow: 'var(--shadow-card)', padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-textSecondary)', fontSize: 13 }}>
          <FilterOutlined aria-hidden /> 筛选
        </span>
        <Select
          allowClear
          placeholder="全部科目"
          value={state.subject}
          style={{ width: 120 }}
          options={SUBJECT_ORDER.map((s) => ({ value: s, label: s }))}
          onChange={(v) => {
            // 科目变化时若当前知识点不属于新科目，同步清掉知识点，避免 AND 后必空（筛选口径可解释）
            const nextSubject = v ?? undefined
            const patch: Record<string, string | undefined> = { subject: nextSubject }
            if (activeTag && nextSubject && activeTag.subject !== nextSubject) patch.tag = undefined
            onPatch(patch)
          }}
        />
        <Cascader
          allowClear
          changeOnSelect
          placeholder="全部知识点"
          style={{ width: 220 }}
          options={tree}
          value={tagPath(state.tagId, tags)}
          displayRender={(labels) => labels.join(' / ')}
          showSearch={{ filter: (input, path) => path.some((o) => String(o.label).includes(input)) }}
          onChange={(value) => {
            const last = value && value.length ? String(value[value.length - 1]) : undefined
            if (!last) {
              onPatch({ tag: undefined })
              return
            }
            // 合成科目根节点（subject:数学…）只设科目；真实 tag id 才设知识点，并把科目对齐到该标签（一选中就能看懂口径）
            if (last.startsWith('subject:')) {
              onPatch({ subject: last.slice('subject:'.length), tag: undefined })
            } else {
              const tag = tagById.get(last)
              onPatch({ tag: last, subject: tag?.subject })
            }
          }}
        />
        <Select
          allowClear
          placeholder="全部题型"
          value={state.questionType}
          style={{ width: 130 }}
          options={QUESTION_TYPES.map((t) => ({ value: t, label: t }))}
          onChange={(v) => onPatch({ type: v ?? undefined })}
        />
        <Select
          allowClear
          placeholder="全部难度"
          value={state.difficulty}
          style={{ width: 120 }}
          options={[1, 2, 3].map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
          onChange={(v) => onPatch({ difficulty: v === undefined || v === null ? undefined : String(v) })}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-textSecondary)' }} className="num">
          共 {resultCount} / {totalCount} 题
        </span>
        {hasAny ? (
          <Button type="link" style={{ paddingInline: 4 }} onClick={onClear}>
            清空筛选
          </Button>
        ) : null}
      </div>
      {chips.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-textSecondary)' }}>已选：</span>
          {chips.map((c) => (
            <Tag key={c.key} closable onClose={c.onClose} style={{ marginInlineEnd: 0 }}>
              {c.label}
            </Tag>
          ))}
        </div>
      ) : null}
    </div>
  )
}
