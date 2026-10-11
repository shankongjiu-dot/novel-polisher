import type { Chapter, Source } from '../types'

export interface Variant {
  text: string
  count: number
  sources: string[]
}

export interface CompareRow {
  chapterTitle: string
  sequence: number
  anchorChapterId: string
  anchorParagraphIndex: number
  variants: Variant[]
  winner: string
  majority: number
  total: number
  unanimous: boolean
  conflict: boolean
  diff: boolean
}

export interface CompareSummary {
  rows: CompareRow[]
  totalDiffs: number
  conflicts: number
}

function norm(s: string): string {
  return s.replace(/\s+/g, '')
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  const t = norm(s)
  if (t.length === 0) return out
  if (t.length === 1) {
    out.add(t)
    return out
  }
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

function diceSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  for (const x of small) if (big.has(x)) inter++
  return (2 * inter) / (a.size + b.size)
}

function bigramsList(strs: string[]): Set<string>[] {
  return strs.map(bigrams)
}

function lcsPairs(
  a: string[],
  b: string[],
  threshold: number,
): [number, number][] {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return []
  const ba = bigramsList(a)
  const bb = bigramsList(b)
  const match = Array.from({ length: n }, () => new Uint8Array(m))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      match[i][j] = diceSets(ba[i], bb[j]) >= threshold ? 1 : 0
    }
  }
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = 1; i <= n; i++) {
    const cur = dp[i]
    const prev = dp[i - 1]
    const mi = match[i - 1]
    for (let j = 1; j <= m; j++) {
      cur[j] = mi[j - 1] ? prev[j - 1] + 1 : prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1]
    }
  }
  const pairs: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (match[i - 1][j - 1]) {
      pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return pairs.reverse()
}

function alignChapters(a: Chapter[], b: Chapter[]): [number, number][] {
  return lcsPairs(a.map((c) => c.title), b.map((c) => c.title), 0.6)
}

interface IndexedParas {
  texts: string[]
  indices: number[]
}

function indexedParas(paragraphs: string[]): IndexedParas {
  const texts: string[] = []
  const indices: number[] = []
  paragraphs.forEach((p, i) => {
    if (p.trim().length > 0) {
      texts.push(p)
      indices.push(i)
    }
  })
  return { texts, indices }
}

export interface CompareProgress {
  stage: string
  done: number
  total: number
}

export function compareSources(
  sources: Source[],
  onProgress?: (p: CompareProgress) => void,
): CompareSummary {
  const anchor = sources[0]
  const rows: CompareRow[] = []
  const rowIndexOf = new Map<string, number>()

  onProgress?.({ stage: '初始化锚点行', done: 0, total: 0 })
  const anchorIndexed = new Map<string, IndexedParas>()
  anchor.chapters.forEach((ch) => {
    const { texts, indices } = indexedParas(ch.paragraphs)
    anchorIndexed.set(ch.id, { texts, indices })
    texts.forEach((text, k) => {
      rowIndexOf.set(`${ch.id}:${indices[k]}`, rows.length)
      rows.push({
        chapterTitle: ch.title,
        sequence: 0,
        anchorChapterId: ch.id,
        anchorParagraphIndex: indices[k],
        variants: [{ text, count: 1, sources: [anchor.name] }],
        winner: '',
        majority: 1,
        total: 1,
        unanimous: true,
        conflict: false,
        diff: false,
      })
    })
  })

  const others = sources.slice(1)
  const chapterPairGroups = others.map((other) => ({
    other,
    pairs: alignChapters(anchor.chapters, other.chapters),
  }))
  const totalPairs = chapterPairGroups.reduce((acc, g) => acc + g.pairs.length, 0)
  let donePairs = 0

  for (const { other, pairs } of chapterPairGroups) {
    for (const [ai, bi] of pairs) {
      const aCh = anchor.chapters[ai]
      const bCh = other.chapters[bi]
      const aIdx = anchorIndexed.get(aCh.id)!
      const bIdx = indexedParas(bCh.paragraphs)
      const paraPairs = lcsPairs(aIdx.texts, bIdx.texts, 0.6)
      for (const [k, l] of paraPairs) {
        const rowIdx = rowIndexOf.get(`${aCh.id}:${aIdx.indices[k]}`)
        if (rowIdx === undefined) continue
        const row = rows[rowIdx]
        const text = bIdx.texts[l]
        const existing = row.variants.find((v) => norm(v.text) === norm(text))
        if (existing) {
          existing.count++
          existing.sources.push(other.name)
        } else {
          row.variants.push({ text, count: 1, sources: [other.name] })
        }
      }
      donePairs++
      onProgress?.({ stage: `对齐段落·${other.name}`, done: donePairs, total: totalPairs })
    }
  }

  onProgress?.({ stage: '投票统计', done: 0, total: rows.length })
  let totalDiffs = 0
  let conflicts = 0
  rows.forEach((row, i) => {
    row.sequence = i
    row.total = row.variants.reduce((acc, v) => acc + v.count, 0)
    const max = Math.max(...row.variants.map((v) => v.count))
    row.majority = max
    const winners = row.variants.filter((v) => v.count === max)
    row.unanimous = row.variants.length === 1
    row.conflict = winners.length > 1
    row.diff = row.variants.length > 1
    row.winner = winners.length === 1 ? winners[0].text : ''
    if (row.diff) totalDiffs++
    if (row.conflict) conflicts++
  })

  return { rows, totalDiffs, conflicts }
}