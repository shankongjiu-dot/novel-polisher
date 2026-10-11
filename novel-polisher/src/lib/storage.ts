import type { Book, LLMConfig } from '../types'

const CONFIG_KEY = 'novel-polisher:config'
const BOOKS_KEY = 'novel-polisher:books'

export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 32768,
  temperature: 0.8,
}

export function loadConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: LLMConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function loadBooks(): Book[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveBooks(books: Book[]): void {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
}