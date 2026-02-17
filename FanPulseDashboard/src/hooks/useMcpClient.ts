import { useState, useEffect, useRef } from 'react'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { McpConnection, ServerName } from '../types'
import { SERVERS } from '../types'

export function useMcpClient(serverName: ServerName): McpConnection {
  const config = SERVERS[serverName]
  const [status, setStatus] = useState<McpConnection['status']>('connecting')
  const [tools, setTools] = useState<Tool[]>([])
  const [error, setError] = useState<string>()
  const clientRef = useRef<Client | null>(null)

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      try {
        setStatus('connecting')
        const client = new Client(
          { name: 'FanPulseDashboard', version: '1.0.0' },
          { capabilities: { tools: {}, resources: {} } }
        )

        const transport = new StreamableHTTPClientTransport(
          new URL(config.endpoint, window.location.origin)
        )

        await client.connect(transport)
        if (cancelled) { await client.close(); return }

        const { tools: serverTools } = await client.listTools()
        if (cancelled) { await client.close(); return }

        clientRef.current = client
        setTools(serverTools)
        setStatus('connected')
      } catch (err) {
        if (!cancelled) {
          setError(String(err))
          setStatus('disconnected')
        }
      }
    }

    connect()
    return () => {
      cancelled = true
      clientRef.current?.close()
      clientRef.current = null
    }
  }, [config.endpoint])

  return {
    client: clientRef.current!,
    tools,
    status,
    error,
  }
}

export function useMcpClients() {
  const fanpulse = useMcpClient('fanpulse')
  const fanpulseapps = useMcpClient('fanpulseapps')
  return { fanpulse, fanpulseapps }
}
