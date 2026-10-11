import type { Source } from '../types'

const ILLEGAL_FILE_CHARS = /[\\/:*?"<>|]/g

export function deriveBookName(name: string): string {
  const titled = name.match(/《[^》]+》/)
  if (titled) return titled[0]
  const cleaned = name
    .replace(/[【[(（].*?[】\]）)]/g, '')
    .replace(/[_\-–—].*$/, '')
    .replace(/作者[:：].*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return (cleaned || name).replace(ILLEGAL_FILE_CHARS, '')
}

export function sourceToText(source: Source): string {
  const parts: string[] = []
  for (const chapter of source.chapters) {
    parts.push(chapter.title)
    for (const p of chapter.paragraphs) {
      if (p.length > 0) parts.push(p)
    }
    parts.push('')
  }
  return parts.join('\n\n').trim() + '\n'
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}