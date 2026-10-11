import { fetch as undiciFetch, ProxyAgent } from 'undici'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

interface FetchPayload {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

function resolveProxyDispatcher(env: Record<string, string>) {
  const proxyUrl =
    env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || ''
  if (!proxyUrl) return undefined
  try {
    return new ProxyAgent(proxyUrl)
  } catch {
    return undefined
  }
}

function shouldBypassProxy(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url)
}

async function upstreamFetch(payload: FetchPayload, dispatcher?: ProxyAgent) {
  if (dispatcher && !shouldBypassProxy(payload.url)) {
    try {
      return await undiciFetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
        dispatcher,
      })
    } catch {
      return await undiciFetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      })
    }
  }
  return await undiciFetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.body,
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dispatcher = resolveProxyDispatcher(env)

  return {
  plugins: [
    react(),
    {
      name: 'llm-proxy',
      configureServer(server) {
        server.middlewares.use('/__llm_fetch', async (req: any, res: any) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          let payload: { url: string; method: string; headers: Record<string, string>; body?: string }
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            res.statusCode = 400
            res.end('Bad JSON')
            return
          }
          try {
            const upstream = await upstreamFetch(payload, dispatcher ?? undefined)
            const text = await upstream.text()
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: upstream.status, body: text }))
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 0, body: String(e) }))
          }
        })
      },
    },
  ],
  }
})
