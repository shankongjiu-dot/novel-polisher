import type { LLMConfig, VerdictKind } from '../types'
import { VERDICT_KIND_META } from '../types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LlmResponse {
  status: number
  body: string
}

async function llmFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<LlmResponse> {
  if (import.meta.env.DEV) {
    const r = await fetch('/__llm_fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, method: init.method, headers: init.headers, body: init.body }),
    })
    if (!r.ok) throw new Error(`本地代理请求失败（${r.status}）`)
    return (await r.json()) as LlmResponse
  }
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body })
  return { status: r.status, body: await r.text() }
}

function normalizeApiUrl(baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (url.endsWith('/chat/completions')) return url
  if (url.endsWith('/completions')) return url
  return `${url}/chat/completions`
}

function deriveModelsUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '')
  url = url.replace(/\/chat\/completions$/, '')
  url = url.replace(/\/completions$/, '')
  return `${url}/models`
}

function anthropicMessagesUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '')
  if (url.endsWith('/messages')) return url
  if (url.includes('/v1')) return `${url}/messages`
  return `${url}/v1/messages`
}

function anthropicModelsUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '')
  if (url.endsWith('/models')) return url
  if (url.includes('/v1')) return `${url}/models`
  return `${url}/v1/models`
}

function authHeaders(config: LLMConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = (config.apiKey || '').trim()
  if (!key) return headers
  if (config.provider === 'anthropic') {
    headers['x-api-key'] = key
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

export async function chat(config: LLMConfig, messages: ChatMessage[]): Promise<string> {
  let url: string
  let body: string
  let extract: (data: any) => string | undefined

  if (config.provider === 'anthropic') {
    url = anthropicMessagesUrl(config.baseURL)
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const userMsgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))
    body = JSON.stringify({
      model: config.model,
      messages: userMsgs,
      max_tokens: config.maxTokens,
      ...(system ? { system } : {}),
      temperature: config.temperature,
    })
    extract = (data) =>
      Array.isArray(data.content) ? data.content.map((b: any) => b.text || '').join('') : undefined
  } else {
    url = normalizeApiUrl(config.baseURL)
    body = JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    })
    extract = (data) => data.choices?.[0]?.message?.content
  }

  const { status, body: respBody } = await llmFetch(url, {
    method: 'POST',
    headers: authHeaders(config),
    body,
  })

  if (status !== 200) {
    throw new Error(`LLM 请求失败（${status}）：${respBody.slice(0, 300)}`)
  }

  const data = JSON.parse(respBody)
  const content = extract(data)
  if (!content) throw new Error('LLM 返回内容为空')
  return content
}

export async function testConnection(config: LLMConfig): Promise<string> {
  return chat(config, [{ role: 'user', content: '请只回复两个字：成功' }])
}

export async function fetchModels(
  config: LLMConfig,
): Promise<{ id: string; owned_by: string }[]> {
  const url =
    config.provider === 'anthropic'
      ? anthropicModelsUrl(config.baseURL)
      : deriveModelsUrl(config.baseURL)
  let status: number
  let body: string
  try {
    const r = await llmFetch(url, { method: 'GET', headers: authHeaders(config) })
    status = r.status
    body = r.body
  } catch (err) {
    throw new Error(`网络请求失败：${err instanceof Error ? err.message : '无法连接'}`)
  }

  if (status !== 200) {
    throw new Error(`拉取模型失败（${status}）：${body.slice(0, 200)}。可直接手填模型名并保存。`)
  }

  const data = JSON.parse(body)
  if (Array.isArray(data.data)) {
    return data.data.map((m: { id?: string; owned_by?: string }) => ({
      id: m.id || '',
      owned_by: m.owned_by || '',
    }))
  }
  if (Array.isArray(data.models)) {
    return data.models.map((m: string | { id?: string; owned_by?: string }) =>
      typeof m === 'string' ? { id: m, owned_by: '' } : { id: m.id || '', owned_by: m.owned_by || '' },
    )
  }
  return []
}

