import { CopyOutlined, EditOutlined, PhoneOutlined } from '@ant-design/icons'
import { App, Button, Descriptions, Progress, Tag, Tooltip } from 'antd'
import { maskPhone, studentStatusLabel } from '@/utils/format'
import type { StudentRow } from '../lib/data'
import { riskOf } from '../lib/data'

// 详情页右侧栏（03-09 / PRD §4.3）：基本资料（七字段只读 + 编辑入口）/ 课时包 / 联系家长。
// 为什么七字段放右栏而不是单开 Tab：03-09 的四 Tabs 是成绩轨迹/错题库/数据分析/学习报告，
// 基本资料属于「随时可查」的常驻信息，吸顶信息条 + 右栏比第五个 Tab 更省一次点击。
// 编辑资料与排课一样是本期占位：api 没有 updateStudent（已列入交付回报），这里只给入口不假装能存。
export default function StudentSidebar({ row, onDeduct }: { row: StudentRow; onDeduct: () => void }) {
  const { message } = App.useApp()
  const { student, lesson } = row
  const risk = riskOf(lesson.remaining)
  const pct = lesson.total ? Math.round((lesson.used / lesson.total) * 100) : 0

  return (
    <div className="p3-detail-side">
      <div className="section-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>基本资料</div>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => message.info('编辑资料接口待接入，本期七字段只读演示（已列入交付回报）')}
          >
            编辑资料
          </Button>
        </div>
        <Descriptions
          column={1}
          size="small"
          colon={false}
          styles={{ label: { width: 72, color: 'var(--color-textTertiary)' } }}
          items={[
            { key: 'name', label: '姓名', children: student.name },
            { key: 'grade', label: '年级', children: student.grade },
            { key: 'school', label: '学校', children: student.school },
            { key: 'phone', label: '家长电话', children: <span className="num">{maskPhone(student.parent_phone)}</span> },
            { key: 'parent', label: '家长姓名', children: student.parent_name },
            {
              key: 'status',
              label: '学生状态',
              children: <Tag style={{ marginInlineEnd: 0 }}>{studentStatusLabel[student.status] ?? student.status}</Tag>,
            },
            { key: 'note', label: '备注', children: student.note ?? <span style={{ color: 'var(--color-textTertiary)' }}>—</span> },
          ]}
        />
      </div>

      <div className="section-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>课时包</div>
          <Tag color={risk === 'urgent' ? 'error' : risk === 'tense' ? 'warning' : 'default'} style={{ marginInlineEnd: 0 }}>
            {risk === 'urgent' ? '告急' : risk === 'tense' ? '紧张' : '正常'}
          </Tag>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="p3-meta-label">每期</div>
            <div className="p3-meta-value num">{lesson.total} 节</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="p3-meta-label">已用</div>
            <div className="p3-meta-value num">{lesson.used} 节</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="p3-meta-label">剩余</div>
            <div className="p3-meta-value num" style={{ color: risk === 'urgent' ? 'var(--color-errorText)' : risk === 'tense' ? 'var(--color-warningText)' : 'var(--color-text)' }}>
              {lesson.remaining} 节
            </div>
          </div>
        </div>
        <Progress percent={pct} showInfo={false} size="small" strokeColor={risk === 'normal' ? 'var(--color-primary)' : risk === 'tense' ? 'var(--color-amber)' : 'var(--color-error)'} trailColor="var(--color-border)" aria-label={'已用 ' + pct + '%'} />
        <div style={{ fontSize: 12, color: 'var(--color-textTertiary)', marginBottom: 8 }}>
          到期日：{lesson.expireAt ?? '未设置'}
        </div>
        <Button size="small" block onClick={onDeduct}>登记消耗</Button>
      </div>

      <div className="section-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>联系家长</div>
        <div style={{ fontSize: 13, color: 'var(--color-textSecondary)', marginBottom: 4 }}>{student.parent_name}</div>
        {/* hover 显全号 + 点击复制：PRD §4.3 明确要「脱敏电话，hover 显全号，点击复制」 */}
        <Tooltip title={student.parent_phone + '（点击复制）'}>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(student.parent_phone)
                message.success('已复制家长电话')
              } catch {
                message.warning('当前环境不允许写剪贴板，全号：' + student.parent_phone)
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 8px',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-base)',
              background: 'var(--color-bgContainer)', color: 'var(--color-text)', cursor: 'pointer', fontSize: 13,
            }}
          >
            <PhoneOutlined style={{ color: 'var(--color-icon)' }} />
            <span className="num" style={{ flex: 1, textAlign: 'left' }}>{maskPhone(student.parent_phone)}</span>
            <CopyOutlined style={{ color: 'var(--color-icon)' }} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
