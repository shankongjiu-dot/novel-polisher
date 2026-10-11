import { useContext } from 'react'
import { AppContext } from './context'
import type { AppState } from './context'

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}