const PROOFREAD_SYSTEM =
  '你是资深小说校对助手。请修正下面段落中的错别字、错误标点和明显语病，但必须保持原意与行文风格完全不变。' +
  '若段落中出现连续星号（* 或 ＊），通常是网站为规避审查将敏感词（如「死」「杀」「他妈的」等粗俗口语）打码替换，请根据上下文在星号位置还原最自然常用的词。' +
  '注意：不要把打码段整体拿掉——「他****全家的玩意」不是「他全家的玩意」，而应还原为「他妈的死全家的玩意」一类保留原词的结果。' +
  '这类粗俗口语与风土用语是人物塑造的一部分，不得删除、不得弱化、不得改写为书面语。' +
  '若星号处原词或字数无法确定，请原样保留星号，不要臆造也不要删减。' +
  '直接输出修正后的全文，不要任何解释、说明或额外内容；若无须修改，请原样输出。'

export async function proofread(config: LLMConfig, text: string): Promise<string> {
  const content = await chat(config, [
    { role: 'system', content: PROOFREAD_SYSTEM },
    { role: 'user', content: text },
  ])
  return content.trim()
}

export interface ArbitrateCandidate {
  text: string
  sources: string[]
}

export interface ArbitrateVerdict {
  acceptedIndex: number
  text: string | null
  label: string
  /** 裁决分类：每条裁决必须归入其一 */
  kind: VerdictKind
}

const STAR_CHAR_RE = /[*＊]/

function hasStarmark(text: string): boolean {
  return STAR_CHAR_RE.test(text)
}

export async function arbitrate(
  config: LLMConfig,
  candidates: ArbitrateCandidate[],
): Promise<ArbitrateVerdict> {
  const stars = candidates.some((c) => hasStarmark(c.text))
  const map = await arbitrateBatch(config, [{ id: 0, candidates, stars }])
  const v = map.get(0)
  if (!v) throw new Error('LLM 仲裁结果为空')
  return v
}

export interface ArbitrateItem {
  id: number
  candidates: ArbitrateCandidate[]
  /** 该组中是否存在连续星号（打码痕迹）→ 进入「星号组」，须额外回报整段全文 */
  stars: boolean
}

/**
 * 星号相关分类的文本完整性检查：
 * 还原/存疑/删星号都必须是「该段完整文本」，而不是关键词或片段。
 *
 * 只看「较短一侧为分母」会漏判——片段恰好是候选子串时覆盖率恒为 1.0。
 * 因此改用方向性检查：以「候选 → 裁决」的覆盖率为准，要求该段候选内容
 * 基本都被裁决结果包含（还原时星号被换字，覆盖率约 0.8；只回关键词片段则骤降至 0.2）。
 * 反方向（裁决 → 候选）不设限，因为还原本就可能补全候选缺失的上下文。
 */
export function isFullParagraphRisk(
  item: { candidates: ArbitrateCandidate[] },
  text: string | null,
): boolean {
  if (!text) return false
  const norm = (s: string) => s.replace(/\s+/g, '')
  const t = norm(text)
  if (t.length === 0) return true
  const grams = (s: string) => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const gt = grams(t)
  // 取 bigram 最多的候选作为基准：它信息量最足，最能暴露「只回片段」
  const bases = item.candidates.map((c) => grams(norm(c.text))).filter((g) => g.size > 0)
  if (bases.length === 0) return false
  const gc = bases.reduce((a, b) => (b.size > a.size ? b : a))
  let inter = 0
  for (const g of gc) if (gt.has(g)) inter++
  return inter / gc.size < 0.5
}

