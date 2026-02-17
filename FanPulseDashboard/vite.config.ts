import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

function llmProxyPlugin(): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url !== '/api/chat' || req.method !== 'POST') {
          next()
          return
        }

        const token = process.env.GITHUB_TOKEN
        if (!token) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'GITHUB_TOKEN not set' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const upstream = await fetch(
              'https://models.inference.ai.azure.com/chat/completions',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body,
              }
            )

            res.writeHead(upstream.status, {
              'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
              'Access-Control-Allow-Origin': '*',
            })

            if (upstream.body) {
              const reader = upstream.body.getReader()
              const pump = async () => {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) { res.end(); return }
                  res.write(value)
                }
              }
              await pump()
            } else {
              res.end(await upstream.text())
            }
          } catch (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin()],
  server: {
    port: 5173,
    proxy: {
      // Proxy MCP requests to the TypeScript server (must be before /api/fanpulse)
      '/api/fanpulseapps': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fanpulseapps/, '/mcp'),
      },
      // Proxy MCP requests to the C# server
      '/api/fanpulse': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fanpulse/, ''),
      },
    },
  },
})
