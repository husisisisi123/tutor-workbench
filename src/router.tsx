import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/dashboard/DashboardPage'
import FeedbackPage from './pages/feedback/FeedbackPage'
import GrowthPage from './pages/growth/GrowthPage'
import MistakesPage from './pages/mistakes/MistakesPage'
import StudentDetailPage from './pages/students/StudentDetailPage'
import StudentsPage from './pages/students/StudentsPage'

// 路由表：hash 路由（刷新不 404，见 #11）。/scores 不再作为独立成绩页（#8/#12），
// 保留重定向避免旧链接落地白屏。
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/students" element={<StudentsPage />} />
      <Route path="/students/:id" element={<StudentDetailPage />} />
      <Route path="/mistakes" element={<MistakesPage />} />
      <Route path="/growth" element={<GrowthPage />} />
      <Route path="/scores" element={<Navigate to="/students" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
