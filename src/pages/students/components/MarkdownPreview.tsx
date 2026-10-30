import type { CSSProperties, ReactNode } from 'react'

// 轻量 Markdown 预览（#8 05-05：预览与正文一致）。
// 为什么自己写而不是引库：工程只装 echarts/dayjs/antd（#2 工程约定不引多余库），
// 而报告正文由 api.generateReportDraft 生成，语法只有「## 标题 / 段落 / - 列表 / > 提示 / **粗体**」
// 五类；手写 60 行解析足够，且不会把用户正文当 HTML 插进 DOM（避免 XSS）。
// 渲染顺序：逐行扫描 → 连续列表行聚成 <ul> → 其余按段落，行内只处理 **粗体**。
export default function MarkdownPreview({ markdown, style }: { markdown: string; style?: CSSProperties }) {
  return (
    <div className="p3-md" style={style}>
      {parseBlocks(markdown)}
    </div>
  )
}

/** 行内粗体解析：返回 React 节点，不用 dangerouslySetInnerHTML。 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // 保留 **粗体** 两侧的空格：split 后成对出现，奇数下标即粗体内容。
  return text.split('**').map((part, index) =>
    index % 2 === 1 ? <strong key={keyPrefix + '-b' + index}>{part}</strong> : <span key={keyPrefix + '-t' + index}>{part}</span>,
  )
}

function parseBlocks(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  let paragraph: string[] = []

  const flushList = () => {
    if (!list.length) return
    blocks.push(
      <ul key={'ul-' + blocks.length}>
        {list.map((item, index) => <li key={'li-' + index}>{renderInline(item, 'li-' + blocks.length + '-' + index)}</li>)}
      </ul>,
    )
    list = []
  }
  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join(' ')
    blocks.push(<p key={'p-' + blocks.length}>{renderInline(text, 'p-' + blocks.length)}</p>)
    paragraph = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushList(); flushParagraph()
      const level = heading[1].length
      const content = renderInline(heading[2], 'h' + blocks.length)
      if (level <= 2) blocks.push(<h2 key={'h-' + blocks.length}>{content}</h2>)
      else if (level === 3) blocks.push(<h3 key={'h-' + blocks.length}>{content}</h3>)
      else blocks.push(<h4 key={'h-' + blocks.length}>{content}</h4>)
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph()
      list.push(line.replace(/^[-*]\s+/, ''))
      continue
    }
    if (/^>\s?/.test(line)) {
      flushList(); flushParagraph()
      blocks.push(<blockquote key={'q-' + blocks.length}>{renderInline(line.replace(/^>\s?/, ''), 'q' + blocks.length)}</blockquote>)
      continue
    }
    if (!line.trim()) {
      flushList(); flushParagraph()
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushList(); flushParagraph()
  return blocks
}
