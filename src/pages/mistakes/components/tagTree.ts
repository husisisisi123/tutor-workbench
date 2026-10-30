// 知识点树工具（#7 04-01）：把只读标签树转成 Cascader 选项，并提供 id ⇄ 路径互转。
// 为什么单独成文件：四维筛选（级联选择）、页头薄弱 TOP3、录入表单都要做同一组转换；
// 标签树只读且结构固定（数学到「节」、语英科到模块，不做第 3 级以下），集中一处避免各写一遍。
// 数据流：src/mock/api.listTags() → 本文件 → 页面筛选项 / 标签 chips。
//
// 结构细节：种子只给数学建了 level 1 科目根节点（tag-m-000），语/英/科的 6/6/4 条都是 level 2
// 模块、没有 parent_id。级联控件仍需要「科目 → 模块 → 节」三档，所以这里给每个科目合成一个
// `subject:科目` 根节点；选中合成根 = 只设科目筛选，选中真实 tag id 才设知识点筛选。
import type { Subject, Tag } from '@/types'

export const SUBJECT_ORDER: Subject[] = ['数学', '语文', '英语', '科学']

const SUBJECT_ROOT_PREFIX = 'subject:'

export function subjectRootValue(subject: string): string {
  return SUBJECT_ROOT_PREFIX + subject
}

export function isSubjectRootValue(value: string): boolean {
  return value.startsWith(SUBJECT_ROOT_PREFIX)
}

export interface TagTreeNode {
  value: string
  label: string
  children?: TagTreeNode[]
}

/** 标签数组 → 级联树（合成科目根 + 真实模块/节）。 */
export function buildTagTree(tags: Tag[]): TagTreeNode[] {
  const childrenOf = new Map<string, Tag[]>()
  for (const t of tags) {
    if (!t.parent_id) continue
    const list = childrenOf.get(t.parent_id) ?? []
    list.push(t)
    childrenOf.set(t.parent_id, list)
  }
  const build = (t: Tag): TagTreeNode => {
    const kids = childrenOf.get(t.id) ?? []
    return { value: t.id, label: t.name, children: kids.length ? kids.map(build) : undefined }
  }
  return SUBJECT_ORDER.map((subject) => {
    const level2 = tags.filter((t) => t.subject === subject && t.level === 2)
    return { value: subjectRootValue(subject), label: subject, children: level2.map(build) }
  })
}

/** 标签 → 从合成科目根到自己的路径，用于把 URL 里的单个 tag id 还原成 Cascader 的受控值。 */
export function tagPath(id: string | undefined, tags: Tag[]): string[] {
  if (!id) return []
  const t = tags.find((x) => x.id === id)
  if (!t) return []
  const chain: Tag[] = []
  let cur: Tag | undefined = t
  let guard = 0
  while (cur && guard < 8) {
    chain.unshift(cur)
    const parentId: string | undefined = cur.parent_id
    cur = parentId ? tags.find((x) => x.id === parentId) : undefined
    guard += 1
  }
  // level 1 真实根节点（数学）由合成根代表，避免同一层出现两个「数学」
  return [subjectRootValue(t.subject), ...chain.filter((x) => x.level !== 1).map((x) => x.id)]
}

/**
 * 选中标签自身 + 全部后代 id。
 * 为什么需要后代：错题只挂「节」（level 3）标签，用户选「模块」（level 2）时
 * api.listMistakes 的 tagId 只做精确匹配会返回 0 题，所以这里展开后代在页面层过滤。
 */
export function tagAndDescendants(id: string, tags: Tag[]): Set<string> {
  const out = new Set<string>([id])
  const walk = (pid: string) => {
    for (const t of tags) {
      if (t.parent_id === pid && !out.has(t.id)) {
        out.add(t.id)
        walk(t.id)
      }
    }
  }
  walk(id)
  return out
}
