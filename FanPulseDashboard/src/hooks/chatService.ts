import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { ChatMessage } from '../types'

interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface LlmResponse {
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason: string
  }>
}

function toolsToOpenAI(tools: Tool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }))
}

/**
 * Runs the chat-with-function-calling loop for a single server.
 * Returns the final assistant text and any intermediate messages.
 */
export async function runChat(
  userPrompt: string,
  history: LlmMessage[],
  tools: Tool[],
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  onMessage?: (msg: ChatMessage) => void
): Promise<{ text: string; updatedHistory: LlmMessage[] }> {
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        'You are FanPulse, a fan engagement intelligence assistant. ' +
        'Use the available tools to answer questions about fans, merchandise, promotions, and engagement data. ' +
        'Always call the relevant tool rather than guessing.',
    },
    ...history,
    { role: 'user', content: userPrompt },
  ]

  const openaiTools = toolsToOpenAI(tools)
  const MAX_ROUNDS = 10

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LLM API error ${res.status}: ${errText}`)
    }

    const data: LlmResponse = await res.json()
    const choice = data.choices[0]
    const msg = choice.message

    // Add assistant message to history
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: msg.tool_calls,
    })

    // If no tool calls, we're done
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        text: msg.content ?? '',
        updatedHistory: messages.slice(1), // strip system message
      }
    }

    // Process each tool call
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        // empty args
      }

      onMessage?.({
        role: 'tool',
        content: `Calling ${toolName}...`,
        toolName,
      })

      try {
        const result = await callTool(toolName, args)
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      } catch (err) {
        messages.push({
          role: 'tool',
          content: `Error calling ${toolName}: ${err}`,
          tool_call_id: tc.id,
        })
      }
    }
  }

  return {
    text: 'Maximum tool-calling rounds reached.',
    updatedHistory: messages.slice(1),
  }
}
