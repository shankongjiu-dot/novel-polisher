import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import type { CompareProgress, CompareRow, CompareSummary } from '../lib/compare'
import { compareSourcesAsync, type CompareJob } from '../lib/compareAsync'
import {
  arbitrate,
  arbitrateBatch,
  estimateArbitrateCost,
  isFullParagraphRisk,
  type ArbitrateVerdict,
} from '../lib/llm'
import { VERDICT_KIND_META, type VerdictKind } from '../types'

const PAGE_SIZE = 50
const ARBITRATE_CONTEXT_BUDGET = 900000
const ARBITRATE_BATCH_MAX = 30000
const STAR_CHAR_RE = /[*＊]/

export function ComparePage() {
  const { books, sources, config, updateSource } = useApp()
  const [bookId, setBookId] = useState('')
  const [result, setResult] = useState<CompareSummary | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<CompareProgress | null>(null)
  const [onlyDiff, setOnlyDiff] = useState(true)
  const [arbitrating, setArbitrating] = useState<number | null>(null)
  const [arbitBatch, setArbitBatch] = useState<{ done: number; total: number } | null>(null)
  const [arbitrations, setArbitrations] = useState<Record<number, ArbitrateVerdict>>({})
  const [accepted, setAccepted] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [kindFilter, setKindFilter] = useState<VerdictKind | 'all'>('all')
  const jobRef = useRef<CompareJob | null>(null)

  const activeBookId = books.some((b) => b.id === bookId)
    ? bookId
    : (books.find((b) => sources.filter((s) => s.bookId === b.id).length >= 2)?.id ?? books[0]?.id ?? '')
  const bookSources = useMemo(
    () => sources.filter((s) => s.bookId === activeBookId),
    [sources, activeBookId],
  )
  const sourceNames = useMemo(
    () => new Map(bookSources.map((s, i) => [s.id, `源${i + 1}`])),
    [bookSources],
  )
  const toCandidates = (row: CompareRow) =>
    row.variants.map((v) => ({
      text: v.text,
      sources: v.sources.map((sid) => sourceNames.get(sid) ?? sid),
    }))

  /** 带星号条目：候选里存在打码痕迹（* / ＊） */
  const rowHasStars = (row: CompareRow) => row.variants.some((v) => STAR_CHAR_RE.test(v.text))
  /** 该裁决是否要求回报「修改后该段全文」 */
  const verdictNeedsFullText = (v: ArbitrateVerdict) => VERDICT_KIND_META[v.kind].needsFullText

  useEffect(() => () => jobRef.current?.cancel(), [])

  function run() {
    if (bookSources.length < 2) return
    jobRef.current?.cancel()
    setRunning(true)
    setResult(null)
    setProgress({ stage: '准备中', done: 0, total: 0 })
    setArbitrations({})
    setAccepted(new Set())
    setError(null)
    setPage(0)
    const job = compareSourcesAsync(bookSources, (p) => setProgress(p))
    jobRef.current = job
    job.promise
      .then((r) => {
        setResult(r)
        setRunning(false)
        setProgress(null)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
        setRunning(false)
        setProgress(null)
      })
  }

  async function arbitrateRow(row: CompareRow) {
    if (!config.apiKey) {
      setError('请先在「设置」中配置 API Key')
      return
    }
    setError(null)
    setArbitrating(row.sequence)
    try {
      const verdict = await arbitrate(config, toCandidates(row))
      setArbitrations((prev) => ({ ...prev, [row.sequence]: verdict }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setArbitrating(null)
    }
  }

  async function arbitrateAll() {
    if (!config.apiKey) {
      setError('请先在「设置」中配置 API Key')
      return
    }
    let pending = result?.rows.filter((r) => r.conflict && !arbitrations[r.sequence]) ?? []
    if (pending.length === 0) return
    const total = pending.length
    setError(null)
    setArbitBatch({ done: 0, total })
    let done = 0
    while (pending.length > 0) {
      const avgCost =
        pending.reduce((sum, r) => sum + estimateArbitrateCost({ candidates: toCandidates(r) }), 0) /
        pending.length
      const size = Math.max(
        1,
        Math.min(ARBITRATE_BATCH_MAX, Math.floor(ARBITRATE_CONTEXT_BUDGET / avgCost)),
      )
      const batch = pending.slice(0, size)
      const items = batch.map((r, idx) => ({
        id: idx,
        candidates: toCandidates(r),
        stars: rowHasStars(r),
      }))
      const parsed = await arbitrateBatch(config, items)
      const written = new Map<number, ArbitrateVerdict>()
      for (const [id, verdict] of parsed) {
        const row = batch[id]
        if (row) written.set(row.sequence, verdict)
      }
      if (written.size > 0) {
        setArbitrations((prev) => {
          const next = { ...prev }
          for (const [seq, verdict] of written) next[seq] = verdict
          return next
        })
      }
      done += written.size
      setArbitBatch({ done, total })
      pending = batch.filter((_, idx) => !parsed.has(idx)).concat(pending.slice(size))
      if (written.size === 0) break
    }
    setArbitBatch(null)
  }

  function acceptRow(row: CompareRow, text: string | null) {
    const anchor = bookSources[0]
    updateSource(anchor.id, (src) => ({
      ...src,
      chapters: src.chapters.map((c) => {
        if (c.id !== row.anchorChapterId) return c
        return {
          ...c,
          paragraphs: c.paragraphs.map((p, i) => (i === row.anchorParagraphIndex ? (text ?? '') : p)),
        }
      }),
    }))
    setAccepted((prev) => new Set(prev).add(row.sequence))
  }

  function acceptAllMajority() {
    if (!result) return
    const anchor = bookSources[0]
    const candidates = result.rows.filter(
      (r) => r.diff && !r.conflict && r.winner && !accepted.has(r.sequence),
    )
    if (candidates.length === 0) {
      setError('没有可批量采纳的多票胜出行')
      return
    }
    setError(null)
    const changes = new Map<string, Map<number, string>>()
    const anchorChMap = new Map(anchor.chapters.map((c) => [c.id, c]))
    for (const row of candidates) {
      const ch = anchorChMap.get(row.anchorChapterId)
      if (!ch) continue
      if (row.winner === ch.paragraphs[row.anchorParagraphIndex]) continue
      let chChanges = changes.get(row.anchorChapterId)
      if (!chChanges) {
        chChanges = new Map()
        changes.set(row.anchorChapterId, chChanges)
      }
      chChanges.set(row.anchorParagraphIndex, row.winner)
    }
    if (changes.size > 0) {
      updateSource(anchor.id, (src) => ({
        ...src,
        chapters: src.chapters.map((c) => {
          const chChanges = changes.get(c.id)
          if (!chChanges) return c
          return {
            ...c,
            paragraphs: c.paragraphs.map((p, i) => chChanges.get(i) ?? p),
          }
        }),
      }))
    }
    setAccepted((prev) => {
      const next = new Set(prev)
      for (const row of candidates) next.add(row.sequence)
      return next
    })
  }

  function acceptAllArbitrated() {
    if (!result) return
    const anchor = bookSources[0]
    const candidates = result.rows.filter(
      (r) => r.conflict && arbitrations[r.sequence] && !accepted.has(r.sequence),
    )
    if (candidates.length === 0) {
      setError('没有待采纳的 AI 裁决')
      return
    }
    setError(null)
    const changes = new Map<string, Map<number, string>>()
    const anchorChMap = new Map(anchor.chapters.map((c) => [c.id, c]))
    for (const row of candidates) {
      const ch = anchorChMap.get(row.anchorChapterId)
      if (!ch) continue
      const text = arbitrations[row.sequence].text ?? ''
      if (text === ch.paragraphs[row.anchorParagraphIndex]) continue
      let chChanges = changes.get(row.anchorChapterId)
      if (!chChanges) {
        chChanges = new Map()
        changes.set(row.anchorChapterId, chChanges)
      }
      chChanges.set(row.anchorParagraphIndex, text)
    }
    if (changes.size > 0) {
      updateSource(anchor.id, (src) => ({
        ...src,
        chapters: src.chapters.map((c) => {
          const chChanges = changes.get(c.id)
          if (!chChanges) return c
          return {
            ...c,
            paragraphs: c.paragraphs.map((p, i) => chChanges.get(i) ?? p),
          }
        }),
      }))
    }
    setAccepted((prev) => {
      const next = new Set(prev)
      for (const row of candidates) next.add(row.sequence)
      return next
    })
  }

  if (books.length === 0 || bookSources.length < 2) {
    return (
      <section className="panel placeholder">
        <p>当前书籍的书源不足 2 个，请先在「导入」页添加同书的多个来源。</p>
      </section>
    )
  }

  const allRows = result ? (onlyDiff ? result.rows.filter((r) => r.diff) : result.rows) : []
  const kindCounts = new Map<VerdictKind, number>()
  for (const row of allRows) {
    const v = arbitrations[row.sequence]
    if (!v) continue
    kindCounts.set(v.kind, (kindCounts.get(v.kind) ?? 0) + 1)
  }
  const rowsFiltered =
    kindFilter === 'all' ? allRows : allRows.filter((r) => arbitrations[r.sequence]?.kind === kindFilter)
  const totalPages = Math.max(1, Math.ceil(rowsFiltered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageRows = rowsFiltered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const conflictCount = result
    ? result.rows.filter((r) => r.conflict && !arbitrations[r.sequence]).length
    : 0
  const majorityAcceptCount = result
    ? result.rows.filter((r) => r.diff && !r.conflict && r.winner && !accepted.has(r.sequence)).length
    : 0
  const arbitratedPendingCount = result
    ? result.rows.filter(
        (r) => r.conflict && arbitrations[r.sequence] && !accepted.has(r.sequence),
      ).length
    : 0

  return (
    <section className="panel">
      <header className="panel-head">
        <h1>多源对照</h1>
        <p>将多个来源对齐后逐段投票，广告/错别字由差异直接暴露，多数源一致者胜出。可一键采纳到锚点源。</p>
      </header>

      <div className="review-toolbar">
        <select
          className="select"
          value={activeBookId}
          onChange={(e) => {
            setBookId(e.target.value)
            setResult(null)
            setError(null)
          }}
          aria-label="选择要对照的书"
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}（{sources.filter((s) => s.bookId === b.id).length} 源）
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          {running ? '对照中…' : result ? '重新对照' : '开始对照'}
        </button>
        {result && (
          <label className="switch">
            <input
              type="checkbox"
              checked={onlyDiff}
              onChange={(e) => {
                setOnlyDiff(e.target.checked)
                setPage(0)
              }}
            />
            <span>仅显示差异</span>
          </label>
        )}
        {conflictCount > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={arbitrateAll}
            disabled={arbitrating !== null || arbitBatch !== null}
          >
            仲裁全部冲突（{conflictCount}）
          </button>
        )}
        {arbitratedPendingCount > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={acceptAllArbitrated}
            disabled={arbitrating !== null || arbitBatch !== null}
          >
            一键采纳 AI 裁决（{arbitratedPendingCount}）
          </button>
        )}
        {majorityAcceptCount > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={acceptAllMajority}
            disabled={arbitrating !== null || arbitBatch !== null}
          >
            批量采纳多票（{majorityAcceptCount}）
          </button>
        )}
      </div>

      {kindCounts.size > 0 && (
        <div className="verdict-filter">
          <span className="verdict-filter-label">按裁决分类</span>
          <div className="filter-tabs">
            <button
              type="button"
              className={`filter-tab${kindFilter === 'all' ? ' active' : ''}`}
              onClick={() => {
                setKindFilter('all')
                setPage(0)
              }}
            >
              全部（{[...kindCounts.values()].reduce((a, b) => a + b, 0)}）
            </button>
            {[...kindCounts.entries()].map(([kind, n]) => {
              const meta = VERDICT_KIND_META[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  className={`filter-tab${kindFilter === kind ? ' active' : ''}${
                    meta.needsFullText ? ' has-star' : ''
                  }`}
                  title={meta.hint}
                  onClick={() => {
                    setKindFilter(kind)
                    setPage(0)
                  }}
                >
                  {meta.category}·{meta.label}（{n}）
                </button>
              )
            })}
          </div>
        </div>
      )}

      {running && progress && (
        <div className="progress-row">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="hint">
            {progress.stage}
            {progress.total > 0 ? ` · ${progress.done}/${progress.total}` : ''}
          </span>
        </div>
      )}
      {arbitBatch && (
        <div className="progress-row">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${(arbitBatch.done / arbitBatch.total) * 100}%` }}
            />
          </div>
          <span className="hint">
            AI 仲裁 · {arbitBatch.done}/{arbitBatch.total}
          </span>
        </div>
      )}
      {error && <p className="result error">{error}</p>}

      {result && (
        <>
          <div className="compare-stats">
            <div className="stat">
              <strong>{result.totalDiffs}</strong>
              <span>差异处</span>
            </div>
            <div className="stat">
              <strong>{result.conflicts}</strong>
              <span>需 AI 仲裁</span>
            </div>
            <div className="stat">
              <strong>{kindCounts.get('restore') ?? 0}</strong>
              <span>还原打码</span>
            </div>
            <div className="stat">
              <strong>{kindCounts.get('star-uncertain') ?? 0}</strong>
              <span>打码存疑</span>
            </div>
            <div className="stat">
              <strong>{accepted.size}</strong>
              <span>已采纳</span>
            </div>
          </div>

          <div className="suggestion-list">
            {pageRows.map((row) => {
              const arbitrated = arbitrations[row.sequence]
              const majorityText = row.conflict ? null : row.winner
              const isAccepted = accepted.has(row.sequence)
              const stars = rowHasStars(row)
              const needFullText = arbitrated ? verdictNeedsFullText(arbitrated) : false
              const truncated =
                arbitrated && needFullText ? isFullParagraphRisk({ candidates: toCandidates(row) }, arbitrated.text) : false
              return (
                <div className={`compare-row${row.conflict ? ' conflict' : ''}`} key={row.sequence}>
                  <div className="suggestion-head">
                    <span className="kind-tag kind-watermark">#{row.sequence + 1}</span>
                    <span className="suggestion-chapter">{row.chapterTitle}</span>
                    {stars && <span className="star-tag" title="该段含打码星号，须回报整段全文">含星号</span>}
                    {row.conflict ? (
                      <span className="stage-tag">需 AI 仲裁</span>
                    ) : (
                      <span className="stage-tag">多数胜出</span>
                    )}
                  </div>
                  <div className="variant-list">
                    {[...row.variants]
                      .sort((a, b) => b.count - a.count)
                      .map((v) => {
                        const isWinner = row.conflict ? false : v.text === row.winner
                        return (
                          <div
                            className={`variant-item${isWinner ? ' winner' : ''}`}
                            key={v.text}
                          >
                            <div className="variant-text">{v.text}</div>
                            <div className="variant-meta">
                              <span className="source-tag source-llm">
                                {v.sources.map((sid) => sourceNames.get(sid) ?? sid).join(' / ')}
                              </span>
                              <span className="hint">{v.count} 票</span>
                              {isWinner && <span className="status accepted">✓ 多数</span>}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  {row.conflict && (
                    <div className="arbitrate-box">
                      {arbitrated ? (
                        <div className="arbitrate-result">
                          <div className="verdict-head">
                            <span className={`verdict-kind kind-${arbitrated.kind}`}>
                              {VERDICT_KIND_META[arbitrated.kind].category}·{arbitrated.label}
                            </span>
                            <span className="diff-label" title={VERDICT_KIND_META[arbitrated.kind].hint}>
                              AI 裁决
                            </span>
                          </div>
                          {needFullText ? (
                            <>
                              <div className="fulltext-head">
                                修改后该段全文
                                {arbitrated.kind === 'star-uncertain' && (
                                  <span className="star-tag">星号原样保留 · 待人工</span>
                                )}
                              </div>
                              <div className="variant-text">
                                {arbitrated.text ?? '（无有效文本，需人工处理）'}
                              </div>
                              {truncated && (
                                <p className="verdict-warn">
                                  与候选差异过大，可能不是完整段落，请人工核对后再采纳。
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="variant-text">
                              {arbitrated.text ?? '（删除：判定为广告/水印/乱码污染）'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => arbitrateRow(row)}
                          disabled={arbitrating === row.sequence}
                        >
                          {arbitrating === row.sequence ? '仲裁中…' : 'AI 仲裁'}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="compare-foot">
                    {isAccepted ? (
                      <span className="status accepted">✓ 已采纳到锚点</span>
                    ) : arbitrated ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => acceptRow(row, arbitrated.text)}
                      >
                        {arbitrated.text == null ? '删除该段' : '采纳到锚点'}
                      </button>
                    ) : majorityText ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => acceptRow(row, majorityText)}
                      >
                        采纳到锚点
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {rowsFiltered.length === 0 && (
              <div className="empty-tip">
                <p>
                  {allRows.length === 0
                    ? '未发现差异，多源文本一致。'
                    : '当前分类下没有条目，可切换到「全部」。'}
                </p>
              </div>
            )}
          </div>

          {rowsFiltered.length > PAGE_SIZE && (
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
                第 {safePage + 1} / {totalPages} 页（共 {rowsFiltered.length} 条）
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
    </section>
  )
}
