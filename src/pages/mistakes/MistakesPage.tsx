// P4 错题库（#7）：四维筛选 + URL 深链 + 薄弱 TOP3 + 轻卡墙 + 详情/录入抽屉 + 批量改掌握。
// 数据流（单向）：URL query 是筛选的唯一真相 → 页面据此过滤 api.listMistakes() 的返回值 →
// 卡片墙只渲染过滤结果；任何筛选变更都写回 URL（清空=删除全部键），所以刷新/深链/已选 chips 一致。
// 题目与关联全部来自 src/mock/api.ts 的内存态：编辑/录入立即生效，刷新回种子（04-08）。
// 轻卡统一用共享 src/components/MistakeCard.tsx（04-11：错题库页与学生档案 Tab 同一呈现）。
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { App as AntApp, Button, Checkbox, Modal, Select, Spin, Tag } from 'antd'
import { CameraOutlined, PlusOutlined } from '@ant-design/icons'
import PageHeader from '@/components/PageHeader'
import MistakeCard from '@/components/MistakeCard'
import { useLoad } from '@/hooks/useLoad'
import * as api from '@/mock/api'
import type { Mastery, Tag as KnowledgeTag } from '@/types'
import { masteryLabel } from '@/utils/format'
import { DIFFICULTY_LABEL, MASTERY_OPTIONS } from './components/mistakeOptions'
import MistakeFilterBar from './components/MistakeFilterBar'
import type { MistakeFilterState } from './components/MistakeFilterBar'
import MistakeDetailDrawer from './components/MistakeDetailDrawer'
import MistakeIntakeDrawer from './components/MistakeIntakeDrawer'
import type { IntakeMode } from './components/MistakeIntakeDrawer'
import { tagAndDescendants } from './components/tagTree'
import { useIsMobile } from './components/useIsMobile'

// 难度 URL 值是字符串，回到类型化的 1|2|3；非法值（手改地址栏）一律当未筛选，避免列表莫名空白。
function parseDifficulty(raw: string | null): number | undefined {
  const n = raw ? Number(raw) : NaN
  return n === 1 || n === 2 || n === 3 ? n : undefined
}

