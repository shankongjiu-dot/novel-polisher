import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { fetchModels, testConnection } from '../lib/llm'
import type { LLMConfig } from '../types'

export function SettingsPanel() {
  const { config, setConfig } = useApp()
  const [draft, setDraft] = useState<LLMConfig>(config)
  const [testing, setTesting] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function update<K extends keyof LLMConfig>(key: K, value: LLMConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSave() {
    setConfig(draft)
    setResult({ ok: true, msg: '已保存到本地' })
  }

  async function handleTest() {
    setConfig(draft)
    setTesting(true)
    setResult(null)
    try {
      const reply = await testConnection(draft)
      setResult({ ok: true, msg: `连接成功：${reply.trim().slice(0, 60)}` })
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function handleFetch() {
    if (!draft.baseURL) {
      setResult({ ok: false, msg: '请先填写接口地址' })
      return
    }
    setConfig(draft)
    setFetching(true)
    setResult(null)
    try {
      const models = await fetchModels(draft)
      if (models.length === 0) {
        setResult({ ok: false, msg: '拉取成功但返回空列表，可直接手填模型名' })
      } else {
        setDraft((d) => ({ ...d, modelList: models }))
        setResult({ ok: true, msg: `成功拉取 ${models.length} 个模型，点击列表选用` })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setFetching(false)
    }
  }

  const filteredModels = useMemo(() => {
    const list = draft.modelList ?? []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((m) => m.id.toLowerCase().includes(q) || m.owned_by.toLowerCase().includes(q))
  }, [draft.modelList, search])

  return (
    <section className="settings panel">
      <header className="panel-head">
        <h1>模型配置</h1>
        <p>配置 OpenAI 兼容接口，用于后续分歧点的 AI 仲裁与校对。</p>
      </header>

      <div className="field">
        <label htmlFor="provider">接口类型</label>
        <select
          id="provider"
          className="select"
          value={draft.provider}
          onChange={(e) => update('provider', e.target.value as 'openai' | 'anthropic')}
        >
          <option value="openai">OpenAI 兼容（Bearer + /chat/completions）</option>
          <option value="anthropic">Anthropic 原生（x-api-key + /v1/messages）</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="baseURL">接口地址</label>
        <input
          id="baseURL"
          type="url"
          value={draft.baseURL}
          onChange={(e) => update('baseURL', e.target.value)}
          placeholder={
            draft.provider === 'anthropic'
              ? 'https://api.anthropic.com/v1'
              : 'https://api.openai.com/v1'
          }
        />
        <span className="hint">
          {draft.provider === 'anthropic'
            ? 'Anthropic 原生端点，填到 /v1 即可'
            : 'OpenAI 兼容服务，如 OpenRouter、Together 等'}
        </span>
      </div>

      <div className="field">
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type="password"
          value={draft.apiKey}
          onChange={(e) => update('apiKey', e.target.value)}
          placeholder="sk-..."
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="model">模型</label>
        <div className="model-row">
          <input
            id="model"
            type="text"
            value={draft.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="gpt-4o-mini"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? '拉取中…' : '拉取模型'}
          </button>
        </div>
        {draft.modelList && draft.modelList.length > 0 && (
          <div className="model-picker">
            <input
              type="search"
              className="model-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`搜索 ${draft.modelList.length} 个模型…`}
            />
            <div className="model-list">
              {filteredModels.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`model-item${m.id === draft.model ? ' active' : ''}`}
                  onClick={() => update('model', m.id)}
                  title={m.owned_by || m.id}
                >
                  {m.id}
                </button>
              ))}
              {filteredModels.length === 0 && (
                <span className="hint">无匹配模型</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="maxTokens">最大输出 tokens</label>
          <input
            id="maxTokens"
            type="number"
            min={1}
            value={draft.maxTokens}
            onChange={(e) => update('maxTokens', Number(e.target.value) || 32768)}
          />
          <span className="hint">现代模型输出普遍以万计；仲裁一次调用裁决多条，此值越大单批越多。超过模型上限会报错</span>
        </div>
        <div className="field">
          <label htmlFor="temperature">温度</label>
          <input
            id="temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature}
            onChange={(e) => update('temperature', Number(e.target.value) || 0.8)}
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={handleSave}>
          保存
        </button>
        <button type="button" className="btn btn-primary" onClick={handleTest} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </button>
      </div>

      {result && (
        <p className={`result${result.ok ? '' : ' error'}`} role="status">
          {result.msg}
        </p>
      )}
    </section>
  )
}
