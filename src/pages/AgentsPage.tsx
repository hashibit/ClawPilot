import { useEffect, useState, useCallback, useRef } from 'react'
import { useOpc } from '../contexts/OpcContext'
import {
  getAgents, createAgent, updateAgent, deleteAgent, reorderAgents,
  getAgentDocument, updateAgentDocument, aiGenerateAgent, getModels,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType, ModelInfo } from '../lib/types'

const DOC_TYPES: DocumentType[] = ['SOUL', 'IDENTITY', 'AGENTS', 'USER', 'MEMORY', 'HEARTBEAT', 'TOOLS']

const DOC_DESCRIPTIONS: Record<DocumentType, string> = {
  SOUL: '定义 Agent 的人格、沟通风格与行为边界，每次会话开始时加载。',
  IDENTITY: '建立 Agent 的名称、人格标签与 emoji，初始化时自动创建。',
  AGENTS: '描述 Agent 如何使用记忆、与其他 Agent 协作的行为指南，每次会话加载。',
  USER: '记录用户身份信息与偏好沟通风格，每次会话加载。',
  MEMORY: '可选的长期记忆文件，仅在主要私人会话中加载，不在共享上下文中使用。',
  HEARTBEAT: '可选的心跳任务清单，用于定时自动执行，设计上极为简短以节省 token。',
  TOOLS: '关于本地工具与使用惯例的说明文档，仅供参考，不直接控制工具访问权限。',
}

const PROVIDER_LABELS: Record<string, string> = {
  BAILIAN: '阿里云百炼',
  VOLCENGINE: '火山方舟',
  MINIMAX: 'MiniMax',
}

const AVAILABLE_TOOLS = [
  { id: 'web_search', name: '网页搜索' },
  { id: 'web_reader', name: '网页阅读' },
  { id: 'feishu_message', name: '飞书消息' },
  { id: 'code_interpreter', name: '代码解释器' },
  { id: 'file_reader', name: '文件读取' },
  { id: 'image_gen', name: '图像生成' },
  { id: 'image_analysis', name: '视觉理解' },
  { id: 'http_request', name: 'HTTP 请求' },
  { id: 'asr', name: '语音识别' },
  { id: 'tts', name: '语音合成' },
]

const SKILL_REGISTRY = [
  { slug: 'multi-round-memory', name: '多轮对话记忆', icon: '💾', desc: '会话中保留上下文，支持连续追问', tag: '记忆' },
  { slug: 'proactive-speak', name: '主动发言', icon: '🔔', desc: '满足触发条件时主动发起消息', tag: '交互' },
  { slug: 'scheduled-heartbeat', name: '定时心跳', icon: '⏰', desc: '按计划定期执行 HEARTBEAT 任务', tag: '定时' },
  { slug: 'mention-response', name: '群聊 @ 响应', icon: '@', desc: '在群聊中被 @ 时才回复', tag: '群聊' },
  { slug: 'direct-response', name: '私聊直接响应', icon: '💬', desc: '在私聊频道中响应所有消息', tag: '私聊' },
  { slug: 'message-routing', name: '消息路由协调', icon: '↔', desc: '作为路由 Agent 将消息分发给合适的成员', tag: '协调' },
  { slug: 'context-compression', name: '上下文压缩', icon: '📦', desc: '压缩长对话历史，节省 token', tag: '效率' },
  { slug: 'tool-calling', name: '工具调用', icon: '🔧', desc: '自动选择和调用合适的工具', tag: '智能' },
  { slug: 'memory-persistence', name: '记忆持久化', icon: '💾', desc: '跨会话保存重要记忆', tag: '记忆' },
  { slug: 'emotional-aware', name: '情绪感知', icon: '💭', desc: '识别对话情绪，调整回复风格', tag: '交互' },
]

interface RemoteSkill {
  slug: string
  name: string
  description: string
  description_zh?: string
  downloads: number
  stars: number
  category: string
  version: string
  ownerName: string
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') || 'agent'
}

// ── Tag input ──────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', padding: '6px 9px', minHeight: '36px' }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', fontSize: '12px', padding: '2px 8px', borderRadius: '5px' }}>
          {tag}
          <button onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', padding: 0, lineHeight: 1, fontSize: '13px' }}>×</button>
        </span>
      ))}
      <input
        type="text" value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
        }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '12px', minWidth: '80px', flex: 1 }}
      />
    </div>
  )
}

