import { useState } from 'react'
import type { XRayTurn, XRayEvent, XRayEventType } from '../types'

interface XRayPanelProps {
  turns: { fanpulse: XRayTurn[]; fanpulseapps: XRayTurn[] }
  activeServer: 'fanpulse' | 'fanpulseapps' | 'none'
  onClose: () => void
}

const EVENT_META: Record<XRayEventType, { icon: string; color: string; bg: string }> = {
  user_prompt:      { icon: '👤', color: '#58a6ff', bg: 'rgba(88,166,255,0.12)' },
  llm_thinking:     { icon: '🧠', color: '#bc8cff', bg: 'rgba(188,140,255,0.12)' },
  tool_decided:     { icon: '🎯', color: '#f0883e', bg: 'rgba(240,136,62,0.12)' },
  tool_called:      { icon: '⚡', color: '#d29922', bg: 'rgba(210,153,34,0.12)' },
  tool_result:      { icon: '📊', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' },
  llm_synthesizing: { icon: '⚙️', color: '#bc8cff', bg: 'rgba(188,140,255,0.10)' },
  ui_loaded:        { icon: '🖼️', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)' },
  final_response:   { icon: '💬', color: '#56d364', bg: 'rgba(86,211,100,0.12)' },
}

function formatDuration(ms?: number) {
  if (ms === undefined || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return 'No parameters'
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${camelToWords(k)}: ${v}`)
    .join(' · ')
}

function camelToWords(s: string) {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

interface AnalysisDecision {
  toolName: string
  reason: string
  args?: Record<string, unknown>
}

interface ProcessingInsight {
  whatCameBack: string
  aiInference: string
  responsePlan: string
  assumptions?: string[]
}

function parseAnalysisDecisions(rawDetail?: string): AnalysisDecision[] {
  if (!rawDetail) return []
  try {
    const parsed = JSON.parse(rawDetail) as { toolDecisions?: AnalysisDecision[] }
    if (!Array.isArray(parsed.toolDecisions)) return []
    return parsed.toolDecisions
  } catch {
    return []
  }
}

function parseProcessingInsight(rawDetail?: string): ProcessingInsight | null {
  if (!rawDetail) return null
  try {
    const parsed = JSON.parse(rawDetail) as Partial<ProcessingInsight>
    if (!parsed.whatCameBack || !parsed.aiInference || !parsed.responsePlan) return null
    return {
      whatCameBack: parsed.whatCameBack,
      aiInference: parsed.aiInference,
      responsePlan: parsed.responsePlan,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    }
  } catch {
    return null
  }
}

function EventNode({ event, isFirst }: { event: XRayEvent; isFirst: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const meta = EVENT_META[event.type]
  const analysisDecisions = event.type === 'llm_thinking' ? parseAnalysisDecisions(event.rawDetail) : []
  const processingInsight = event.type === 'llm_synthesizing' ? parseProcessingInsight(event.rawDetail) : null

  return (
    <div className="xray-step">
      {!isFirst && (
        <div className="xray-arrow">
          {event.durationMs !== undefined && event.durationMs > 0 && (
            <span className="xray-duration">{formatDuration(event.durationMs)}</span>
          )}
          <span className="xray-arrow-line">▶</span>
        </div>
      )}
      <div
        className={`xray-node ${expanded ? 'expanded' : ''}`}
        style={{ borderColor: meta.color, background: meta.bg }}
        onClick={() => setExpanded((v) => !v)}
        title="Click to expand details"
      >
        <div className="xray-node-header">
          <span className="xray-node-icon">{meta.icon}</span>
          <span className="xray-node-label" style={{ color: meta.color }}>{event.label}</span>
        </div>
        <div className="xray-node-summary">{event.summary}</div>
        {expanded && (
          <div className="xray-node-detail">
            {analysisDecisions.length > 0 && (
              <div className="xray-analysis-list">
                {analysisDecisions.map((decision, idx) => (
                  <div key={idx} className="xray-analysis-item">
                    <div className="xray-analysis-title">Why this tool?</div>
                    <div className="xray-analysis-tool">{decision.toolName}</div>
                    <div className="xray-analysis-reason">{decision.reason}</div>
                    {decision.args && Object.keys(decision.args).length > 0 && (
                      <div className="xray-analysis-args">
                        Using: {formatArgs(decision.args)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {processingInsight && (
              <div className="xray-processing-list">
                <div className="xray-processing-item">
                  <div className="xray-processing-title">What came back</div>
                  <div className="xray-processing-text">{processingInsight.whatCameBack}</div>
                </div>
                <div className="xray-processing-item">
                  <div className="xray-processing-title">What the AI inferred</div>
                  <div className="xray-processing-text">{processingInsight.aiInference}</div>
                </div>
                <div className="xray-processing-item">
                  <div className="xray-processing-title">What the user will see</div>
                  <div className="xray-processing-text">{processingInsight.responsePlan}</div>
                </div>
                {processingInsight.assumptions && processingInsight.assumptions.length > 0 && (
                  <div className="xray-processing-item">
                    <div className="xray-processing-title">Assumptions</div>
                    <ul className="xray-processing-assumptions">
                      {processingInsight.assumptions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {event.toolName && (
              <div className="xray-detail-row">
                <span className="xray-detail-key">Tool:</span>
                <span className="xray-detail-val">{event.toolName}</span>
              </div>
            )}
            {event.toolArgs && Object.keys(event.toolArgs).length > 0 && (
              <div className="xray-detail-row">
                <span className="xray-detail-key">Parameters:</span>
                <span className="xray-detail-val">{formatArgs(event.toolArgs)}</span>
              </div>
            )}
            {event.resultSummary && (
              <div className="xray-detail-row">
                <span className="xray-detail-key">Result:</span>
                <span className="xray-detail-val">{event.resultSummary}</span>
              </div>
            )}
            {event.rawDetail && (
              <details className="xray-raw" onClick={(e) => e.stopPropagation()}>
                <summary>Technical details</summary>
                <pre>{event.rawDetail}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TurnRow({ turn }: { turn: XRayTurn; index: number }) {
  const [collapsed, setCollapsed] = useState(false)
  const totalMs = turn.events.length > 0
    ? turn.events[turn.events.length - 1].timestamp - turn.startedAt
    : undefined

  return (
    <div className="xray-turn">
      <div className="xray-turn-header" onClick={() => setCollapsed((v) => !v)}>
        <span className="xray-turn-chevron">{collapsed ? '▶' : '▼'}</span>
        <span className="xray-turn-prompt">"{turn.prompt}"</span>
        <span className="xray-turn-meta">
          {turn.events.length} steps
          {totalMs !== undefined && ` · ${formatDuration(totalMs)}`}
          {!turn.complete && ' · ⏳'}
        </span>
      </div>
      {!collapsed && (
        <div className="xray-pipeline">
          {/* Always show user prompt node first */}
          <div className="xray-step">
            <div
              className="xray-node"
              style={{ borderColor: EVENT_META.user_prompt.color, background: EVENT_META.user_prompt.bg }}
            >
              <div className="xray-node-header">
                <span className="xray-node-icon">👤</span>
                <span className="xray-node-label" style={{ color: EVENT_META.user_prompt.color }}>You Asked</span>
              </div>
              <div className="xray-node-summary">"{turn.prompt}"</div>
            </div>
          </div>
          {turn.events
            .filter((e) => e.type !== 'user_prompt')
            .map((event, i) => (
              <EventNode key={i} event={event} isFirst={false} />
            ))}
        </div>
      )}
    </div>
  )
}

export function XRayPanel({ turns, activeServer, onClose }: XRayPanelProps) {
  const [activeTab, setActiveTab] = useState<'fanpulse' | 'fanpulseapps'>(
    activeServer !== 'none' ? activeServer : 'fanpulseapps'
  )

  // Auto-switch tab when a server becomes active
  if (activeServer !== 'none' && activeServer !== activeTab) {
    setActiveTab(activeServer)
  }

  const currentTurns = turns[activeTab]

  return (
    <div className="xray-overlay">
      <div className="xray-panel">
        <div className="xray-header">
          <span className="xray-title">🔍 Under the Hood</span>
          <div className="xray-tabs">
            {(['fanpulse', 'fanpulseapps'] as const).map((srv) => (
              <button
                key={srv}
                className={`xray-tab ${activeTab === srv ? 'active' : ''}`}
                onClick={() => setActiveTab(srv)}
              >
                {srv === 'fanpulse' ? 'FanPulse (C#)' : 'FanPulse Apps (TS)'}
                {turns[srv].length > 0 && (
                  <span className="xray-tab-badge">{turns[srv].length}</span>
                )}
              </button>
            ))}
          </div>
          <button className="xray-close" onClick={onClose} title="Close panel">✕</button>
        </div>

        <div className="xray-body">
          {currentTurns.length === 0 ? (
            <div className="xray-empty">
              Send a message to see how the AI interacts with the MCP server
            </div>
          ) : (
            [...currentTurns].reverse().map((turn, i) => (
              <TurnRow key={i} turn={turn} index={currentTurns.length - 1 - i} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
