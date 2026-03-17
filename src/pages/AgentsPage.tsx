import { useEffect, useState, useCallback } from 'react'
import { useOpc } from '../contexts/OpcContext'
import {
  getAgents, createAgent, updateAgent, deleteAgent, reorderAgents,
  getAgentDocument, updateAgentDocument, aiGenerateAgent,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType } from '../lib/types'

const DOC_TYPES: DocumentType[] = ['SOUL', 'IDENTITY', 'AGENTS', 'USER', 'MEMORY', 'HEARTBEAT', 'TOOLS']

const DOC_DESCRIPTIONS: Record<DocumentType, string> = {
  SOUL: '定义 Agent 的人格、沟通风格与行为边界，每次会话开始时加载。',
  IDENTITY: '定义 Agent 的身份信息与自我认知。',
  AGENTS: '定义团队中其他 Agent 的认知与协作关系。',
  USER: '定义 Agent 对用户的了解与交互模式。',
  MEMORY: '定义 Agent 的记忆存储与检索策略。',
  HEARTBEAT: '定义 Agent 的定时任务与主动行为。',
  TOOLS: '定义 Agent 可使用的工具与权限配置。',
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
    || 'agent'
}

export default function AgentsPage() {
  const { opcs, currentOpc, selectOpc } = useOpc()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [activeDocTab, setActiveDocTab] = useState<DocumentType>('SOUL')
  const [docContent, setDocContent] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [form, setForm] = useState<Partial<AgentConfig>>({})
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)

  // Load agents whenever the current OPC changes
  useEffect(() => {
    if (!currentOpc) return
    getAgents(currentOpc.id)
      .then(list => {
        setAgents(list)
        if (list.length > 0) {
          setSelectedAgent(list[0])
          setForm(list[0])
        } else {
          setSelectedAgent(null)
          setForm({})
        }
      })
      .catch(e => toast(String(e), 'error'))
  }, [currentOpc])

  // Load document when selected agent or active tab changes
  useEffect(() => {
    if (!selectedAgent) return
    setDocLoading(true)
    getAgentDocument(selectedAgent.id, activeDocTab)
      .then(content => setDocContent(content ?? ''))
      .catch(() => setDocContent(''))
      .finally(() => setDocLoading(false))
  }, [selectedAgent?.id, activeDocTab])

  const handleSelectAgent = useCallback((agent: AgentConfig) => {
    setSelectedAgent(agent)
    setForm(agent)
  }, [])

  const handleFormChange = (field: keyof AgentConfig, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveAgent = async () => {
    if (!selectedAgent || !currentOpc) return
    setSaving(true)
    try {
      const updated: AgentConfig = {
        ...selectedAgent,
        ...form,
        updated_at: Math.floor(Date.now() / 1000),
      }
      await updateAgent(selectedAgent.id, updated)
      setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
      setSelectedAgent(updated)
      toast('保存成功', 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    if (selectedAgent) setForm(selectedAgent)
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !selectedAgent) return
    setAiGenerating(true)
    try {
      const result = await aiGenerateAgent(aiPrompt.trim())
      setForm(prev => ({
        ...prev,
        display_name: result.display_name || prev.display_name,
        name: result.name || prev.name,
        job_title: result.job_title || prev.job_title,
        description: result.description || prev.description,
        personality: result.personality || prev.personality,
      }))
      if (result.soul) {
        setActiveDocTab('SOUL')
        setDocContent(result.soul)
      }
      setAiPrompt('')
      toast('AI 生成完成，请确认后保存', 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setAiGenerating(false)
    }
  }

  const handleSaveDoc = async () => {
    if (!selectedAgent) return
    try {
      await updateAgentDocument(selectedAgent.id, activeDocTab, docContent)
      toast('文档已保存', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleAddAgent = async () => {
    if (!currentOpc) return
    const displayName = `新智能体 ${agents.length + 1}`
    const now = Math.floor(Date.now() / 1000)
    const newAgent: AgentConfig = {
      id: crypto.randomUUID(),
      opc_id: currentOpc.id,
      name: slugify(displayName),
      display_name: displayName,
      job_title: undefined,
      personality: undefined,
      description: undefined,
      initials: displayName.slice(0, 2),
      gradient_start: '#8b5cf6',
      gradient_end: '#06b6d4',
      is_default: false,
      order_index: agents.length,
      model_provider: undefined,
      model_name: undefined,
      enabled_tools: [],
      disabled_tools: [],
      enabled_skills: [],
      guardrail_rules: [],
      reports_to: [],
      manages: [],
      created_at: now,
      updated_at: now,
    }
    try {
      await createAgent(newAgent)
      const list = await getAgents(currentOpc.id)
      setAgents(list)
      const created = list.find(a => a.name === newAgent.name) ?? list[list.length - 1]
      setSelectedAgent(created)
      setForm(created)
      toast('智能体已创建', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (!currentOpc) return
    try {
      await deleteAgent(agentId)
      const list = await getAgents(currentOpc.id)
      setAgents(list)
      if (selectedAgent?.id === agentId) {
        const next = list[0] ?? null
        setSelectedAgent(next)
        setForm(next ?? {})
      }
      toast('已删除', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  return (
    <>
      {/* list-pane */}
      <div className="list-pane">
        <div className="toolbar" style={{ gap: '6px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <select
              className="company-select"
              style={{ width: '100%' }}
              value={currentOpc?.id ?? ''}
              onChange={e => {
                const opc = opcs.find(o => o.id === e.target.value)
                if (opc) selectOpc(opc)
              }}
            >
              {opcs.map(opc => (
                <option key={opc.id} value={opc.id}>{opc.display_name}</option>
              ))}
            </select>
            <svg style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#636366' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 3px' }}>
          <span className="section-label" style={{ padding: 0 }}>智能体 ({agents.length})</span>
          <span style={{ fontSize: '11px', color: '#636366' }}>拖拽排序</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {agents.map(agent => (
            <div
              key={agent.id}
              className={`agent-row${selectedAgent?.id === agent.id ? ' selected' : ''}`}
              onClick={() => handleSelectAgent(agent)}
            >
              <div className="drag-handle"><span></span><span></span><span></span></div>
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px',
                background: `linear-gradient(135deg,${agent.gradient_start ?? '#8b5cf6'},${agent.gradient_end ?? '#06b6d4'})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {agent.initials ?? agent.display_name.slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: selectedAgent?.id === agent.id ? '#FFFFFF' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.display_name}
                  </span>
                  {agent.is_default && (
                    <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>默认响应</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {agent.model_provider && agent.model_name
                    ? `${agent.model_provider}[${agent.model_name}] · ${agent.enabled_tools.length} 工具`
                    : '未配置模型'}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <button
            onClick={handleAddAgent}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#636366', fontSize: '12px' }}
          >
            <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
            添加智能体
          </button>
        </div>
      </div>

      {/* detail-pane */}
      <main className="detail-pane">
        {!selectedAgent ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#636366', fontSize: '13px' }}>
            请选择一个智能体
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '6px',
                  background: `linear-gradient(135deg,${selectedAgent.gradient_start ?? '#8b5cf6'},${selectedAgent.gradient_end ?? '#06b6d4'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0,
                }}>
                  {selectedAgent.initials ?? selectedAgent.display_name.slice(0, 2)}
                </div>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selectedAgent.display_name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="tbtn tbtn-ghost"
                  onClick={handleCancelEdit}
                >取消</button>
                <button
                  className="tbtn tbtn-accent"
                  onClick={handleSaveAgent}
                  disabled={saving}
                >保存</button>
                <button
                  className="tbtn tbtn-ghost"
                  style={{ color: '#f43f5e' }}
                  onClick={() => handleDeleteAgent(selectedAgent.id)}
                >删除</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* AI 快速生成 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>AI 快速生成</div>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  </div>
                  <input
                    type="text"
                    placeholder="用一句话描述智能体，AI 自动生成完整配置…"
                    className="field-input"
                    style={{ flex: 1 }}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !aiGenerating && handleAiGenerate()}
                    disabled={aiGenerating}
                  />
                  <button
                    className="tbtn tbtn-accent"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={handleAiGenerate}
                    disabled={aiGenerating || !aiPrompt.trim()}
                  >
                    {aiGenerating ? '生成中...' : 'AI 生成'}
                  </button>
                </div>
              </section>

              {/* 基本信息 */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>基本信息</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">显示名称</span>
                    <input
                      type="text"
                      value={form.display_name ?? ''}
                      onChange={e => handleFormChange('display_name', e.target.value)}
                      className="field-input"
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">英文标识</span>
                    <input
                      type="text"
                      value={form.name ?? ''}
                      onChange={e => handleFormChange('name', e.target.value)}
                      className="field-input"
                      style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace" }}
                    />
                  </div>
                  <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                    <span className="group-label" style={{ paddingTop: '2px' }}>简介</span>
                    <textarea
                      className="field-input"
                      rows={2}
                      style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }}
                      value={form.description ?? ''}
                      onChange={e => handleFormChange('description', e.target.value)}
                    />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">职位名称</span>
                    <input
                      type="text"
                      value={form.job_title ?? ''}
                      onChange={e => handleFormChange('job_title', e.target.value)}
                      className="field-input"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              </section>

              {/* 人格配置 / 文档编辑 */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                  <span className="section-label" style={{ padding: 0 }}>人格配置</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {DOC_TYPES.map(dt => (
                    <button
                      key={dt}
                      className={`soul-tab${activeDocTab === dt ? ' active' : ''}`}
                      onClick={() => setActiveDocTab(dt)}
                    >
                      {dt}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#636366', marginBottom: '7px', lineHeight: 1.5 }}>
                  {DOC_DESCRIPTIONS[activeDocTab]}
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '26px', background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '11px', color: '#636366', fontFamily: "'SF Mono','Menlo',monospace" }}>{activeDocTab}.md</span>
                    <button
                      className="tbtn tbtn-accent"
                      style={{ padding: '1px 8px', fontSize: '11px' }}
                      onClick={handleSaveDoc}
                      disabled={docLoading}
                    >
                      保存文档
                    </button>
                  </div>
                  <textarea
                    className="field-textarea"
                    rows={10}
                    spellCheck={false}
                    value={docLoading ? '加载中...' : docContent}
                    onChange={e => setDocContent(e.target.value)}
                    disabled={docLoading}
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </>
  )
}
