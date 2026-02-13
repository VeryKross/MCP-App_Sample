import { useRef, useEffect } from 'react'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ChatMessage, McpConnection } from '../types'
import { AppFrame } from './AppFrame'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

interface ChatPanelProps {
  connection: McpConnection
  label: string
  messages: ChatMessage[]
  isProcessing: boolean
  /** Only the Apps panel provides a client for AppBridge */
  showAppFrames?: boolean
  /** Map of message index -> tool call metadata for AppBridge */
  toolCallMeta?: Map<number, { toolName: string; toolArgs: Record<string, unknown>; toolResult: CallToolResult }>
}

export function ChatPanel({
  connection,
  label,
  messages,
  isProcessing,
  showAppFrames = false,
  toolCallMeta,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{label}</h2>
        <span className={`badge ${connection.status}`}>
          {connection.status}
        </span>
        {connection.status === 'connected' && (
          <span className="tool-count">
            {connection.tools.length} tools
          </span>
        )}
      </div>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`message ${msg.role}`}>
              {msg.content}
            </div>
            {showAppFrames && msg.uiHtml && connection.client && toolCallMeta?.has(i) && (
              <AppFrame
                client={connection.client}
                uiHtml={msg.uiHtml}
                toolName={toolCallMeta.get(i)!.toolName}
                toolArgs={toolCallMeta.get(i)!.toolArgs}
                toolResult={toolCallMeta.get(i)!.toolResult}
              />
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="typing-indicator">Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
