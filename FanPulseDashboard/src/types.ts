import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export interface McpConnection {
  client: Client
  tools: Tool[]
  status: 'connecting' | 'connected' | 'disconnected'
  error?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  /** For tool messages: which tool was called */
  toolName?: string
  /** For assistant messages from Apps server: ext-apps UI HTML */
  uiHtml?: string
  /** For assistant messages from Apps server: UI resource URI */
  uiResourceUri?: string
}

// ── X-Ray Panel Types ──

export type XRayEventType =
  | 'user_prompt'
  | 'llm_thinking'
  | 'tool_decided'
  | 'tool_called'
  | 'tool_result'
  | 'llm_synthesizing'
  | 'ui_loaded'
  | 'final_response'

export interface XRayEvent {
  type: XRayEventType
  timestamp: number
  durationMs?: number
  label: string
  summary: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  resultSummary?: string
  rawDetail?: string
}

export interface XRayTurn {
  prompt: string
  startedAt: number
  events: XRayEvent[]
  complete: boolean
}

export type ServerName = 'fanpulse' | 'fanpulseapps'

export interface ServerConfig {
  name: ServerName
  label: string
  endpoint: string
  description: string
}

export const SERVERS: Record<ServerName, ServerConfig> = {
  fanpulse: {
    name: 'fanpulse',
    label: 'FanPulse (C#)',
    endpoint: '/api/fanpulse',
    description: 'Text-only MCP server',
  },
  fanpulseapps: {
    name: 'fanpulseapps',
    label: 'FanPulse Apps (TS)',
    endpoint: '/api/fanpulseapps',
    description: 'Interactive UI MCP server',
  },
}
