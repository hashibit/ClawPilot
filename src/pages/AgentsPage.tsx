import { useEffect, useState, useCallback, useRef } from 'react'
import { useOpc } from '../contexts/OpcContext'
import {
  getAgents, createAgent, updateAgent, deleteAgent, reorderAgents, setDefaultAgent,
  getAgentDocument, updateAgentDocument, aiGenerateAgent, getModels,
  chatWithAgent,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType, ModelInfo, OpcConfig } from '../lib/types'

const AGENT_COLORS: string[] = [
  '#8b5cf6', '#f97316', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#14b8a6',
  '#f43f5e', '#eab308', '#06b6d4', '#84cc16', '#6366f1', '#e11d48', '#0ea5e9', '#d946ef',
  '#22c55e', '#fb923c', '#2dd4bf', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777',
  '#059669', '#b45309', '#0284c7', '#c026d3', '#16a34a', '#ea580c', '#0e7490', '#9333ea',
  '#be123c', '#4f46e5', '#0f766e', '#d97706', '#7e22ce', '#15803d', '#1d4ed8', '#9d174d',
  '#047857', '#c2410c', '#6d28d9', '#b91c1c', '#0369a1', '#4d7c0f', '#7c2d12', '#831843',
  '#14532d', '#1e3a5f', '#4a044e', '#422006', '#052e16', '#450a0a', '#1a1a2e', '#0d0221',
  '#1b0036', '#0a0a23', '#ff6b6b', '#48dbfb', '#54a0ff', '#1dd1a1', '#f368e0', '#feca57',
]

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
function TagInput({ tags, onChange, placeholder, disabled }: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [input, setInput] = useState('')
  const add = () => {
    if (disabled) return
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', padding: '6px 9px', minHeight: '36px', opacity: disabled ? 0.7 : 1 }}>
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', fontSize: '12px', padding: '2px 8px', borderRadius: '5px' }}>
          {tag}
          {!disabled && <button onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', padding: 0, lineHeight: 1, fontSize: '13px' }}>×</button>}
        </span>
      ))}
      {!disabled && <input
        type="text" value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
        }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '12px', minWidth: '80px', flex: 1 }}
      />}
    </div>
  )
}

// ── Agent Chat Drawer ──────────────────────────────────────
interface ChatMsg { role: 'user' | 'assistant'; content: string }

function ChatDrawer({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const { reply } = await chatWithAgent(agent.id, next)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e: any) {
      toast(e?.message ?? '请求失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ position: 'relative', width: '400px', height: '100%', background: '#1C1C1E', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `linear-gradient(135deg,${agent.gradient_start ?? '#8b5cf6'},${agent.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {agent.initials ?? agent.display_name.slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{agent.display_name}</div>
            <div style={{ fontSize: '11px', color: '#8E8E93' }}>测试对话 · 基于 SOUL.md</div>
          </div>
          <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>清空</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#636366', fontSize: '12px', marginTop: '40px' }}>发送一条消息来测试 {agent.display_name}</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%', padding: '9px 12px', borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: m.role === 'user' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)',
                color: '#EBEBF5', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '9px 14px', borderRadius: '12px 12px 12px 3px', background: 'rgba(255,255,255,0.07)', color: '#8E8E93', fontSize: '13px' }}>…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="发消息测试… (Enter 发送，Shift+Enter 换行)"
            rows={2}
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', color: '#EBEBF5', fontSize: '12px', padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{ padding: '8px 14px', borderRadius: '8px', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, opacity: (!input.trim() || loading) ? 0.5 : 1, alignSelf: 'flex-end' }}
          >发送</button>
        </div>
      </div>
    </div>
  )
}

