import type { Source } from '../types'
import { compareSources } from './compare'

self.onmessage = (e: MessageEvent<{ sources: Source[] }>) => {
  const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg)
  try {
    const result = compareSources(e.data.sources, (p) => post({ type: 'progress', ...p }))
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
