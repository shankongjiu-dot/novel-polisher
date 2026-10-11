import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { deriveBookName, downloadText, sourceToText } from '../lib/export'
import { generateEpub, downloadBlob } from '../lib/epub'

export function ExportPage() {
  const { books, sources } = useApp()
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(false)

  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const text = useMemo(() => (source ? sourceToText(source) : ''), [source])

  if (sources.length === 0) {
    return (
      <section className="panel placeholder">
        <p>暂无可导出的内容。请先导入并精修书源。</p>
      </section>
    )
  }

  async function handleExportEpub() {
    if (!source) return
    setBusy(true)
    try {
      const blob = await generateEpub(source)
      downloadBlob(`${deriveBookName(source.name)}.epub`, blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel export">
      <header className="panel-head">
        <h1>导出</h1>
        <p>导出精修后的全文。空段落已在审核中被清除。</p>
      </header>

      <div className="field">
        <label htmlFor="export-source">选择书源</label>
        <select
          id="export-source"
          className="select"
          value={source?.id ?? ''}
          onChange={(e) => setSourceId(e.target.value)}
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
      </div>

      {source && (
        <div className="export-meta">
          <span>{source.chapterCount} 章</span>
          <span>{text.length.toLocaleString()} 字符</span>
        </div>
      )}

      <div className="export-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => source && downloadText(`${deriveBookName(source.name)}.txt`, text)}
          disabled={!source}
        >
          导出 TXT
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleExportEpub}
          disabled={!source || busy}
        >
          {busy ? '生成中…' : '导出 EPUB'}
        </button>
      </div>
    </section>
  )
}
