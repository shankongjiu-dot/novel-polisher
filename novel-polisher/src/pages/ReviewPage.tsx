import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { cleanSource } from '../lib/cleaner'
import { proofread } from '../lib/llm'
import {
  clearProgress,
  clearSuggestionsBySource,
  loadProgress,
  loadSuggestionsBySource,
  putSuggestion,
  saveProgress,
} from '../lib/db'
import type { Suggestion } from '../types'

const PAGE_SIZE = 50

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  ad: '广告',
  watermark: '水印',
  garbage: '乱码',
  typo: '错别字',
}

type Filter = 'all' | 'pending' | 'accepted' | 'rejected'

const FILTER_LABEL: Record<Filter, string> = {
  all: '全部',
  pending: '待处理',
  accepted: '已采纳',
  rejected: '已拒绝',
}

export function ReviewPage() {
  const { books, sources, config, updateSource } = useApp()
  const [sourceId, setSourceId] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [busy, setBusy] = useState<null | 'clean' | 'llm'>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [filter, setFilter] = useState<Filter>('pending')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const activeSourceId = source?.id

  useEffect(() => {
    if (!activeSourceId) return
    let alive = true
    loadSuggestionsBySource(activeSourceId).then((list) => {
      if (alive) setSuggestions(list)
    })
    return () => {
      alive = false
    }
  }, [activeSourceId])

  const counts = useMemo(() => {
    const c = { all: suggestions.length, pending: 0, accepted: 0, rejected: 0 }
    for (const s of suggestions) c[s.status] += 1
    return c
  }, [suggestions])

  const filtered = useMemo(
    () => (filter === 'all' ? suggestions : suggestions.filter((s) => s.status === filter)),
    [suggestions, filter],
  )

  function selectSource(id: string) {
    setSourceId(id)
    setError(null)
    setProgress({ done: 0, total: 0 })
    setPage(0)
  }

  async function runClean() {
    if (!source) return
    setBusy('clean')
    const hits = cleanSource(source)
    const applied = hits.map((h) => ({ ...h, status: 'accepted' as const }))
    const kept = suggestions.filter((s) => s.source !== 'rule')
    const next = [...kept, ...applied]
    setSuggestions(next)
    await clearSuggestionsBySource(source.id)
    for (const s of next) await putSuggestion(s)
    const changes = new Map<string, Map<number, string>>()
    for (const h of hits) {
      let ch = changes.get(h.chapterId)
      if (!ch) {
        ch = new Map()
        changes.set(h.chapterId, ch)
      }
      ch.set(h.paragraphIndex, h.corrected)
    }
    if (changes.size > 0) {
      updateSource(source.id, (src) => ({
        ...src,
        chapters: src.chapters.map((c) => {
          const ch = changes.get(c.id)
          if (!ch) return c
          return {
            ...c,
            paragraphs: c.paragraphs.map((p, i) => ch.get(i) ?? p),
          }
        }),
      }))
    }
    setBusy(null)
  }

  async function runLLM() {
    if (!source) return
    if (!config.apiKey) {
      setError('请先在「设置」中配置 API Key')
      return
    }
    setBusy('llm')
    setError(null)
    const allItems = source.chapters.flatMap((c) =>
      c.paragraphs.map((text, index) => ({ chapter: c, text, index })),
    )
    const doneKeys = new Set(await loadProgress(source.id))
    const queue = allItems.filter((it) => !doneKeys.has(`${it.chapter.id}:${it.index}`))
    if (queue.length === 0) {
      setError('该源已全部校对完成，可点击「重置进度」重新校对')
      setBusy(null)
      return
    }
    setProgress({ done: 0, total: queue.length })
    const results: Suggestion[] = []
    let flushCounter = 0
    const concurrency = 3
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()!
        const key = `${item.chapter.id}:${item.index}`
        try {
          const corrected = await proofread(config, item.text)
          if (corrected && corrected !== item.text) {
            const sug: Suggestion = {
              id: `${source.id}-${item.chapter.id}-${item.index}-typo`,
              sourceId: source.id,
              chapterId: item.chapter.id,
              chapterTitle: item.chapter.title,
              paragraphIndex: item.index,
              original: item.text,
              corrected,
              kind: 'typo',
              reason: 'AI 校对',
              source: 'llm',
              status: 'pending',
            }
            results.push(sug)
            void putSuggestion(sug)
          }
        } catch {
          // 单段失败跳过，不计入已完成以利重试
          setProgress((p) => ({ ...p, done: p.done + 1 }))
          continue
        }
        doneKeys.add(key)
        if (++flushCounter % 50 === 0) {
          await saveProgress(source.id, [...doneKeys])
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    })
    await Promise.all(workers)
    await saveProgress(source.id, [...doneKeys])
    setSuggestions((prev) => [...prev, ...results])
    setBusy(null)
  }

  async function resetProgress() {
    if (!source) return
    await clearProgress(source.id)
    setError('校对进度已重置，可重新运行 AI 校对')
  }


  function accept(s: Suggestion) {
    const updated = { ...s, status: 'accepted' as const }
    setSuggestions((prev) => prev.map((x) => (x.id === s.id ? updated : x)))
    void putSuggestion(updated)
    updateSource(s.sourceId, (src) => ({
      ...src,
      chapters: src.chapters.map((c) => {
        if (c.id !== s.chapterId) return c
        return {
          ...c,
          paragraphs: c.paragraphs.map((p, i) => (i === s.paragraphIndex ? s.corrected : p)),
        }
      }),
    }))
  }

  function reject(s: Suggestion) {
    const updated = { ...s, status: 'rejected' as const }
    setSuggestions((prev) => prev.map((x) => (x.id === s.id ? updated : x)))
    void putSuggestion(updated)
  }

  function acceptAll() {
    suggestions.filter((s) => s.status === 'pending').forEach(accept)
  }

  function rejectAll() {
    const toReject = suggestions.filter((s) => s.status === 'pending')
    setSuggestions((prev) =>
      prev.map((x) => (x.status === 'pending' ? { ...x, status: 'rejected' } : x)),
    )
    for (const s of toReject) void putSuggestion({ ...s, status: 'rejected' })
  }

  if (sources.length === 0) {
    return (
      <section className="panel placeholder">
        <p>请先在「导入」页导入书源。</p>
      </section>
    )
  }

  const pendingCount = counts.pending
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <section className="panel">
      <header className="panel-head">
        <h1>人工审核</h1>
        <p>运行清洗会按规则直接删除广告/水印/乱码整段；AI 校对的错别字建议仍需人工逐条确认。</p>
      </header>

      <div className="review-toolbar">
        <select
          className="select"
          value={source?.id ?? ''}
          onChange={(e) => selectSource(e.target.value)}
          aria-label="选择书源"
        >
          {books.map((b) => (
            <optgroup key={b.id} label={b.name}>
              {sources
                .filter((s) => s.bookId === b.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <button type="button" className="btn btn-secondary" onClick={runClean} disabled={busy !== null}>
          {busy === 'clean' ? '清洗中…' : '运行清洗'}
        </button>
        <button type="button" className="btn btn-primary" onClick={runLLM} disabled={busy !== null}>
          {busy === 'llm' ? '校对中…' : 'AI 校对'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={resetProgress}
          disabled={busy !== null}
          title="清除已校对记录，允许重新全文校对"
        >
          重置进度
        </button>
      </div>

      {error && <p className="result error">{error}</p>}

      {busy === 'llm' && (
        <div className="progress-row">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="hint">
            AI 校对 · {progress.done}/{progress.total} 段
          </span>
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <div className="review-stats">
            <div className="filter-tabs">
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`filter-tab${filter === f ? ' active' : ''}`}
                  onClick={() => {
                    setFilter(f)
                    setPage(0)
                  }}
                >
                  {FILTER_LABEL[f]}（{counts[f]}）
                </button>
              ))}
            </div>
            {pendingCount > 0 && (
              <div className="bulk-actions">
                <button type="button" className="link-btn" onClick={acceptAll}>
                  全部采纳
                </button>
                <button type="button" className="link-btn danger" onClick={rejectAll}>
                  全部拒绝
                </button>
              </div>
            )}
          </div>

          <div className="suggestion-list">
            {pageRows.map((s) => (
              <div className={`suggestion${s.status !== 'pending' ? ` is-${s.status}` : ''}`} key={s.id}>
                <div className="suggestion-head">
                  <span className={`kind-tag kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  <span className="suggestion-chapter">{s.chapterTitle}</span>
                  <span className={`source-tag source-${s.source}`}>
                    {s.source === 'rule' ? '规则' : 'AI'}
                  </span>
                </div>
                <div className="diff-block">
                  {s.original && (
                    <p className="diff-original">
                      <span className="diff-label">原文</span>
                      {s.original}
                    </p>
                  )}
                  <p className="diff-corrected">
                    <span className="diff-label">建议</span>
                    {s.corrected || <em className="deleted">（删除此段）</em>}
                  </p>
                </div>
                <div className="suggestion-foot">
                  <span className="hint">{s.reason}</span>
                  {s.status === 'pending' ? (
                    <div className="card-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => accept(s)}>
                        采纳
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => reject(s)}>
                        拒绝
                      </button>
                    </div>
                  ) : (
                    <span className={`status ${s.status}`}>{FILTER_LABEL[s.status]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="pager">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                上一页
              </button>
              <span className="pager-info">
                第 {safePage + 1} / {totalPages} 页（共 {filtered.length} 条）
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {suggestions.length === 0 && busy === null && (
        <div className="empty-tip">
          <p>尚未生成建议。点击「运行清洗」或「AI 校对」开始。</p>
        </div>
      )}
    </section>
  )
}