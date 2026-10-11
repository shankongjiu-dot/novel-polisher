import type { Source, Suggestion } from '../types'

const DB_NAME = 'novel-polisher'
const DB_VERSION = 3
const STORE_SOURCES = 'sources'
const STORE_SUGGESTIONS = 'suggestions'
const STORE_PROGRESS = 'progress'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SOURCES)) {
        db.createObjectStore(STORE_SOURCES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SUGGESTIONS)) {
        const store = db.createObjectStore(STORE_SUGGESTIONS, { keyPath: 'id' })
        store.createIndex('sourceId', 'sourceId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS, { keyPath: 'sourceId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadAllSources(): Promise<Source[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SOURCES, 'readonly')
    const req = tx.objectStore(STORE_SOURCES).getAll()
    req.onsuccess = () => resolve((req.result as Source[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function putSource(source: Source): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SOURCES, 'readwrite')
    tx.objectStore(STORE_SOURCES).put(source)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteSource(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SOURCES, 'readwrite')
    tx.objectStore(STORE_SOURCES).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearAllSources(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SOURCES, 'readwrite')
    tx.objectStore(STORE_SOURCES).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadSuggestionsBySource(sourceId: string): Promise<Suggestion[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUGGESTIONS, 'readonly')
    const idx = tx.objectStore(STORE_SUGGESTIONS).index('sourceId')
    const req = idx.getAll(sourceId)
    req.onsuccess = () => resolve((req.result as Suggestion[]) ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function putSuggestion(s: Suggestion): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUGGESTIONS, 'readwrite')
    tx.objectStore(STORE_SUGGESTIONS).put(s)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteSuggestion(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUGGESTIONS, 'readwrite')
    tx.objectStore(STORE_SUGGESTIONS).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearSuggestionsBySource(sourceId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SUGGESTIONS, 'readwrite')
    const idx = tx.objectStore(STORE_SUGGESTIONS).index('sourceId')
    const req = idx.openCursor(sourceId)
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadProgress(sourceId: string): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readonly')
    const req = tx.objectStore(STORE_PROGRESS).get(sourceId)
    req.onsuccess = () => {
      const rec = req.result as { sourceId: string; keys: string[] } | undefined
      resolve(rec?.keys ?? [])
    }
    req.onerror = () => reject(req.error)
  })
}

export async function saveProgress(sourceId: string, keys: string[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readwrite')
    tx.objectStore(STORE_PROGRESS).put({ sourceId, keys })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearProgress(sourceId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readwrite')
    tx.objectStore(STORE_PROGRESS).delete(sourceId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