// ── Skill Modal ────────────────────────────────────────────
function SkillModal({ enabled, onClose, onToggle }: {
  enabled: string[]
  onClose: () => void
  onToggle: (slug: string) => void
}) {
  const [search, setSearch] = useState('')
  const [dbSkills, setDbSkills] = useState<import('../lib/api').LocalSkill[]>([])
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([])
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load installed skills from DB on open
  useEffect(() => {
    import('../lib/api').then(api => api.getSkills()).then(setDbSkills).catch(() => {})
  }, [])

  // ClawHub search (debounced)
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
      } catch { /* offline */ }
      finally { setSearching(false) }
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  async function handleInstall(slug: string) {
    setInstalling(slug)
    try {
      const api = await import('../lib/api')
      await api.installSkill(slug)
      const fresh = await api.getSkills()
      setDbSkills(fresh)
      toast(`技能 ${slug} 已安装`, 'success')
    } catch (e: any) {
      toast(e?.message ?? '安装失败', 'error')
    } finally {
      setInstalling(null)
    }
  }

  async function handleUninstall(slug: string) {
    try {
      const api = await import('../lib/api')
      await api.uninstallSkill(slug)
      const fresh = await api.getSkills()
      setDbSkills(fresh)
      toast(`技能 ${slug} 已卸载`, 'success')
    } catch (e: any) {
      toast(e?.message ?? '卸载失败', 'error')
    }
  }

  // Installed skills from DB (filter by search)
  const installedSkills = dbSkills.filter(s =>
    s.is_installed && (!search.trim() || (s.display_name + s.name + (s.slug ?? '')).toLowerCase().includes(search.toLowerCase()))
  )

  // Remote from ClawHub search, exclude already-in-DB by slug
  const dbSlugs = new Set(dbSkills.map(s => s.slug).filter(Boolean))
  const remoteNew = remoteSkills.filter(rs => !dbSlugs.has(rs.slug))
  // Remote that are in DB but not installed
  const remoteInDbNotInstalled = remoteSkills.filter(rs =>
    dbSlugs.has(rs.slug) && !dbSkills.find(d => d.slug === rs.slug)?.is_installed
  )

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#1c1c1e', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', width: '540px', maxWidth: '90vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#EBEBF5' }}>技能管理</div>
            <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>安装技能后可添加到 Agent，部署时自动打包</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
          <input
            type="text" placeholder="搜索技能（从 ClawHub 实时检索）…" className="field-input"
            style={{ width: '100%' }} value={search} onChange={e => setSearch(e.target.value)}
          />
          {searching && (
            <span style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#8E8E93' }}>搜索中…</span>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          {/* Installed skills */}
          {installedSkills.length > 0 && (
            <>
              <div style={{ fontSize: '11px', color: '#8E8E93', padding: '2px 0', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>已安装</div>
              {installedSkills.map(skill => {
                const slug = skill.slug ?? skill.name
                const added = enabled.includes(slug)
                return (
                  <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'rgba(52,199,89,0.3)' : 'rgba(255,255,255,0.12)'}`, background: added ? 'rgba(52,199,89,0.06)' : 'rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>🔧</span>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onToggle(slug)}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{skill.display_name}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                      {skill.version && <div style={{ fontSize: '10px', color: '#636366', marginTop: '1px' }}>v{skill.version}{skill.author ? ` · ${skill.author}` : ''}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <span
                        onClick={() => onToggle(slug)}
                        style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: added ? 'rgba(52,199,89,0.15)' : 'rgba(139,92,246,0.15)', color: added ? '#34c759' : '#a78bfa', cursor: 'pointer' }}
                      >{added ? '✓ 已添加' : '+ 添加'}</span>
                      <span
                        onClick={() => handleUninstall(slug)}
                        style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', cursor: 'pointer' }}
                      >卸载</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Remote from ClawHub — in DB but not installed */}
          {remoteInDbNotInstalled.map(skill => (
            <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
          ))}

          {/* Remote — new (not in DB at all) */}
          {remoteNew.length > 0 && (
            <>
              <div style={{ fontSize: '11px', color: '#8E8E93', padding: '4px 0 2px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>ClawHub 搜索结果</div>
              {remoteNew.map(skill => (
                <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
              ))}
            </>
          )}

          {installedSkills.length === 0 && remoteSkills.length === 0 && !searching && (
            <div style={{ textAlign: 'center', color: '#636366', fontSize: '13px', padding: '32px 0' }}>
              <div style={{ marginBottom: '8px' }}>暂无已安装技能</div>
              <div style={{ fontSize: '11px' }}>在搜索框输入关键词，从 ClawHub 实时查找并安装</div>
            </div>
          )}

          {!searching && search.trim() && installedSkills.length === 0 && remoteSkills.length === 0 && (
            <div style={{ textAlign: 'center', color: '#8E8E93', fontSize: '13px', padding: '24px 0' }}>未找到相关技能</div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#8E8E93' }}>已选 {enabled.length} 个 · 已安装 {dbSkills.filter(s => s.is_installed).length} 个</span>
          <button className="tbtn tbtn-accent" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}

function SkillRow({ skill, installing, onInstall }: {
  skill: RemoteSkill
  installing: string | null
  onInstall: (slug: string) => void
}) {
  const isInstalling = installing === skill.slug
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: '18px', flexShrink: 0 }}>🔌</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#EBEBF5' }}>{skill.name}</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {skill.description_zh || skill.description}
        </div>
        <div style={{ fontSize: '10px', color: '#636366', marginTop: '1px' }}>
          {skill.ownerName} · ↓{skill.downloads.toLocaleString()} · ★{skill.stars} · v{skill.version}
        </div>
      </div>
      <button
        onClick={() => onInstall(skill.slug)}
        disabled={isInstalling}
        style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', border: '1px solid rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)', color: isInstalling ? '#636366' : '#06b6d4', cursor: isInstalling ? 'not-allowed' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
      >{isInstalling ? '安装中…' : '安装'}</button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function AgentsPage() {
  const { opcs, currentOpc, selectOpc } = useOpc()
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [activeDocTab, setActiveDocTab] = useState<DocumentType>('SOUL')
  const [docContent, setDocContent] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [form, setForm] = useState<Partial<AgentConfig>>({})
  const [editing, setEditing] = useState(false)
  const [isNewAgent, setIsNewAgent] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AgentConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [chatAgent, setChatAgent] = useState<AgentConfig | null>(null)
  const [customToolInput, setCustomToolInput] = useState('')
  const dragIndex = useRef<number | null>(null)
  const dragOpcId = useRef<string | null>(null)
  const [opcAgentsMap, setOpcAgentsMap] = useState<Record<string, AgentConfig[]>>({})

  useEffect(() => { getModels().then(setModels).catch(() => {}) }, [])

  useEffect(() => {
    if (!currentOpc) return
    getAgents(currentOpc.id)
      .then(list => {
        setOpcAgentsMap(prev => ({ ...prev, [currentOpc.id]: list }))
        const defaultAgent = list.find(a => a.is_default) ?? list[0] ?? null
        setSelectedAgent(prev => {
          if (prev) {
            const found = list.find(a => a.id === prev.id)
            if (found) return found
          }
          return defaultAgent
        })
        setForm(prev => {
          if ((prev as AgentConfig).id) {
            const found = list.find(a => a.id === (prev as AgentConfig).id)
            if (found) return found
          }
          return defaultAgent ?? {}
        })
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
    setSelectedAgent(agent); setForm(agent); setEditing(false); setIsNewAgent(false)
  }, [])

  const handleFormChange = (field: keyof AgentConfig, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveAgent = async () => {
    if (!selectedAgent || !currentOpc) return
    setSaving(true)
    try {
      const updated: AgentConfig = { ...selectedAgent, ...form, updated_at: Math.floor(Date.now() / 1000) }
      if (isNewAgent) {
        await createAgent(updated)
      } else {
        await updateAgent(selectedAgent.id, updated)
      }
      const list = await getAgents(currentOpc.id)
      setOpcAgentsMap(prev => ({ ...prev, [currentOpc.id]: list }))
      const saved = list.find(a => a.id === updated.id) ?? list[list.length - 1]
      setSelectedAgent(saved); setIsNewAgent(false); setEditing(false)
      toast('保存成功', 'success')
    } catch (e) { toast(String(e), 'error') }
    finally { setSaving(false) }
  }

  const handleCancelEdit = () => {
    if (isNewAgent) {
      const agents = currentOpc ? (opcAgentsMap[currentOpc.id] ?? []) : []
      const fallback = agents.find(a => a.is_default) ?? agents[0] ?? null
      setSelectedAgent(fallback); setForm(fallback ?? {}); setIsNewAgent(false)
    } else {
      if (selectedAgent) setForm(selectedAgent)
    }
    setEditing(false)
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

  const handleAddAgent = (targetOpc?: OpcConfig) => {
    const opc = targetOpc ?? currentOpc
    if (!opc) return
    const currentAgents = opcAgentsMap[opc.id] ?? []
    const allAgents = Object.values(opcAgentsMap).flat()
    const usedColors = new Set(allAgents.map(a => a.gradient_start))
    const colorPick = AGENT_COLORS.find(c => !usedColors.has(c)) ?? AGENT_COLORS[allAgents.length % AGENT_COLORS.length]
    const displayName = `新智能体 ${currentAgents.length + 1}`
    const now = Math.floor(Date.now() / 1000)
    const draft: AgentConfig = {
      id: crypto.randomUUID(), opc_id: opc.id,
      name: slugify(displayName), display_name: displayName,
      job_title: undefined, personality: undefined, description: undefined,
      initials: displayName.slice(0, 2),
      gradient_start: colorPick, gradient_end: colorPick,
      is_default: false, order_index: currentAgents.length,
      model_provider: undefined, model_name: undefined,
      enabled_tools: [], disabled_tools: [], enabled_skills: [],
      guardrail_rules: [], guardrail_allow: [], guardrail_deny: [],
      reports_to: [], manages: [],
      created_at: now, updated_at: now,
    }
    if (opc.id !== currentOpc?.id) selectOpc(opc)
    setSelectedAgent(draft); setForm(draft); setEditing(true); setIsNewAgent(true)
  }

  const handleDeleteAgent = async (agent: AgentConfig) => {
    if (!currentOpc) return
    try {
      await deleteAgent(agent.id)
      const list = await getAgents(currentOpc.id)
      setOpcAgentsMap(prev => ({ ...prev, [currentOpc.id]: list }))
      if (selectedAgent?.id === agent.id) {
        const next = list.find(a => a.is_default) ?? list[0] ?? null
        setSelectedAgent(next); setForm(next ?? {})
      }
      toast('已删除', 'success')
    } catch (e) { toast(String(e), 'error') }
    finally { setConfirmDelete(null) }
  }

  const handleSetDefault = async (agent: AgentConfig) => {
    if (!currentOpc) return
    try {
      await setDefaultAgent(currentOpc.id, agent.id)
      const list = await getAgents(currentOpc.id)
      setOpcAgentsMap(prev => ({ ...prev, [currentOpc.id]: list }))
      setSelectedAgent(list.find(a => a.id === agent.id) ?? agent)
      toast(`${agent.display_name} 已设为领队`, 'success')
    } catch (e) { toast(String(e), 'error') }
  }

  const handleDragStart = (opcId: string, index: number) => {
    dragIndex.current = index
    dragOpcId.current = opcId
  }

  const handleDragOver = (e: React.DragEvent, opcId: string, index: number) => {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === index || dragOpcId.current !== opcId) return
    const fromIndex = dragIndex.current
    dragIndex.current = index
    setOpcAgentsMap(prev => {
      const list = [...(prev[opcId] ?? [])]
      const [moved] = list.splice(fromIndex, 1)
      list.splice(index, 0, moved)
      return { ...prev, [opcId]: list }
    })
  }

  const handleDragEnd = async (opcId: string) => {
    try {
      const list = opcAgentsMap[opcId] ?? []
      await reorderAgents(opcId, list.map(a => a.id))
      if (currentOpc?.id === opcId) {
        const refreshed = await getAgents(opcId)
        setOpcAgentsMap(prev => ({ ...prev, [opcId]: refreshed }))
      }
      toast('排序已保存', 'success')
    } catch (e) { toast(String(e), 'error') }
    dragIndex.current = null
    dragOpcId.current = null
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
      {/* ── COL 2: Company list ─────────────────────────── */}
      <div className="list-pane">
        <div className="toolbar">
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>公司智能体</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {opcs.length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>暂无公司，请先在子公司管理中创建</div>
          )}
          {(() => {
            const running = opcs.filter(o => o.is_running && o.office_id)
            const stopped = opcs.filter(o => !o.is_running || !o.office_id)
            const renderRow = (opc: OpcConfig) => {
              const isSelected = currentOpc?.id === opc.id
              const agentCount = opcAgentsMap[opc.id] ? opcAgentsMap[opc.id].length : opc.agent_count
              return (
                <div
                  key={opc.id}
                  className={`list-row${isSelected ? ' selected' : ''}`}
                  onClick={() => selectOpc(opc)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="avatar avatar-lg" style={{ background: `linear-gradient(135deg,${opc.avatar_color ?? '#8b5cf6'},#06b6d4)` }}>
                    {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-sm text-medium" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opc.display_name}</div>
                    <div className="text-xs text-dim">{agentCount} 个智能体</div>
                  </div>
                </div>
              )
            }
            return (
              <>
                {running.length > 0 && (
                  <>
                    <div className="section-label" style={{ padding: '8px 12px 3px' }}>运行中</div>
                    {running.map(renderRow)}
                  </>
                )}
                {stopped.length > 0 && (
                  <>
                    <div className="section-label" style={{ padding: '10px 12px 3px' }}>已停止</div>
                    {stopped.map(renderRow)}
                  </>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* ── COL 3: Detail pane ──────────────────────────── */}
      <main className="detail-pane">
        {!currentOpc ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
            请选择一个公司
          </div>
        ) : (
          <>
            {/* Agents strip */}
            <div style={{ flexShrink: 0, background: '#1a1a1f' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '10px 12px', overflowX: 'auto' }}>
              {(() => {
                const base = [...(opcAgentsMap[currentOpc.id] ?? [])].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
                const list = isNewAgent && selectedAgent ? [...base, selectedAgent] : base
                return list
              })().map((agent, index) => {
                const isActive = selectedAgent?.id === agent.id
                return (
                  <div
                    key={agent.id}
                    onClick={() => handleSelectAgent(agent)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 4px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, width: '68px', background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent', border: `1px solid ${isActive ? 'rgba(139,92,246,0.35)' : 'transparent'}`, transition: 'all 0.15s' }}
                  >
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: agent.is_default ? '44px' : '36px', height: agent.is_default ? '44px' : '36px', borderRadius: agent.is_default ? '12px' : '10px', background: `linear-gradient(135deg,${agent.gradient_start ?? '#8b5cf6'},${agent.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: agent.is_default ? '14px' : '12px', fontWeight: 700, color: 'white' }}>
                        {agent.initials ?? agent.display_name.slice(0, 2)}
                      </div>
                      {agent.is_default && (
                        <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#a78bfa', border: '1.5px solid #1a1a1f' }} />
                      )}
                    </div>
                    <span style={{ fontSize: '10px', color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.6)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {agent.display_name}{isNewAgent && selectedAgent?.id === agent.id ? ' *' : ''}
                    </span>
                  </div>
                )
              })}
              {/* Add agent button */}
              <div
                onClick={() => handleAddAgent()}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 4px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, width: '68px', border: '1px dashed rgba(255,255,255,0.15)', transition: 'all 0.15s' }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                </div>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>添加</span>
              </div>
            </div>
            </div>

            {/* Agent form */}
            {!selectedAgent ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
                请点击上方选择智能体
              </div>
            ) : (
              <>
                <div className="toolbar" style={{ justifyContent: 'space-between', background: '#1a1a1f', borderBottom: '1px solid rgba(255,255,255,0.10)', height: 'auto', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `linear-gradient(135deg,${selectedAgent.gradient_start ?? '#8b5cf6'},${selectedAgent.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {selectedAgent.initials ?? selectedAgent.display_name.slice(0, 2)}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{selectedAgent.display_name}</span>
                    {isNewAgent && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>[未保存]</span>}
                    {selectedAgent.is_default && !isNewAgent && (
                      <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 500 }}>[领队]</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button className="tbtn tbtn-ghost" style={{ color: '#06b6d4' }} onClick={async () => {
                      if (isNewAgent) { toast('请先保存智能体再测试对话', 'error'); return }
                      const soul = await getAgentDocument(selectedAgent.id, 'SOUL').catch(() => '')
                      if (!soul?.trim()) { toast('SOUL.md 为空，请先填写人格配置再测试对话', 'error'); return }
                      setChatAgent(selectedAgent)
                    }}>测试对话</button>
                    {!selectedAgent.is_default && !editing && (
                      <div className="tip">
                        <button className="tbtn tbtn-ghost" onClick={() => handleSetDefault(selectedAgent)}>设为领队</button>
                        <span className="tip-content">将该智能体设置为主要响应的智能体，默认消息会发给它</span>
                      </div>
                    )}
                    {editing ? (
                      <>
                        <button className="tbtn tbtn-ghost" onClick={handleCancelEdit}>取消</button>
                        <button className="tbtn tbtn-accent" onClick={handleSaveAgent} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
                      </>
                    ) : (
                      <>
                        <button className="tbtn tbtn-ghost" onClick={() => setEditing(true)}>编辑</button>
                        <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => setConfirmDelete(selectedAgent)}>删除</button>
                      </>
                    )}
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
                    onKeyDown={e => e.key === 'Enter' && !aiGenerating && editing && handleAiGenerate()}
                    disabled={aiGenerating || !editing}
                  />
                  <button
                    className="tbtn tbtn-accent"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={handleAiGenerate}
                    disabled={aiGenerating || !aiPrompt.trim() || !editing}
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
                    <input type="text" value={form.display_name ?? ''} onChange={e => handleFormChange('display_name', e.target.value)} className="field-input" style={{ flex: 1 }} disabled={!editing} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">英文标识</span>
                    <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace" }} disabled={!editing} />
                  </div>
                  <div className="group-row" style={{ gap: '10px', alignItems: 'flex-start' }}>
                    <span className="group-label" style={{ paddingTop: '2px' }}>简介</span>
                    <textarea className="field-input" rows={2} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} disabled={!editing} />
                  </div>
                  <div className="group-row" style={{ gap: '10px' }}>
                    <span className="group-label">职位名称</span>
                    <input type="text" value={form.job_title ?? ''} onChange={e => handleFormChange('job_title', e.target.value)} className="field-input" style={{ flex: 1 }} disabled={!editing} />
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
                        disabled={!editing}
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
                      <svg style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#8E8E93' }} width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </div>
                  </div>

                  <div style={{ padding: '5px 12px 2px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    工具权限
                    <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.35)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{enabledTools.length} 个已启用</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '4px 12px 8px' }}>
                    {AVAILABLE_TOOLS.map(tool => {
                      const active = enabledTools.includes(tool.id)
                      return (
                        <button
                          key={tool.id}
                          onClick={() => editing && toggleTool(tool.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: active ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${active ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.12)'}`, cursor: editing ? 'pointer' : 'default', fontSize: '12px', color: active ? '#a78bfa' : 'rgba(235,235,245,0.7)', transition: 'all 0.15s', opacity: editing ? 1 : 0.7 }}
                        >
                          {tool.name}
                        </button>
                      )
                    })}
                    {customTools.map(id => (
                      <button
                        key={id}
                        onClick={() => editing && toggleTool(id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', cursor: editing ? 'pointer' : 'default', fontSize: '12px', color: '#a78bfa', transition: 'all 0.15s', opacity: editing ? 1 : 0.7 }}
                      >
                        {id} <span style={{ opacity: 0.6 }}>×</span>
                      </button>
                    ))}
                    {/* 自定义工具输入 */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <input
                        value={customToolInput}
                        onChange={e => setCustomToolInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const v = customToolInput.trim()
                            if (v && !enabledTools.includes(v)) {
                              handleFormChange('enabled_tools', [...enabledTools, v])
                            }
                            setCustomToolInput('')
                          }
                        }}
                        placeholder="+ 自定义工具 ID"
                        disabled={!editing}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', outline: 'none', width: '130px', opacity: editing ? 1 : 0.5 }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── 技能配置 ── */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="section-label" style={{ padding: 0 }}>技能配置</span>
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>{enabledSkills.length} 个技能</span>
                  </div>
                  {editing && <button
                    className="tbtn tbtn-ghost"
                    style={{ padding: '1px 8px', fontSize: '11px' }}
                    onClick={() => setSkillModalOpen(true)}
                  >
                    <svg fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" width="10" height="10" style={{ display: 'inline', marginRight: '3px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    添加
                  </button>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {enabledSkills.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#8E8E93', padding: '8px 0' }}>暂无技能，点击「添加」从技能库选择</div>
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
                        {editing && <button
                          onClick={() => handleFormChange('enabled_skills', enabledSkills.filter(s => s !== slug))}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', color: '#8E8E93', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1, flexShrink: 0 }}
                        >×</button>}
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
                      disabled={!editing}
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
                      disabled={!editing}
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
                <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '7px', lineHeight: 1.5 }}>
                  {DOC_DESCRIPTIONS[activeDocTab]}
                </div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '26px', background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '11px', color: '#8E8E93', fontFamily: "'SF Mono','Menlo',monospace" }}>{activeDocTab}.md</span>
                    {editing && <button className="tbtn tbtn-accent" style={{ padding: '1px 8px', fontSize: '11px' }} onClick={handleSaveDoc} disabled={docLoading}>保存文档</button>}
                  </div>
                  <textarea
                    className="field-textarea"
                    rows={12}
                    spellCheck={false}
                    value={docLoading ? '加载中...' : docContent}
                    onChange={e => setDocContent(e.target.value)}
                    disabled={docLoading || !editing}
                  />
                </div>
              </section>

            </div>
              </>
            )}
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

      {chatAgent && (
        <ChatDrawer agent={chatAgent} onClose={() => setChatAgent(null)} />
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `linear-gradient(135deg,${confirmDelete.gradient_start ?? '#8b5cf6'},${confirmDelete.gradient_end ?? '#06b6d4'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {confirmDelete.initials ?? confirmDelete.display_name.slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>{confirmDelete.display_name}</div>
                {confirmDelete.is_default && (
                  <div style={{ fontSize: '11px', color: '#a78bfa', marginTop: '2px' }}>当前领队</div>
                )}
              </div>
            </div>
            {confirmDelete.is_default ? (
              <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#f43f5e', display: 'block', marginBottom: '4px' }}>⚠️ 正在删除领队智能体</strong>
                删除后，系统将自动从剩余智能体中按顺序提升新的领队。
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                确认删除该智能体？此操作不可撤销。
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="tbtn tbtn-ghost" onClick={() => setConfirmDelete(null)}>取消</button>
              <button className="tbtn" style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e' }} onClick={() => handleDeleteAgent(confirmDelete)}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
