import { Navigate, Outlet } from 'react-router-dom'
import { readToken } from '../lib/api'

export default function RequireAuth() {
  if (!readToken()) return <Navigate to="/login" replace />
  return <Outlet />
}
