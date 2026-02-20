import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import type { ChatMessage, XRayEvent } from '../types'

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

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function describeToolPurpose(toolName: string): string {
  const name = toolName.toLowerCase()
  if (name.includes('getfanprofile')) return 'to identify the fan and retrieve their preferences and purchase context.'
  if (name.includes('getfanengagementmetrics')) return 'to measure engagement activity over the requested time window.'
  if (name.includes('searchmerchandise')) return 'to find matching products, availability, and prices for the request.'
  if (name.includes('getmerchrecommendations')) return 'to suggest products personalized to that fan.'
  if (name.includes('createpromotion')) return 'to create the requested discount offer with valid targeting and dates.'
  if (name.includes('getfansegments')) return 'to classify fans into behavioral segments and summarize who matches.'
  if (name.includes('logengagementevent')) return 'to record the requested fan activity in the engagement history.'
  return 'to fetch authoritative data from the MCP server instead of guessing.'
}

function describeInferenceFromTool(toolName: string, resultSummary: string): string {
  const name = toolName.toLowerCase()
  if (name.includes('createpromotion')) return `The AI is checking the promotion details and preparing a clear confirmation (${resultSummary}).`
  if (name.includes('searchmerchandise')) return `The AI is matching returned products to the user request and narrowing to the best options (${resultSummary}).`
  if (name.includes('getfansegments')) return `The AI is translating segmentation data into plain-language audience insights (${resultSummary}).`
  if (name.includes('getfanengagementmetrics')) return `The AI is turning engagement metrics into an easy-to-read performance summary (${resultSummary}).`
  if (name.includes('getmerchrecommendations')) return `The AI is converting recommendation data into a concise shortlist (${resultSummary}).`
  if (name.includes('getfanprofile')) return `The AI is combining fan profile details into context for the next step (${resultSummary}).`
  return `The AI is interpreting the returned data to produce a user-friendly answer (${resultSummary}).`
}

function describeResponsePlan(toolName: string): string {
  const name = toolName.toLowerCase()
  if (name.includes('createpromotion')) return 'Confirm the created promotion, include discount, target, and exact date range.'
  if (name.includes('searchmerchandise') || name.includes('getmerchrecommendations')) return 'Present the most relevant products with pricing and availability.'
  if (name.includes('getfansegments') || name.includes('getfanengagementmetrics')) return 'Summarize key findings and highlight practical next actions.'
  if (name.includes('getfanprofile')) return 'Use fan context to personalize the final recommendation or action.'
  return 'Summarize the result clearly and answer the user request directly.'
}

function buildProcessingInsight(
  toolName: string,
  args: Record<string, unknown>,
  resultSummary: string,
  userPrompt: string
): { whatCameBack: string; aiInference: string; responsePlan: string; assumptions: string[] } {
  const assumptions: string[] = []

  if (/this weekend|weekend/i.test(userPrompt)) {
    const startDate = typeof args.startDate === 'string' ? args.startDate : undefined
    const endDate = typeof args.endDate === 'string' ? args.endDate : undefined
    if (startDate && endDate) {
      assumptions.push(`Interpreted "this weekend" as ${startDate} through ${endDate}.`)
    }
  }

  return {
    whatCameBack: resultSummary,
    aiInference: describeInferenceFromTool(toolName, resultSummary),
    responsePlan: describeResponsePlan(toolName),
    assumptions,
  }
}

