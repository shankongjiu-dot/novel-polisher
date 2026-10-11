export type LLMProvider = 'openai' | 'anthropic'

export interface LLMConfig {
  provider: LLMProvider
  baseURL: string
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  modelList?: { id: string; owned_by: string }[]
}

export interface Chapter {
  id: string
  title: string
  paragraphs: string[]
}

export interface Book {
  id: string
  name: string
}

export interface Source {
  id: string
  name: string
  fileName: string
  fingerprint: string
  text: string
  chapters: Chapter[]
  chapterCount: number
  paragraphCount: number
  bookId?: string
}

export type Page = 'import' | 'compare' | 'review' | 'export' | 'settings'

export type SuggestionKind = 'ad' | 'watermark' | 'garbage' | 'typo'

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface Suggestion {
  id: string
  sourceId: string
  chapterId: string
  chapterTitle: string
  paragraphIndex: number
  original: string
  corrected: string
  kind: SuggestionKind
  reason: string
  source: 'rule' | 'llm'
  status: SuggestionStatus
}

/**
 * AI 裁决分类。对照时的每一条裁决都必须归入其一，不允许「无分类」。
 *
 * 其中与星号打码相关的三类（restore / star-uncertain / destar）属于「带星号条目」，
 * 除按序号列出条目的裁决外，必须额外回报「修改后该段完整原文」，供人工核对上下文。
 */
export type VerdictKind =
  | 'restore' // 还原打码：把星号还原为原词（不删除、不弱化）
  | 'star-uncertain' // 打码存疑：无法确定原词/字数，需人工确认，不得臆造也不得删减
  | 'destar' // 删星号垃圾：纯星号行等无正文内容的噪声，可整段删除
  | 'candidate' // 采纳候选：多数/最优候选胜出
  | 'delete' // 删除整段：广告 / 水印 / 乱码污染
  | 'manual' // 需人工：模型未给出有效裁决

export interface VerdictKindMeta {
  /** 短标签，用于结果徽标 */
  label: string
  /** 文类标签，落在「分类」轴上的归类名 */
  category: string
  /** 是否属于「带星号条目」→ 需要额外回报该段全文 */
  needsFullText: boolean
  /** 一句话说明，用于悬浮提示 */
  hint: string
}

export const VERDICT_KIND_META: Record<VerdictKind, VerdictKindMeta> = {
  restore: {
    label: '还原打码',
    category: '星号·还原',
    needsFullText: true,
    hint: '把星号还原为原词。粗俗口语与风土用语是人物塑造的一部分，不删除、不弱化、不改写为书面语。',
  },
  'star-uncertain': {
    label: '打码存疑',
    category: '星号·存疑',
    needsFullText: true,
    hint: '星号处原词或字数无法确定，需人工确认。不得臆造，也不得删减。',
  },
  destar: {
    label: '删星号垃圾',
    category: '星号·噪声',
    needsFullText: true,
    hint: '纯星号行等无正文内容的噪声，可整段删除；与正文内的打码替换不同。',
  },
  candidate: {
    label: '采纳候选',
    category: '选优',
    needsFullText: false,
    hint: '从候选中选出一个采纳。',
  },
  delete: {
    label: '删除整段',
    category: '污染',
    needsFullText: false,
    hint: '整段为网站广告、水印或乱码污染。',
  },
  manual: {
    label: '需人工',
    category: '未决',
    needsFullText: false,
    hint: '模型未给出有效裁决，需人工判定。',
  },
}