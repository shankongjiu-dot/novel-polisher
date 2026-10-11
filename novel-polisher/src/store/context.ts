import { createContext } from 'react'
import type { Book, LLMConfig, Page, Source } from '../types'

export interface AppState {
  page: Page
  setPage: (p: Page) => void
  config: LLMConfig
  setConfig: (c: LLMConfig) => void
  books: Book[]
  sources: Source[]
  addBook: (name: string) => Book
  renameBook: (id: string, name: string) => void
  removeBook: (id: string) => void
  addSource: (s: Source) => void
  removeSource: (id: string) => void
  clearSources: () => void
  updateSource: (id: string, updater: (s: Source) => Source) => void
  moveSource: (sourceId: string, bookId: string) => void
}

export const AppContext = createContext<AppState | null>(null)
