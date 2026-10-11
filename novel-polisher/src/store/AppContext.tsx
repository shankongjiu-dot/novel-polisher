import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Book, LLMConfig, Source } from '../types'
import { AppContext } from './context'
import type { AppState } from './context'
import { loadBooks, loadConfig, saveBooks, saveConfig } from '../lib/storage'
import {
  clearAllSources,
  clearProgress,
  clearSuggestionsBySource,
  deleteSource,
  loadAllSources,
  putSource,
} from '../lib/db'
import { deriveBookName } from '../lib/export'

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 旧数据迁移：无 bookId 的书源按书名自动归入同名书 */
function migrateSources(sources: Source[], initialBooks: Book[]) {
  const books = [...initialBooks]
  const changed: Source[] = []
  for (const s of sources) {
    if (s.bookId && books.some((b) => b.id === s.bookId)) continue
    const name = deriveBookName(s.name)
    let book = books.find((b) => b.name === name)
    if (!book) {
      book = { id: newId(), name }
      books.push(book)
    }
    changed.push({ ...s, bookId: book.id })
  }
  return { books, changed }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<AppState['page']>('import')
  const [config, setConfigState] = useState<LLMConfig>(() => loadConfig())
  const [books, setBooks] = useState<Book[]>([])
  const [sources, setSources] = useState<Source[]>([])

  useEffect(() => saveConfig(config), [config])

  useEffect(
    function loadDataAndMigrate() {
      let alive = true
      Promise.all([loadAllSources(), Promise.resolve(loadBooks())]).then(
        ([sourceList, bookList]) => {
          if (!alive) return
          const { books: migratedBooks, changed } = migrateSources(sourceList, bookList)
          setBooks(migratedBooks)
          setSources(
            changed.length > 0
              ? sourceList.map((s) => changed.find((c) => c.id === s.id) ?? s)
              : sourceList,
          )
          if (changed.length > 0) {
            saveBooks(migratedBooks)
            for (const s of changed) void putSource(s)
          }
        },
      )
      return () => {
        alive = false
      }
    },
    [],
  )

  const value = useMemo<AppState>(
    () => ({
      page,
      setPage,
      config,
      setConfig: setConfigState,
      books,
      sources,
      addBook: (name) => {
        const book: Book = { id: newId(), name }
        setBooks((prev) => {
          const next = [...prev, book]
          saveBooks(next)
          return next
        })
        return book
      },
      renameBook: (id, name) => {
        setBooks((prev) => {
          const next = prev.map((b) => (b.id === id ? { ...b, name } : b))
          saveBooks(next)
          return next
        })
      },
      removeBook: (id) => {
        const removed = sources.filter((s) => s.bookId === id)
        setBooks((prev) => {
          const next = prev.filter((b) => b.id !== id)
          saveBooks(next)
          return next
        })
        setSources((prev) => prev.filter((s) => s.bookId !== id))
        for (const s of removed) {
          void deleteSource(s.id)
          void clearSuggestionsBySource(s.id)
          void clearProgress(s.id)
        }
      },
      addSource: (s) => {
        setSources((prev) => [...prev, s])
        void putSource(s)
      },
      removeSource: (id) => {
        setSources((prev) => prev.filter((x) => x.id !== id))
        void deleteSource(id)
      },
      clearSources: () => {
        setSources([])
        void clearAllSources()
      },
      updateSource: (id, updater) => {
        setSources((prev) => {
          const next = prev.map((s) => (s.id === id ? updater(s) : s))
          const target = next.find((s) => s.id === id)
          if (target) void putSource(target)
          return next
        })
      },
      moveSource: (sourceId, bookId) => {
        setSources((prev) => {
          const next = prev.map((s) => (s.id === sourceId ? { ...s, bookId } : s))
          const target = next.find((s) => s.id === sourceId)
          if (target) void putSource(target)
          return next
        })
      },
    }),
    [page, config, books, sources],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