// ── Skill add modal — Bug 1: multi-select+deselect, Bug 2: API search ──
function SkillModal({ enabled, onClose, onToggle }: {
  enabled: string[]
  onClose: () => void
  onToggle: (slug: string) => void
}) {
  const [search, setSearch] = useState('')
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!search.trim()) { setRemoteSkills([]); return }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(
          `https://lightmake.site/api/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=${encodeURIComponent(search.trim())}`
        )
        if (r.ok) {
          const data = await r.json()
          setRemoteSkills(data?.data?.skills ?? [])
        }
      } catch { /* network error – fall back to local */ }
      finally { setSearching(false) }
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  // Merge local + remote results
  const localFiltered = SKILL_REGISTRY.filter(s =>
    !search.trim() || s.name.includes(search) || s.desc.includes(search) || s.slug.includes(search)
  )

  const remoteFiltered = remoteSkills.filter(
    rs => !SKILL_REGISTRY.some(ls => ls.slug === rs.slug)
  )

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1c1c1e', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', width: '520px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#EBEBF5' }}>选择技能</div>
            <div style={{ fontSize: '12px', color: '#636366', marginTop: '2px' }}>点击添加/移除，可多选，从 ClawHub 搜索</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#636366', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
          <input
            type="text" placeholder="搜索技能（从 ClawHub 实时检索）…" className="field-input"
            style={{ width: '100%' }} value={search} onChange={e => setSearch(e.target.value)}
          />
          {searching && (
            <span style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#636366' }}>搜索中…</span>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Local skills */}
          {localFiltered.map(skill => {
            const added = enabled.includes(skill.slug)
            return (
              <div
                key={skill.slug}
                onClick={() => onToggle(skill.slug)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'rgba(52,199,89,0.3)' : 'rgba(255,255,255,0.12)'}`, background: added ? 'rgba(52,199,89,0.08)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{skill.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{skill.name}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{skill.desc}</div>
                </div>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: added ? 'rgba(52,199,89,0.15)' : 'rgba(139,92,246,0.15)', color: added ? '#34c759' : '#a78bfa', flexShrink: 0 }}>
                  {added ? '✓ 已添加' : skill.tag}
                </span>
              </div>
            )
          })}

          {/* Remote skills from ClawHub */}
          {remoteFiltered.length > 0 && (
            <>
              <div style={{ fontSize: '11px', color: '#636366', padding: '4px 0 2px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>ClawHub 结果</div>
              {remoteFiltered.map(skill => {
                const added = enabled.includes(skill.slug)
                return (
                  <div
                    key={skill.slug}
                    onClick={() => onToggle(skill.slug)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'rgba(52,199,89,0.3)' : 'rgba(255,255,255,0.12)'}`, background: added ? 'rgba(52,199,89,0.08)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>🔌</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{skill.name}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {skill.description_zh || skill.description}
                      </div>
                      <div style={{ fontSize: '10px', color: '#636366', marginTop: '2px' }}>
                        {skill.ownerName} · ↓{skill.downloads.toLocaleString()} · ★{skill.stars} · v{skill.version}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: added ? 'rgba(52,199,89,0.15)' : 'rgba(6,182,212,0.12)', color: added ? '#34c759' : '#06b6d4', flexShrink: 0 }}>
                      {added ? '✓ 已添加' : 'Hub'}
                    </span>
                  </div>
                )
              })}
            </>
          )}

          {localFiltered.length === 0 && remoteFiltered.length === 0 && !searching && search.trim() && (
            <div style={{ textAlign: 'center', color: '#636366', fontSize: '13px', padding: '24px 0' }}>未找到相关技能</div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#636366' }}>已选 {enabled.length} 个技能</span>
          <button className="tbtn tbtn-accent" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
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
  const [models, setModels] = useState<ModelInfo[]>([])
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const dragIndex = useRef<number | null>(null)

  useEffect(() => { getModels().then(setModels).catch(() => {}) }, [])

  useEffect(() => {
    if (!currentOpc) return
    getAgents(currentOpc.id)
      .then(list => {
        setAgents(list)
        if (list.length > 0) { setSelectedAgent(list[0]); setForm(list[0]) }
        else { setSelectedAgent(null); setForm({}) }
      })
      .catch(e => toast(String(e), 'error'))
  }, [currentOpc])

  useEffect(() => {
    if (!selectedAgent) return
    setDocLoading(true)
    getAgentDocument(selectedAgent.id, activeDocTab)
      .then(content => setDocContent(content ?? ''))
      .catch(() => setDocContent(''))
      .finally(() => setDocLoading(false))
  }, [selectedAgent?.id, activeDocTab])

  const handleSelectAgent = useCallback((agent: AgentConfig) => {
    setSelectedAgent(agent); setForm(agent)
  }, [])

  const handleFormChange = (field: keyof AgentConfig, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveAgent = async () => {
    if (!selectedAgent || !currentOpc) return
    setSaving(true)
    try {
      const updated: AgentConfig = { ...selectedAgent, ...form, updated_at: Math.floor(Date.now() / 1000) }
      await updateAgent(selectedAgent.id, updated)
      setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
      setSelectedAgent(updated)
      toast('保存成功', 'success')
    } catch (e) { toast(String(e), 'error') }
    finally { setSaving(false) }
  }

  const handleCancelEdit = () => { if (selectedAgent) setForm(selectedAgent) }

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
      const docMap: Record<string, string> = {
        SOUL: result.soul,
        IDENTITY: result.identity,
        AGENTS: result.agents,
        USER: result.user,
        MEMORY: result.memory,
        HEARTBEAT: result.heartbeat,
        TOOLS: result.tools,
      }
      for (const [docType, content] of Object.entries(docMap)) {
        if (content) await updateAgentDocument(selectedAgent.id, docType, content)
      }
      setActiveDocTab('SOUL')
      setDocContent(result.soul || '')
      setAiPrompt('')
      toast('AI 生成完成，已填充全部文档，请确认后保存', 'success')
    } catch (e) { toast(String(e), 'error') }
    finally { setAiGenerating(false) }
  }

  const handleSaveDoc = async () => {
    if (!selectedAgent) return
    try {
      await updateAgentDocument(selectedAgent.id, activeDocTab, docContent)
      toast('文档已保存', 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleAddAgent = async () => {
    if (!currentOpc) return
    const displayName = `新智能体 ${agents.length + 1}`
    const now = Math.floor(Date.now() / 1000)
    const newAgent: AgentConfig = {
      id: crypto.randomUUID(), opc_id: currentOpc.id,
      name: slugify(displayName), display_name: displayName,
      job_title: undefined, personality: undefined, description: undefined,
      initials: displayName.slice(0, 2),
      gradient_start: '#8b5cf6', gradient_end: '#06b6d4',
      is_default: false, order_index: agents.length,
      model_provider: undefined, model_name: undefined,
      enabled_tools: [], disabled_tools: [], enabled_skills: [],
      guardrail_rules: [], guardrail_allow: [], guardrail_deny: [],
      reports_to: [], manages: [],
      created_at: now, updated_at: now,
    }
    try {
      await createAgent(newAgent)
      const list = await getAgents(currentOpc.id)
      setAgents(list)
      const created = list.find(a => a.id === newAgent.id) ?? list[list.length - 1]
      setSelectedAgent(created); setForm(created)
      toast('智能体已创建', 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleDeleteAgent = async (agentId: string) => {
    if (!currentOpc) return
    try {
      await deleteAgent(agentId)
      const list = await getAgents(currentOpc.id)
      setAgents(list)
      if (selectedAgent?.id === agentId) {
        const next = list[0] ?? null
        setSelectedAgent(next); setForm(next ?? {})
      }
      toast('已删除', 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleDragStart = (index: number) => { dragIndex.current = index }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === index) return
    const next = [...agents]
    const [moved] = next.splice(dragIndex.current, 1)
    next.splice(index, 0, moved)
    dragIndex.current = index
    setAgents(next)
  }

  const handleDragEnd = async () => {
    if (!currentOpc) return
    try {
      await reorderAgents(currentOpc.id, agents.map(a => a.id))
      // Reload to get updated is_default flags from server
      const list = await getAgents(currentOpc.id)
      setAgents(list)
      toast('排序已保存', 'success')
    } catch (e) { toast(String(e), 'error') }
    dragIndex.current = null
  }

  // ── Model selection helpers ──────────────────────────────
  const selectedModelCombo = form.model_provider && form.model_name
    ? `${form.model_provider}||${form.model_name}` : ''
  const comboInList = models.some(m => `${m.provider_type}||${m.name}` === selectedModelCombo)
  const hasCustomModel = Boolean(selectedModelCombo && !comboInList)

  const modelsByProvider = models.reduce((acc, m) => {
    acc[m.provider_type] = acc[m.provider_type] ?? []
    acc[m.provider_type].push(m)
    return acc
  }, {} as Record<string, ModelInfo[]>)

  const handleModelSelect = (combo: string) => {
    if (!combo) {
      handleFormChange('model_provider', undefined)
      handleFormChange('model_name', undefined)
      return
    }
    const [provider, name] = combo.split('||')
    handleFormChange('model_provider', provider)
    handleFormChange('model_name', name)
  }

  // ── Tool helpers ─────────────────────────────────────────
  const enabledTools = form.enabled_tools ?? []
  const knownToolIds = new Set(AVAILABLE_TOOLS.map(t => t.id))
  const customTools = enabledTools.filter(t => !knownToolIds.has(t))

  const toggleTool = (toolId: string) => {
    handleFormChange('enabled_tools',
      enabledTools.includes(toolId)
        ? enabledTools.filter(t => t !== toolId)
        : [...enabledTools, toolId]
    )
  }

  // ── Skill helpers ────────────────────────────────────────
  const enabledSkills = form.enabled_skills ?? []

  const handleSkillToggle = (slug: string) => {
    handleFormChange('enabled_skills',
      enabledSkills.includes(slug)
        ? enabledSkills.filter(s => s !== slug)
        : [...enabledSkills, slug]
    )
  }

  // ── Guardrail helpers ────────────────────────────────────
  const guardrailAllow = form.guardrail_allow ?? form.guardrail_rules ?? []
  const guardrailDeny = form.guardrail_deny ?? []

  return (
    <>
      {/* ── COL 2: List pane ────────────────────────────── */}
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
              {opcs.map(opc => <option key={opc.id} value={opc.id}>{opc.display_name}</option>)}
            </select>
            <svg style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#636366' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 3px' }}>
          <span className="section-label" style={{ padding: 0 }}>智能体 ({agents.length})</span>
          <span style={{ fontSize: '11px', color: '#636366' }}>拖拽排序（首位为默认）</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {agents.map((agent, index) => (
            <div
              key={agent.id}
              className={`agent-row${selectedAgent?.id === agent.id ? ' selected' : ''}`}
              onClick={() => handleSelectAgent(agent)}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              style={{ cursor: 'grab' }}
            >
              <div className="drag-handle"><span></span><span></span><span></span></div>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `linear-gradient(135deg,${agent.gradient_start ?? '#8b5cf6'},${agent.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {agent.initials ?? agent.display_name.slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: selectedAgent?.id === agent.id ? '#FFFFFF' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {agent.display_name}
                  </span>
                  {index === 0 && (
                    <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>默认响应</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {agent.model_provider && agent.model_name
                    ? `${PROVIDER_LABELS[agent.model_provider] ?? agent.model_provider}[${agent.model_name}] · ${agent.enabled_tools.length} 工具`
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

      {/* ── COL 3: Detail pane ──────────────────────────── */}
      <main className="detail-pane">
        {!selectedAgent ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#636366', fontSize: '13px' }}>
            请选择一个智能体
          </div>
        ) : (
          <>
            <div className="toolbar" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `linear-gradient(135deg,${selectedAgent.gradient_start ?? '#8b5cf6'},${selectedAgent.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {selectedAgent.initials ?? selectedAgent.display_name.slice(0, 2)}
                </div>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selectedAgent.display_name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="tbtn tbtn-ghost" onClick={handleCancelEdit}>取消</button>
                <button className="tbtn tbtn-accent" onClick={handleSaveAgent} disabled={saving}>保存</button>
                <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => handleDeleteAgent(selectedAgent.id)}>删除</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* ── AI 快速生成 ── */}
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

              {/* ── 基本信息 ── */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>基本信息</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">显示名称</span>
                    <input type="text" value={form.display_name ?? ''} onChange={e => handleFormChange('display_name', e.target.value)} className="field-input" style={{ flex: 1 }} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">英文标识</span>
                    <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace" }} />
                  </div>
                  <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                    <span className="group-label" style={{ paddingTop: '2px' }}>简介</span>
                    <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">职位名称</span>
                    <input type="text" value={form.job_title ?? ''} onChange={e => handleFormChange('job_title', e.target.value)} className="field-input" style={{ flex: 1 }} />
                  </div>
                </div>
              </section>

              {/* ── 模型与工具 ── */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>模型与工具</div>
                <div className="group">
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">使用模型</span>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <select
                        className="field-input"
                        style={{ width: '100%', paddingRight: '24px' }}
                        value={selectedModelCombo}
                        onChange={e => handleModelSelect(e.target.value)}
                      >
                        <option value="">— 未选择 —</option>
                        {hasCustomModel && (
                          <optgroup label="已存储">
                            <option value={selectedModelCombo}>{form.model_name}（已存储）</option>
                          </optgroup>
                        )}
                        {Object.entries(modelsByProvider).map(([provider, mlist]) => (
                          <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                            {mlist.map(m => (
                              <option key={m.id} value={`${m.provider_type}||${m.name}`}>{m.display_name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <svg style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#636366' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>

                  <div style={{ padding: '5px 12px 2px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    工具权限
                    <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.35)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{enabledTools.length} 个已启用</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 12px 8px' }}>
                    {AVAILABLE_TOOLS.map(tool => {
                      const active = enabledTools.includes(tool.id)
                      return (
                        <button
                          key={tool.id}
                          onClick={() => toggleTool(tool.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${active ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', fontSize: '12px', color: active ? '#a78bfa' : 'rgba(235,235,245,0.7)', transition: 'all 0.15s' }}
                        >
                          {tool.name}
                        </button>
                      )
                    })}
                    {customTools.map(id => (
                      <button
                        key={id}
                        onClick={() => toggleTool(id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', cursor: 'pointer', fontSize: '12px', color: '#a78bfa', transition: 'all 0.15s' }}
                      >
                        {id} <span style={{ opacity: 0.6 }}>×</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* ── 技能配置 ── */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="section-label" style={{ padding: 0 }}>技能配置</span>
                    <span style={{ fontSize: '11px', color: '#636366' }}>{enabledSkills.length} 个技能</span>
                  </div>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ padding: '1px 8px', fontSize: '11px' }}
                    onClick={() => setSkillModalOpen(true)}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="10" height="10" style={{ display: 'inline', marginRight: '3px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    添加
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {enabledSkills.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#636366', padding: '8px 0' }}>暂无技能，点击「添加」从技能库选择</div>
                  )}
                  {enabledSkills.map(slug => {
                    const skill = SKILL_REGISTRY.find(s => s.slug === slug)
                    return (
                      <div
                        key={slug}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(6,182,212,0.1))', border: '1px solid rgba(139,92,246,0.2)', minWidth: '180px', maxWidth: '260px' }}
                      >
                        <span style={{ fontSize: '14px', flexShrink: 0 }}>{skill?.icon ?? '🔌'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#EBEBF5' }}>{skill?.name ?? slug}</div>
                          {skill && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', marginTop: '1px' }}>{skill.desc}</div>}
                        </div>
                        <button
                          onClick={() => handleFormChange('enabled_skills', enabledSkills.filter(s => s !== slug))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', color: '#636366', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1, flexShrink: 0 }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* ── 护栏规则 — Bug 3: split allow/deny ── */}
              <section>
                <div className="section-label" style={{ padding: '0 0 5px' }}>护栏规则</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'rgba(52,199,89,0.9)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>
                      允许规则
                    </div>
                    <TagInput
                      tags={guardrailAllow}
                      onChange={v => { handleFormChange('guardrail_allow', v); handleFormChange('guardrail_rules', v) }}
                      placeholder="允许做的事，如：发飞书消息、生成报告…"
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'rgba(244,63,94,0.9)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e', display: 'inline-block' }}></span>
                      禁止规则
                    </div>
                    <TagInput
                      tags={guardrailDeny}
                      onChange={v => handleFormChange('guardrail_deny', v)}
                      placeholder="禁止做的事，如：不删除文件、不对外发正式文件…"
                    />
                  </div>
                </div>
              </section>

              {/* ── 人格配置 / 文档编辑 ── */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                  <span className="section-label" style={{ padding: 0 }}>人格配置</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {DOC_TYPES.map(dt => (
                    <button key={dt} className={`soul-tab${activeDocTab === dt ? ' active' : ''}`} onClick={() => setActiveDocTab(dt)}>{dt}</button>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#636366', marginBottom: '7px', lineHeight: 1.5 }}>
                  {DOC_DESCRIPTIONS[activeDocTab]}
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '26px', background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '11px', color: '#636366', fontFamily: "'SF Mono','Menlo',monospace" }}>{activeDocTab}.md</span>
                    <button className="tbtn tbtn-accent" style={{ padding: '1px 8px', fontSize: '11px' }} onClick={handleSaveDoc} disabled={docLoading}>保存文档</button>
                  </div>
                  <textarea
                    className="field-textarea"
                    rows={12}
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

      {skillModalOpen && (
        <SkillModal
          enabled={enabledSkills}
          onClose={() => setSkillModalOpen(false)}
          onToggle={handleSkillToggle}
        />
      )}
    </>
  )
}
