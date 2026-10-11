import type { Source } from '../types'
import type { CompareProgress, CompareSummary } from './compare'

export interface CompareJob {
  promise: Promise<CompareSummary>
  cancel: () => void
}

export function compareSourcesAsync(
  sources: Source[],
  onProgress?: (p: CompareProgress) => void,
): CompareJob {
  const worker = new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' })
  const promise = new Promise<CompareSummary>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as
        | ({ type: 'progress' } & CompareProgress)
        | { type: 'done'; result: CompareSummary }
        | { type: 'error'; error: string }
      if (data.type === 'progress') onProgress?.({ stage: data.stage, done: data.done, total: data.total })
      else if (data.type === 'done') resolve(data.result)
      else reject(new Error(data.error))
    }
    worker.onerror = (ev) => reject(new Error(ev.message || '对照计算失败'))
  })
  worker.postMessage({ sources })
  return {
    promise,
    cancel: () => worker.terminate(),
  }
}
