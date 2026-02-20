import { useState, useCallback, useRef } from 'react'
import { useMcpClients } from '../hooks/useMcpClient'
import { runChat } from '../hooks/chatService'
import { ChatPanel } from './ChatPanel'
import { XRayPanel } from './XRayPanel'
import type { ChatMessage, XRayEvent, XRayTurn } from '../types'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge'

interface ToolCallMeta {
  toolName: string
  toolArgs: Record<string, unknown>
  toolResult: CallToolResult
}

export function App() {
  const { fanpulse, fanpulseapps } = useMcpClients()
  const [input, setInput] = useState('')
  const [fpMessages, setFpMessages] = useState<ChatMessage[]>([])
  const [appsMessages, setAppsMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [activePanel, setActivePanel] = useState<'none' | 'fanpulse' | 'fanpulseapps'>('none')
  const fpHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const appsHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  // Track tool call metadata for AppBridge (keyed by message index in appsMessages)
  const [appsToolCallMeta, setAppsToolCallMeta] = useState<Map<number, ToolCallMeta>>(new Map())
  // X-Ray panel state
  const [xrayOpen, setXrayOpen] = useState(false)
  const [xrayTurns, setXrayTurns] = useState<{ fanpulse: XRayTurn[]; fanpulseapps: XRayTurn[] }>({
    fanpulse: [],
    fanpulseapps: [],
  })

  const addXRayTurn = (server: 'fanpulse' | 'fanpulseapps', prompt: string): number => {
    const newTurn: XRayTurn = { prompt, startedAt: Date.now(), events: [], complete: false }
    setXrayTurns((prev) => ({ ...prev, [server]: [...prev[server], newTurn] }))
    return Date.now() // used as a key; actual index computed from state length
  }

  const appendXRayEvent = (server: 'fanpulse' | 'fanpulseapps', event: XRayEvent) => {
    setXrayTurns((prev) => {
      const turns = prev[server]
      if (turns.length === 0) return prev
      const updated = [...turns]
      const last = { ...updated[updated.length - 1] }
      last.events = [...last.events, event]
      updated[updated.length - 1] = last
      return { ...prev, [server]: updated }
    })
  }

  const completeXRayTurn = (server: 'fanpulse' | 'fanpulseapps') => {
    setXrayTurns((prev) => {
      const turns = prev[server]
      if (turns.length === 0) return prev
      const updated = [...turns]
      updated[updated.length - 1] = { ...updated[updated.length - 1], complete: true }
      return { ...prev, [server]: updated }
    })
  }

  const bothConnected = fanpulse.status === 'connected' && fanpulseapps.status === 'connected'

  const handleSend = useCallback(async () => {
    if (!input.trim() || isProcessing || !bothConnected) return

    const prompt = input.trim()
    setInput('')
    setIsProcessing(true)

    // Add user message to both panels
    setFpMessages((prev) => [...prev, { role: 'user', content: prompt }])
    setAppsMessages((prev) => [...prev, { role: 'user', content: prompt }])

    // Run C# server first (sequential to avoid rate limits)
    setActivePanel('fanpulse')
    addXRayTurn('fanpulse', prompt)
    try {
      const { text, updatedHistory } = await runChat(
        prompt,
        fpHistoryRef.current as never[],
        fanpulse.tools,
        async (name, args) => {
          const result = await fanpulse.client.callTool({ name, arguments: args })
          const textContent = result.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n')
          return textContent
        },
        (msg) => setFpMessages((prev) => [...prev, msg]),
        (event) => appendXRayEvent('fanpulse', event)
      )
      fpHistoryRef.current = updatedHistory as never[]
      setFpMessages((prev) => [...prev, { role: 'assistant', content: text }])
    } catch (err) {
      setFpMessages((prev) => [...prev, { role: 'error', content: String(err) }])
    }
    completeXRayTurn('fanpulse')

    // Then run Apps server
    setActivePanel('fanpulseapps')
    addXRayTurn('fanpulseapps', prompt)
    try {
      let lastToolMeta: (ToolCallMeta & { html: string }) | null = null

      const { text, updatedHistory } = await runChat(
        prompt,
        appsHistoryRef.current as never[],
        fanpulseapps.tools,
        async (name, args) => {
          const result = await fanpulseapps.client.callTool({ name, arguments: args })
          const textContent = result.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n')

          // Check if this tool has an ext-apps UI by looking at the tool definition
          const toolDef = fanpulseapps.tools.find((t) => t.name === name)
          const resourceUri = toolDef ? getToolUiResourceUri(toolDef) : undefined
          if (resourceUri) {
            try {
              const resource = await fanpulseapps.client.readResource({ uri: resourceUri })
              const htmlContent = resource.contents?.[0]
              if (htmlContent && 'text' in htmlContent) {
                lastToolMeta = {
                  toolName: name,
                  toolArgs: args,
                  toolResult: result as CallToolResult,
                  html: htmlContent.text as string,
                }
              }
            } catch {
              // UI resource not available — fall through to text-only
            }
          }

          return textContent
        },
        (msg) => setAppsMessages((prev) => [...prev, msg]),
        (event) => appendXRayEvent('fanpulseapps', event)
      )
      appsHistoryRef.current = updatedHistory as never[]

      // If we have UI HTML from the last tool call, attach it to the assistant message
      if (lastToolMeta) {
        const meta = lastToolMeta
        appendXRayEvent('fanpulseapps', {
          type: 'ui_loaded',
          timestamp: Date.now(),
          durationMs: 0,
          label: 'UI Loaded',
          summary: `The Apps server provided an interactive UI for "${meta.toolName}" — the Dashboard is showing both text output and an interactive UI`,
          toolName: meta.toolName,
        })
        setAppsMessages((prev) => {
          const newIndex = prev.length
          setAppsToolCallMeta((prevMeta) => {
            const next = new Map(prevMeta)
            next.set(newIndex, meta)
            return next
          })
          return [...prev, { role: 'assistant', content: text, uiHtml: meta.html }]
        })
      } else {
        setAppsMessages((prev) => [...prev, { role: 'assistant', content: text }])
      }
    } catch (err) {
      setAppsMessages((prev) => [...prev, { role: 'error', content: String(err) }])
    }
    completeXRayTurn('fanpulseapps')

    setActivePanel('none')
    setIsProcessing(false)
  }, [input, isProcessing, bothConnected, fanpulse, fanpulseapps])

  return (
    <div className="app">
      <div className="app-header">
        <h1>🏎️ FanPulse Dashboard</h1>
        <span className="subtitle">
          Side-by-side comparison: text-only vs interactive MCP Apps
        </span>
        <button
          className={`xray-toggle ${xrayOpen ? 'active' : ''}`}
          onClick={() => setXrayOpen((v) => !v)}
          title="Show interaction details"
        >
          🔍 Under the Hood
        </button>
      </div>

      <div className="panels-container">
        {xrayOpen && (
          <XRayPanel
            turns={xrayTurns}
            activeServer={activePanel}
            onClose={() => setXrayOpen(false)}
          />
        )}
        <div className="panels">
          <ChatPanel
            connection={fanpulse}
            label="FanPulse (C# Server)"
            messages={fpMessages}
            isProcessing={isProcessing && activePanel === 'fanpulse'}
          />
          <ChatPanel
            connection={fanpulseapps}
            label="FanPulse Apps (TypeScript Server)"
            messages={appsMessages}
            isProcessing={isProcessing && activePanel === 'fanpulseapps'}
            showAppFrames
            toolCallMeta={appsToolCallMeta}
          />
        </div>
      </div>

      <div className="input-bar">
        <input
          type="text"
          placeholder={
            bothConnected
              ? 'Ask about fans, merchandise, promotions...'
              : 'Waiting for servers to connect...'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={!bothConnected || isProcessing}
        />
        <button onClick={handleSend} disabled={!bothConnected || isProcessing}>
          Send
        </button>
      </div>
    </div>
  )
}
