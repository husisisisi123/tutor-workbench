import type { Student } from '@/types'

// 学生头像：姓名首字 + 稳定色相圆标（#12：不用 emoji，不用外链图片）。
// 色相来自 student.avatar_hue，同一学生全站颜色一致。
export default function StudentAvatar({ student, size = 36 }: { student: Pick<Student, 'name' | 'avatar_hue'>; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.4), fontWeight: 600,
        background: 'hsl(' + student.avatar_hue + ' 55% 92%)',
        color: 'hsl(' + student.avatar_hue + ' 45% 32%)',
      }}
    >
      {student.name.slice(0, 1)}
    </div>
  )
}