const ARBITRATE_BATCH_SYSTEM =
  '你是资深小说校对。下面给出若干组「条目」，每组是同一段落的多个候选版本（候选来自不同来源，可能含错别字、杂质或缺失，候选编号从 1 开始）。\n' +
  '【任务】对照每条条目，给出一个裁决，并把它归入下面 6 个分类之一，不得遗漏任何条目。\n' +
  '【分类】\n' +
  '1. `restore`（还原打码｜星号条目）：候选中的连续星号（* 或 ＊）是网站为规避审查，把敏感词直接打码替换（如「死」「杀」「他妈的」等）。把星号位置还原为最符合原文的完整词句。\n' +
  '   粗俗口语与风土用语是人物塑造的一部分，必须完整还原以保持艺术性：不得删除、不得弱化、不得省略、不得改写为书面语。\n' +
  '   特别注意：不得因为要「去掉星号」就把打码段整体拿掉。反例——「他****全家的玩意」错解为「他全家的玩意」；正确应为「他妈的死全家的玩意」一类保留原词的结果。\n' +
  '2. `star-uncertain`（打码存疑｜星号条目）：星号处原词或字数无法从上下文确定。此时必须原样保留星号位置（不得臆造、不得删减），并在 `note` 里写明不确定的原因与推测范围。\n' +
  '3. `destar`（删星号垃圾｜星号条目）：该段除星号外没有任何正文内容，属于排版噪声或占位，可整段删除。仅当确认「无正文内容」时才可归入此类。\n' +
  '4. `candidate`（采纳候选）：从候选中选一个采纳，输出该候选编号。\n' +
  '5. `delete`（删除整段）：该段是网站广告、水印或乱码污染，与正文无关，整段删除。\n' +
  '6. `manual`（需人工）：证据不足以裁决，交人工处理。\n' +
  '【输出格式】严格输出单个 JSON 对象，键为条目编号（数字字符串），值为对象：\n' +
  '  {"v": 值, "k": 分类, "note": "可选补充"}\n' +
  '  - `k` 取上述分类名之一，必填。\n' +
  '  - `v` 随分类而定：`candidate` 为候选编号（数字）；`delete` 为 0；`restore` / `star-uncertain` 为「还原或保留后的该段完整文本」（字符串，不是关键词、不是片段）；`destar` 为 ""；`manual` 可为 null。\n' +
  '  - 标有「｜含星号」的条目必须给出 `v` 字符串，且必须是修改后该段的完整原文全文，不得只给差异片段。\n' +
  '【要求】每个条目都必须给出裁决，不得遗漏；只输出 JSON，不要任何解释、注释或多余字符。\n' +
  '示例：{"0": {"v": 2, "k": "candidate"}, "1": {"v": "他妈的死全家的玩意", "k": "restore"}, "2": {"v": 0, "k": "delete"}, "3": {"v": "他****全家的玩意", "k": "star-uncertain", "note": "4 星对应字数存疑，保留原样待人工"}}'

const STAR_GROUP_RULE: Record<VerdictKind, VerdictKind> = {
  // 星号组允许的分类；不在表内的分类一律降级（如 delete → destar）
  restore: 'restore',
  'star-uncertain': 'star-uncertain',
  destar: 'destar',
  candidate: 'candidate',
  manual: 'manual',
  delete: 'destar',
}

const PLAIN_GROUP_RULE: Record<VerdictKind, VerdictKind> = {
  // 非星号组：不允许出现还原/存疑（无星号可还原）
  restore: 'candidate',
  'star-uncertain': 'manual',
  destar: 'delete',
  candidate: 'candidate',
  delete: 'delete',
  manual: 'manual',
}

function coerceKind(raw: unknown, stars: boolean): VerdictKind {
  const rule = stars ? STAR_GROUP_RULE : PLAIN_GROUP_RULE
  if (typeof raw === 'string' && raw in rule) return rule[raw as VerdictKind]
  return 'manual'
}

export interface RawVerdict {
  v?: unknown
  k?: unknown
  note?: unknown
}