export default function MistakesPage() {
  const { message } = AntApp.useApp()
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()

  // ---- 筛选态：全部从 URL 派生（04-03 深链） ----
  const subject = searchParams.get('subject') ?? undefined
  const tagId = searchParams.get('tag') ?? undefined
  const questionType = searchParams.get('type') ?? undefined
  const difficulty = parseDifficulty(searchParams.get('difficulty'))
  const state: MistakeFilterState = { subject, tagId, questionType, difficulty }

  function patchQuery(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    // replace: true —— 连续调筛选不要塞满浏览器历史；刷新与复制地址仍能还原（04-03 可深链）。
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  // ---- 数据：标签树 / 学生 / 全量错题（30 题，量小，一次拉全后页面内过滤） ----
  const { data: tags = [] } = useLoad(() => api.listTags(), [])
  const { data: students = [] } = useLoad(() => api.listStudents(), [])
  const { data: all = [], loading, reload } = useLoad(() => api.listMistakes(), [])

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  // ---- 页头概要（04-02 规模展示）：题数 / 关联数 / 未掌握数 ----
  const assocTotal = useMemo(() => all.reduce((n, m) => n + m.associations.length, 0), [all])
  const unmasteredCount = useMemo(
    () => all.reduce((n, m) => n + m.associations.filter((a) => a.mastery === 'unmastered').length, 0),
    [all],
  )

  // ---- 薄弱知识点 TOP3（04-04）：按「未掌握」关联数排序，点一下即把该知识点写进 URL 筛选 ----
  const weakTop3 = useMemo(() => {
    const counter = new Map<string, number>()
    for (const m of all) {
      const unmastered = m.associations.filter((a) => a.mastery === 'unmastered').length
      if (!unmastered) continue
      for (const id of m.tag_ids) counter.set(id, (counter.get(id) ?? 0) + unmastered)
    }
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ tag: tagById.get(id), count }))
      .filter((x): x is { tag: KnowledgeTag; count: number } => Boolean(x.tag))
  }, [all, tagById])

  // ---- 四维过滤：知识点用「自身 + 后代」集合，选中 modules 也能命中挂在「节」上的错题 ----
  const visible = useMemo(() => {
    const tagSet = tagId ? tagAndDescendants(tagId, tags) : undefined
    return all.filter(
      (m) =>
        (!subject || m.subject === subject) &&
        (!questionType || m.question_type === questionType) &&
        (!difficulty || m.difficulty === difficulty) &&
        (!tagSet || m.tag_ids.some((id) => tagSet.has(id))),
    )
  }, [all, subject, tagId, questionType, difficulty, tags])

  // ---- 勾选态：批量改掌握与组卷共用（04-10）。筛选变化后把不可见的勾选裁掉，避免「勾了看不见」 ----
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const ids = new Set(visible.map((m) => m.id))
      const kept = [...prev].filter((id) => ids.has(id))
      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [visible])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectedVisible = visible.filter((m) => selected.has(m.id))

  const [batchMastery, setBatchMastery] = useState<Mastery>()
  async function applyBatchMastery() {
    if (!batchMastery) {
      message.warning('先选择目标掌握状态')
      return
    }
    const assocIds = selectedVisible.flatMap((m) => m.associations.map((a) => a.id))
    if (!assocIds.length) {
      message.warning('所选题目还没有学生关联，无法改掌握')
      return
    }
    // Promise.all 并发写：api 每条 80ms 延迟，串行 55 条会卡住演示。
    await Promise.all(assocIds.map((id) => api.updateMistakeStudent(id, { mastery: batchMastery })))
    message.success('已把 ' + selectedVisible.length + ' 道题下 ' + assocIds.length + ' 条关联改为「' + masteryLabel[batchMastery] + '」')
    setSelected(new Set())
    setBatchMastery(undefined)
    reload()
  }

  // ---- 详情抽屉 / 录入抽屉 / 组卷示意弹窗（04-09 / 04-10） ----
  const [detailId, setDetailId] = useState<string>()
  const detail = useMemo(() => all.find((m) => m.id === detailId), [all, detailId])

  const [intakeOpen, setIntakeOpen] = useState(false)
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('manual')
  function openIntake(mode: IntakeMode) {
    setIntakeMode(mode)
    setIntakeOpen(true)
  }

  const [groupOpen, setGroupOpen] = useState(false)
  const groupSubjects = useMemo(() => {
    const counter = new Map<string, number>()
    for (const m of selectedVisible) counter.set(m.subject, (counter.get(m.subject) ?? 0) + 1)
    return [...counter.entries()]
  }, [selectedVisible])

  const pageSummary = (
    <span className="num">
      共 {all.length} 题 · {assocTotal} 条学生关联 · 未掌握 {unmasteredCount} 条
      {tagId && tagById.get(tagId) ? ' · 当前知识点：' + tagById.get(tagId)!.name : ''}
    </span>
  )

  return (
    <div className="page">
      <PageHeader
        title="错题库"
        summary={pageSummary}
        extra={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<CameraOutlined />} onClick={() => openIntake('photo')}>
              拍照录入
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => openIntake('manual')}>
              手动录入
            </Button>
          </div>
        }
      />

      {/* 页头薄弱 TOP3（04-04）：点击 = 把知识点写进 URL 并同时对齐科目，按钮主题色底表示当前生效 */}
      {weakTop3.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-textSecondary)' }}>薄弱知识点 TOP3（按未掌握关联数）：</span>
          {weakTop3.map(({ tag, count }) => {
            const active = tagId === tag.id
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => patchQuery({ tag: tag.id, subject: tag.subject })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 24, padding: '2px 10px',
                  borderRadius: 999, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  border: '1px solid var(--color-borderStrong)',
                  background: active ? 'var(--color-primaryBg)' : 'var(--color-bgContainer)',
                  color: 'var(--color-primaryText)',
                }}
              >
                {tag.name}
                <span style={{ color: 'var(--color-errorText)', fontWeight: 600 }} className="num">{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <MistakeFilterBar
        tags={tags}
        state={state}
        resultCount={visible.length}
        totalCount={all.length}
        onPatch={patchQuery}
        onClear={clearFilters}
      />

      {/* 批量操作条：批量改掌握与组卷共用同一勾选态（04-10） */}
      {selectedVisible.length ? (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12,
            background: 'var(--color-primaryBg)', borderRadius: 'var(--radius-base)',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primaryText)' }} className="num">
            已选 {selectedVisible.length} 题
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-textSecondary)' }}>批量改掌握</span>
          <Select
            placeholder="目标状态"
            style={{ width: 130 }}
            value={batchMastery}
            options={MASTERY_OPTIONS}
            onChange={(v: Mastery) => setBatchMastery(v)}
          />
          <Button type="primary" onClick={applyBatchMastery}>应用到所选</Button>
          <Button onClick={() => setGroupOpen(true)}>组卷（示意）</Button>
          <Button type="link" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      ) : null}

      {loading && !all.length ? (
        <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
      ) : visible.length === 0 ? (
        <EmptyState activeChips={[
          subject ? { key: 'subject', label: '科目：' + subject } : null,
          tagId ? { key: 'tag', label: '知识点：' + (tagById.get(tagId)?.name ?? tagId) } : null,
          questionType ? { key: 'type', label: '题型：' + questionType } : null,
          difficulty ? { key: 'difficulty', label: '难度：' + (DIFFICULTY_LABEL[difficulty] ?? difficulty) } : null,
        ].filter(Boolean) as Array<{ key: string; label: string }>}
          onClear={clearFilters}
          onPhoto={() => openIntake('photo')}
          onRemoveChip={(key) => patchQuery({ [key]: undefined })}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          {visible.map((m) => (
            <div key={m.id} style={{ position: 'relative' }}>
              {/* 勾选热区 24×24（GL-23）；stopPropagation 防止点勾选同时打开详情 */}
              <span
                style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 2, width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-sm)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  aria-label={'选择错题：' + m.question_text.slice(0, 16)}
                />
              </span>
              <div
                style={{
                  borderRadius: 'var(--radius-base)',
                  outline: selected.has(m.id) ? '2px solid var(--color-primary)' : 'none',
                  outlineOffset: -1,
                }}
              >
                <MistakeCard mistake={m} onClick={() => setDetailId(m.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <MistakeDetailDrawer
        open={Boolean(detail)}
        mistake={detail}
        tagById={tagById}
        onClose={() => setDetailId(undefined)}
        onChanged={reload}
      />

      <MistakeIntakeDrawer
        open={intakeOpen}
        initialMode={intakeMode}
        tags={tags}
        students={students}
        onClose={() => setIntakeOpen(false)}
        onSaved={reload}
      />

      {/* 组卷只到示意入口（04-10）：展示勾选构成 + 明确提示未接入真实打印/导出 */}
      <Modal
        open={groupOpen}
        title="组卷（示意）"
        onCancel={() => setGroupOpen(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setGroupOpen(false)}>关闭</Button>
            <Button
              type="primary"
              onClick={() => {
                message.info('组卷导出/打印是示意入口：本期只到入口，不接真实排版与打印（04-10）')
                setGroupOpen(false)
              }}
            >
              导出试卷（示意）
            </Button>
          </div>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.8 }}>
          <div>已选 <b className="num">{selectedVisible.length}</b> 道题，按科目分布：</div>
          <div style={{ margin: '8px 0 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groupSubjects.map(([s, n]) => (
              <Tag key={s} style={{ marginInlineEnd: 0 }}>{s} {n}</Tag>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-textTertiary)' }}>
            本期组卷只到示意入口（#7 04-10）：不接入真实试卷排版、导出与打印。
          </div>
        </div>
      </Modal>
    </div>
  )
}

// 空态（04-07）：插画位（内联 SVG，不用 emoji）+ 标题 + 筛选 chips + 清空筛选 + 拍照录入一道。
// 为什么不复用共享 EmptyState：04-07 要求同时出现「chips」与两个动作位，
// 共享组件只有单 action 插槽；这里保持局部实现，共享件不掺业务。
function EmptyState({
  activeChips,
  onClear,
  onPhoto,
  onRemoveChip,
}: {
  activeChips: Array<{ key: string; label: string }>
  onClear: () => void
  onPhoto: () => void
  onRemoveChip: (key: string) => void
}) {
  return (
    <div
      style={{
        background: 'var(--color-bgContainer)', borderRadius: 'var(--radius-base)', boxShadow: 'var(--shadow-card)',
        padding: '40px 16px', textAlign: 'center',
      }}
    >
      {/* 内联 SVG 插画：空白答题纸 + 放大镜，纯图形无 emoji（#7 04-07） */}
      <svg width="88" height="64" viewBox="0 0 88 64" role="img" aria-label="没有符合条件的错题" style={{ marginBottom: 12 }}>
        <rect x="14" y="6" width="48" height="52" rx="4" fill="var(--color-bgHover)" stroke="var(--color-borderStrong)" />
        <line x1="23" y1="18" x2="53" y2="18" stroke="var(--color-borderStrong)" strokeWidth="2" strokeLinecap="round" />
        <line x1="23" y1="28" x2="47" y2="28" stroke="var(--color-borderStrong)" strokeWidth="2" strokeLinecap="round" />
        <line x1="23" y1="38" x2="40" y2="38" stroke="var(--color-borderStrong)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="62" cy="40" r="11" fill="none" stroke="var(--color-textTertiary)" strokeWidth="3" />
        <line x1="70" y1="48" x2="79" y2="57" stroke="var(--color-textTertiary)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 14, color: 'var(--color-text)' }}>没有符合条件的错题</div>
      {activeChips.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {activeChips.map((c) => (
            <Tag key={c.key} closable onClose={() => onRemoveChip(c.key)} style={{ marginInlineEnd: 0 }}>
              {c.label}
            </Tag>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <Button onClick={onClear}>清空筛选</Button>
        <Button type="primary" icon={<CameraOutlined />} onClick={onPhoto}>拍照录入一道</Button>
      </div>
    </div>
  )
}
