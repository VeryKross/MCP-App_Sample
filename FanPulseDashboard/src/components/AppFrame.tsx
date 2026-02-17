import { useEffect, useRef, useState } from 'react'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

interface AppFrameProps {
  client: Client
  uiHtml: string
  toolName: string
  toolArgs: Record<string, unknown>
  toolResult: CallToolResult
}

/**
 * Renders an ext-apps interactive UI inside a sandboxed iframe,
 * using AppBridge to proxy tool calls and provide host context.
 */
export function AppFrame({ client, uiHtml, toolName, toolArgs, toolResult }: AppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeRef = useRef<AppBridge | null>(null)
  const [height, setHeight] = useState(300)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    let bridge: AppBridge | null = null
    let disposed = false

    const setup = async () => {
      // contentWindow is available immediately for an empty iframe
      if (!iframe.contentWindow) {
        await new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
        })
      }
      if (disposed || !iframe.contentWindow) return

      const cw = iframe.contentWindow
      const serverCaps = client.getServerCapabilities?.()

      // Create bridge with proper host capabilities (matching reference impl)
      bridge = new AppBridge(
        client,
        { name: 'FanPulseDashboard', version: '1.0.0' },
        {
          supportedMediaTypes: ['text/html+mcp'],
          serverTools: serverCaps?.tools,
          serverResources: serverCaps?.resources,
        },
        {
          targetOrigin: '*',
          hostContext: {
            theme: 'dark',
            platform: 'web',
            containerDimensions: { width: iframe.clientWidth, maxHeight: 800 },
            displayMode: 'inline' as const,
            styles: {
              variables: {
                '--color-background-primary': '#0d1117',
                '--color-background-secondary': '#161b22',
                '--color-background-tertiary': '#21262d',
                '--color-text-primary': '#e6edf3',
                '--color-text-secondary': '#8b949e',
                '--color-border-primary': '#30363d',
                '--color-ring-info': '#58a6ff',
              },
            },
          },
        }
      )

      bridge.onsizechange = (size) => {
        if (size.height && size.height > 0) {
          setHeight(Math.min(size.height + 20, 800))
        }
      }

      bridge.onerror = (err) => {
        console.error('[AppFrame] Bridge error:', err)
      }

      const transport = new PostMessageTransport(cw, cw)
      const connectPromise = bridge.connect(transport)

      // Inject HTML AFTER transport is listening so bridge catches app.connect()
      cw.document.open()
      cw.document.write(uiHtml)
      cw.document.close()

      await connectPromise

      if (disposed) {
        await bridge.close()
        return
      }

      bridgeRef.current = bridge

      // Send tool input so the UI can pre-populate from LLM args
      bridge.sendToolInput({ name: toolName, arguments: toolArgs })
      bridge.sendToolResult(toolResult)
    }

    setup()

    return () => {
      disposed = true
      if (bridge) {
        bridge.close()
      }
      bridgeRef.current = null
    }
  }, [client, uiHtml, toolName, toolArgs, toolResult])

  return (
    <div className="app-frame">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ height: `${height}px` }}
        title={`${toolName} UI`}
      />
    </div>
  )
}