/** 解析模型返回的 JSON 对象，值为 {v,k,note} 对象（宽松兼容旧的裸数字/裸字符串） */
function extractJsonMap(raw: string): Map<number, RawVerdict> | null {
  const trimmed = raw.trim()
  let obj: unknown = null
  try {
    obj = JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      obj = JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
  const map = new Map<number, RawVerdict>()
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    const id = Number(k)
    if (Number.isNaN(id)) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      map.set(id, v as RawVerdict)
    } else if (typeof v === 'string' || typeof v === 'number') {
      // 兼容旧格式：裸值，无分类标签
      map.set(id, { v })
    }
  }
  return map
}


function toVerdict(item: ArbitrateItem, raw: RawVerdict): ArbitrateVerdict | null {
  const kind = coerceKind(raw.k, item.stars)
  const meta = VERDICT_KIND_META[kind]
  const label = meta.label

  if (kind === 'delete' || kind === 'destar') {
    return { acceptedIndex: -1, text: null, label, kind }
  }

  if (kind === 'candidate') {
    const n = Number(raw.v)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null
    const cand = item.candidates[n - 1]
    if (!cand) return null
    return { acceptedIndex: n - 1, text: cand.text, label: `采纳 ${cand.sources.join(' / ')}`, kind }
  }

  // restore / star-uncertain / manual：值应为完整的该段文本
  if (raw.v === null || raw.v === undefined) {
    if (kind === 'manual') return { acceptedIndex: -2, text: null, label, kind }
    return null
  }
  const text = String(raw.v).trim()
  if (!text) return null
  return { acceptedIndex: -2, text, label, kind }
}

function arbitrateHalf(
  config: LLMConfig,
  items: ArbitrateItem[],
): Promise<Map<number, ArbitrateVerdict>> {
  // 二分只在仍可切分时进行；单条仍失败则留空，由 UI 标为「需人工」，不丢弃该条目
  if (items.length <= 1) return Promise.resolve(new Map())
  const mid = Math.max(1, Math.floor(items.length / 2))
  return Promise.all([
    arbitrateBatch(config, items.slice(0, mid)),
    arbitrateBatch(config, items.slice(mid)),
  ]).then(([left, right]) => new Map([...left, ...right]))
}

export async function arbitrateBatch(
  config: LLMConfig,
  items: ArbitrateItem[],
): Promise<Map<number, ArbitrateVerdict>> {
  if (items.length === 0) return new Map()
  const parts = items.map(
    (it) => {
      const head = it.stars ? `【条目 ${it.id}｜含星号】` : `【条目 ${it.id}｜无星号】`
      return (
        head +
        '\n' +
        it.candidates
          .map((c, j) => `候选 ${j + 1}（来自：${c.sources.join(' / ') || '未知'}）:\n${c.text}`)
          .join('\n\n')
      )
    },
  )
  let content: string
  try {
    content = await chat(config, [
      { role: 'system', content: ARBITRATE_BATCH_SYSTEM },
      { role: 'user', content: parts.join('\n\n----\n\n') },
    ])
  } catch {
    return arbitrateHalf(config, items)
  }
  const parsed = extractJsonMap(content)
  if (!parsed) return arbitrateHalf(config, items)
  const result = new Map<number, ArbitrateVerdict>()
  const missing: ArbitrateItem[] = []
  for (const item of items) {
    const raw = parsed.get(item.id)
    const verdict = raw === undefined ? null : toVerdict(item, raw)
    if (verdict) result.set(item.id, verdict)
    else missing.push(item)
  }
  if (missing.length > 0) {
    const rest = await arbitrateBatch(config, missing)
    for (const [id, verdict] of rest) result.set(id, verdict)
  }
  return result
}

export function estimateArbitrateCost(
  item: { candidates: { text: string; sources?: string[] }[] },
): number {
  const input = item.candidates.reduce(
    (sum, c) => sum + Math.ceil(c.text.length / 2) + 8 + (c.sources?.length ?? 0),
    0,
  )
  return input + 12
}
