import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import DeskPage from './pages/DeskPage'
import LoginPage from './pages/LoginPage'
import { readToken } from './lib/api'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={readToken() ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DeskPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
