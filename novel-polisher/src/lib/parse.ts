import type { Chapter } from '../types'

const CHAPTER_RE =
  /^\s*(第[一二三四五六七八九十百千万零〇两0-9]+[章回节卷集部篇][^\n]*|[Cc]hapter\s+\d+[^\n]*|序章|楔子|引子|终章|尾声|番外[^\n]*)\s*$/

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function splitChapters(text: string): Chapter[] {
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const chapters: Chapter[] = []
  let current: { title: string; paragraphs: string[] } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (CHAPTER_RE.test(trimmed)) {
      if (current) {
        chapters.push({
          id: `c${chapters.length}`,
          title: current.title,
          paragraphs: current.paragraphs,
        })
      }
      current = { title: trimmed, paragraphs: [] }
    } else if (current) {
      current.paragraphs.push(trimmed)
    }
  }

  if (current) {
    chapters.push({
      id: `c${chapters.length}`,
      title: current.title,
      paragraphs: current.paragraphs,
    })
  }

  if (chapters.length === 0) {
    chapters.push({
      id: 'c0',
      title: '全文',
      paragraphs: splitParagraphs(normalized),
    })
  }

  return chapters.map((c) => ({ ...c, paragraphs: c.paragraphs.filter((p) => p.length > 0) }))
}

export function fingerprint(text: string): string {
  let hash = 5381
  const sample = text.replace(/\s+/g, '').slice(0, 20000)
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) + hash + sample.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

export async function readTxtFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('gb18030').decode(bytes)
  }
}