function summarizeAnalysis(toolCalls: ToolCall[], round: number): { summary: string; rawDetail: string } {
  const details = toolCalls.map((tc) => {
    const args = parseToolArgs(tc.function.arguments)
    return {
      toolName: tc.function.name,
      reason: describeToolPurpose(tc.function.name),
      args,
    }
  })

  const summary =
    details.length === 1
      ? `The AI selected "${details[0].toolName}" ${details[0].reason}`
      : `The AI selected ${details.length} tools this round because each one provides different data needed for the final answer.`

  return {
    summary,
    rawDetail: JSON.stringify({ round: round + 1, toolDecisions: details }, null, 2),
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getWeekendWindow(now: Date) {
  const day = now.getDay() // 0=Sun, 6=Sat
  const daysUntilSaturday = day === 6 ? 0 : day === 0 ? 6 : 6 - day
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + daysUntilSaturday)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  return { today: toIsoDate(now), saturday: toIsoDate(saturday), sunday: toIsoDate(sunday) }
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
  onMessage?: (msg: ChatMessage) => void,
  onXRayEvent?: (event: XRayEvent) => void
): Promise<{ text: string; updatedHistory: LlmMessage[] }> {
  const { today, saturday, sunday } = getWeekendWindow(new Date())
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        'You are FanPulse, a fan engagement intelligence assistant. ' +
        'Use the available tools to answer questions about fans, merchandise, promotions, and engagement data. ' +
        'Always call the relevant tool rather than guessing. ' +
        `Today is ${today}. Resolve relative dates to explicit ISO dates (YYYY-MM-DD). ` +
        `Interpret "this weekend" as ${saturday} through ${sunday} unless the user states otherwise.`,
    },
    ...history,
    { role: 'user', content: userPrompt },
  ]

  const openaiTools = toolsToOpenAI(tools)
  const MAX_ROUNDS = 10
  let lastEventTime = Date.now()

  const emit = (event: Omit<XRayEvent, 'timestamp' | 'durationMs'>) => {
    const now = Date.now()
    onXRayEvent?.({ ...event, timestamp: now, durationMs: now - lastEventTime })
    lastEventTime = now
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
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
      emit({
        type: 'llm_thinking',
        label: 'AI Analyzing',
        summary:
          round === 0
            ? 'The AI determined no tool call is needed and can answer directly from available context.'
            : 'The AI determined it already has enough tool data and can finalize the response.',
      })
      emit({
        type: 'final_response',
        label: 'Response Ready',
        summary: 'The AI has crafted a response from the available data',
      })
      return {
        text: msg.content ?? '',
        updatedHistory: messages.slice(1), // strip system message
      }
    }

    const analysis = summarizeAnalysis(msg.tool_calls, round)
    emit({
      type: 'llm_thinking',
      label: 'AI Analyzing',
      summary: analysis.summary,
      rawDetail: analysis.rawDetail,
    })

    // Process each tool call
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name
      const args = parseToolArgs(tc.function.arguments)
      const toolReason = describeToolPurpose(toolName)

      emit({
        type: 'tool_decided',
        label: `Tool Selected`,
        summary: `The AI chose "${toolName}" ${toolReason}`,
        toolName,
        toolArgs: args,
        rawDetail: JSON.stringify(args, null, 2),
      })

      onMessage?.({
        role: 'tool',
        content: `Calling ${toolName}...`,
        toolName,
      })

      emit({
        type: 'tool_called',
        label: 'Server Called',
        summary: `The AI sent a request to the MCP data server`,
        toolName,
        toolArgs: args,
      })

      try {
        const result = await callTool(toolName, args)

        // Summarize the result for non-technical display
        let resultSummary = 'Data returned from server'
        try {
          const parsed = JSON.parse(result)
          if (Array.isArray(parsed)) {
            resultSummary = `${parsed.length} record${parsed.length !== 1 ? 's' : ''} returned`
          } else if (typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed)
            if (keys.includes('fans')) resultSummary = `${(parsed.fans as unknown[]).length} fan records returned`
            else if (keys.includes('segments')) resultSummary = `${(parsed.segments as unknown[]).length} segments returned`
            else if (keys.includes('recommendations')) resultSummary = `${(parsed.recommendations as unknown[]).length} recommendations returned`
            else resultSummary = `Response with ${keys.length} data field${keys.length !== 1 ? 's' : ''}`
          }
        } catch { /* non-JSON result */ }

        emit({
          type: 'tool_result',
          label: 'Data Returned',
          summary: resultSummary,
          toolName,
          resultSummary,
          rawDetail: result.length > 500 ? result.slice(0, 500) + '…' : result,
        })

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })

        emit({
          type: 'llm_synthesizing',
          label: 'AI Processing',
          summary: describeInferenceFromTool(toolName, resultSummary),
          toolName,
          toolArgs: args,
          resultSummary,
          rawDetail: JSON.stringify(
            buildProcessingInsight(toolName, args, resultSummary, userPrompt),
            null,
            2
          ),
        })
      } catch (err) {
        emit({
          type: 'tool_result',
          label: 'Server Error',
          summary: `The tool call failed: ${err}`,
          toolName,
          rawDetail: String(err),
        })
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
