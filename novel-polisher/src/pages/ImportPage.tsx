import { useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { fingerprint, readTxtFile, splitChapters } from '../lib/parse'
import { parseEpub } from '../lib/epub'
import { deriveBookName } from '../lib/export'
import type { Chapter, Source } from '../types'

export function ImportPage() {
  const { books, sources, addBook, renameBook, removeBook, addSource, removeSource, moveSource } =
    useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const grouped = useMemo(
    () =>
      books.map((b) => ({
        book: b,
        items: sources.filter((s) => s.bookId === b.id),
      })),
    [books, sources],
  )

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setImporting(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const isEpub = /\.epub$/i.test(file.name)
        let text: string
        let chapters: Chapter[]
        if (isEpub) {
          const parsed = await parseEpub(file)
          text = parsed.text
          chapters = parsed.chapters
        } else {
          text = await readTxtFile(file)
          if (!text.trim()) continue
          chapters = splitChapters(text)
        }
        if (chapters.length === 0) continue
        const bookName = deriveBookName(file.name.replace(/\.(txt|epub)$/i, ''))
        const existing = books.find((b) => b.name === bookName)
        const book = existing ?? addBook(bookName)
        const source: Source = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name.replace(/\.(txt|epub)$/i, ''),
          fileName: file.name,
          fingerprint: fingerprint(text),
          text,
          chapters,
          chapterCount: chapters.length,
          paragraphCount: chapters.reduce((acc, c) => acc + c.paragraphs.length, 0),
          bookId: book.id,
        }
        addSource(source)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function startRename(id: string, current: string) {
    setRenamingId(id)
    setRenameDraft(current)
  }

  function commitRename(id: string) {
    const name = renameDraft.trim()
    if (name) renameBook(id, name)
    setRenamingId(null)
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h1>导入书源</h1>
        <p>
          按书分组管理来源：文件名含相同书名（或书名号《》）会自动归入同一本书，同书多源用于对照，多本书互不干扰。
        </p>
      </header>

      <div className="dropzone" onClick={() => inputRef.current?.click()} role="button" tabIndex={0}>
        <span className="dropzone-icon" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M12 6c-1.8-1.6-4.4-2-6.5-2v14c2.1 0 4.7.4 6.5 2 1.8-1.6 4.4-2 6.5-2V4c-2.1 0-4.7.4-6.5 2z" />
            <path d="M12 6v14" />
          </svg>
        </span>
        <strong>{importing ? '正在解析…' : '选择 TXT / EPUB 文件'}</strong>
        <span className="hint">支持多选，可一次导入多个来源；自动按书名归组</span>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain,.epub,application/epub+zip"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="result error">{error}</p>}

      {books.length > 0 && (
        <div className="source-list">
          {grouped.map(({ book, items }) => (
            <div className="book-group" key={book.id}>
              <div className="book-head">
                {renamingId === book.id ? (
                  <input
                    className="book-rename"
                    value={renameDraft}
                    autoFocus
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => commitRename(book.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(book.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                  />
                ) : (
                  <h2 className="book-title">{book.name}</h2>
                )}
                <span className="book-count">{items.length} 源</span>
                <div className="book-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => startRename(book.id, book.name)}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => removeBook(book.id)}
                  >
                    删除本书
                  </button>
                </div>
              </div>
              {items.map((s) => (
                <div className="source-card" key={s.id}>
                  <div className="source-main">
                    <strong className="source-name">{s.name}</strong>
                    <span className="source-file">{s.fileName}</span>
                  </div>
                  <div className="source-meta">
                    <span>{s.chapterCount} 章</span>
                    <span>{s.paragraphCount} 段</span>
                    <span className="fingerprint" title={s.fingerprint}>
                      指纹 {s.fingerprint.slice(0, 8)}
                    </span>
                    {books.length > 1 && (
                      <select
                        className="move-select"
                        value={s.bookId ?? ''}
                        onChange={(e) => moveSource(s.id, e.target.value)}
                        aria-label={`将 ${s.name} 移动到其他书`}
                      >
                        {books.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeSource(s.id)}
                    aria-label={`移除 ${s.name}`}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
