import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { readSession } from '../lib/api'

export default function RequireAuth({ children }: { children: ReactNode }) {
  if (!readSession()?.sessionToken) {
    return <Navigate to="/login" replace />
  }
  return children
}
