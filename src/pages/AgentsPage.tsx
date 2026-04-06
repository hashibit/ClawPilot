import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import {
    getAgents, createAgent, updateAgent, deleteAgent, reorderAgents, setDefaultAgent,
    getAgentDocument, updateAgentDocument, aiGenerateAgent, aiGenerateAgents, batchCreateAgents, getModels,
    chatWithAgent, createSnapshot,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType, ModelInfo, OpcConfig } from '../lib/types'
import { Icon } from '../components/Icon'

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


import type { RemoteSkillResult as RemoteSkill } from '../lib/api'

function slugify(name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') || 'agent'
    return /^[a-z]/.test(slug) ? slug : `agent_${slug.replace(/^_+/, '')}`
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

function ChatDrawer({ agent, onClose, soulOverride }: { agent: AgentConfig; onClose: () => void; soulOverride?: string }) {
    const { t } = useTranslation()
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
            const { reply } = await chatWithAgent(agent.id, next, soulOverride)
            setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        } catch (e: any) {
            toast(e?.message ?? t('agents.request_failed'), 'error')
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
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: agent.gradient_start ?? '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {agent.initials ?? agent.display_name.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{agent.display_name}</div>
                        <div style={{ fontSize: '11px', color: soulOverride ? '#f59e0b' : '#8E8E93' }}>{soulOverride ? '临时测试-智能体尚未保存' : '测试对话 · 基于 SOUL.md'}</div>
                    </div>
                    <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>{t('agents.clear_chat')}</button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#636366', fontSize: '12px', marginTop: '40px' }}>{t('agents.chat_empty', { name: agent.display_name })}</div>
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
                        placeholder={t('agents.chat_placeholder')}
                        rows={2}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', color: '#EBEBF5', fontSize: '12px', padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                        onClick={send}
                        disabled={!input.trim() || loading}
                        style={{ padding: '8px 14px', borderRadius: '8px', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, opacity: (!input.trim() || loading) ? 0.5 : 1, alignSelf: 'flex-end' }}
                    >{t('agents.send')}</button>
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
    const { t } = useTranslation()
    const [search, setSearch] = useState('')
    const [dbSkills, setDbSkills] = useState<import('../lib/api').LocalSkill[]>([])
    const [remoteSkills, setRemoteSkills] = useState<RemoteSkill[]>([])
    const [searching, setSearching] = useState(false)
    const [installing, setInstalling] = useState<string | null>(null)
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Load installed skills from DB on open
    useEffect(() => {
        import('../lib/api').then(api => api.getSkills()).then(setDbSkills).catch(() => { })
    }, [])

    // ClawHub search via server proxy (debounced)
    useEffect(() => {
        if (!search.trim()) { setRemoteSkills([]); return }
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
        searchTimerRef.current = setTimeout(async () => {
            setSearching(true)
            try {
                const api = await import('../lib/api')
                const results = await api.searchSkills(search.trim())
                setRemoteSkills(results)
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
            toast(t('agents.skill_installed', { slug }), 'success')
        } catch (e: any) {
            toast(e?.message ?? t('agents.skill_install_failed'), 'error')
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
            toast(t('agents.skill_uninstalled', { slug }), 'success')
        } catch (e: any) {
            toast(e?.message ?? t('agents.skill_uninstall_failed'), 'error')
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
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
            onClick={onClose}
        >
            <div
                style={{ background: '#1c1c1e', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#EBEBF5' }}>{t('agents.skill_modal_title')}</div>
                        <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>{t('agents.skill_modal_subtitle')}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8E8E93', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
                </div>

                {/* Search */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
                    <input
                        type="text" placeholder={t('agents.skill_search_placeholder')} className="field-input"
                        style={{ width: '100%' }} value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {searching && (
                        <span style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#8E8E93' }}>{t('agents.searching')}</span>
                    )}
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {/* Installed skills */}
                    {installedSkills.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', color: '#8E8E93', padding: '2px 0', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.installed')}</div>
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
                                            >{added ? `✓ ${t('agents.added')}` : `+ ${t('agents.add')}`}</span>
                                            <span
                                                onClick={() => handleUninstall(slug)}
                                                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,59,48,0.1)', color: '#ff3b30', cursor: 'pointer' }}
                                            >{t('agents.uninstall')}</span>
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
                            <div style={{ fontSize: '11px', color: '#8E8E93', padding: '4px 0 2px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.clawhub_results')}</div>
                            {remoteNew.map(skill => (
                                <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
                            ))}
                        </>
                    )}

                    {installedSkills.length === 0 && remoteSkills.length === 0 && !searching && (
                        <div style={{ textAlign: 'center', color: '#636366', fontSize: '13px', padding: '32px 0' }}>
                            <div style={{ marginBottom: '8px' }}>{t('agents.no_installed_skills')}</div>
                            <div style={{ fontSize: '11px' }}>{t('agents.skill_search_hint')}</div>
                        </div>
                    )}

                    {!searching && search.trim() && installedSkills.length === 0 && remoteSkills.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#8E8E93', fontSize: '13px', padding: '24px 0' }}>{t('agents.no_skills_found')}</div>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#8E8E93' }}>{t('agents.skill_selected_count', { selected: enabled.length, installed: dbSkills.filter(s => s.is_installed).length })}</span>
                    <button className="tbtn tbtn-accent" onClick={onClose}>{t('common.button_done')}</button>
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
    const { t } = useTranslation()
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
            >{isInstalling ? t('agents.installing') : t('agents.install')}</button>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────
export default function AgentsPage() {
    const { t } = useTranslation()
    const { opcs, currentOpc, selectOpc } = useOpc()

    const DOC_DESCRIPTIONS: Record<DocumentType, string> = {
        SOUL: t('agents.doc_soul'),
        IDENTITY: t('agents.doc_identity'),
        AGENTS: t('agents.doc_agents'),
        USER: t('agents.doc_user'),
        MEMORY: t('agents.doc_memory'),
        HEARTBEAT: t('agents.doc_heartbeat'),
        TOOLS: t('agents.doc_tools'),
    }

    const AVAILABLE_TOOLS = [
        { id: 'web_search', name: t('agents.tool_web_search') },
        { id: 'web_reader', name: t('agents.tool_web_reader') },
        { id: 'feishu_message', name: t('agents.tool_feishu_message') },
        { id: 'code_interpreter', name: t('agents.tool_code_interpreter') },
        { id: 'file_reader', name: t('agents.tool_file_reader') },
        { id: 'image_gen', name: t('agents.tool_image_gen') },
        { id: 'image_analysis', name: t('agents.tool_image_analysis') },
        { id: 'http_request', name: t('agents.tool_http_request') },
        { id: 'asr', name: t('agents.tool_asr') },
        { id: 'tts', name: t('agents.tool_tts') },
    ]

    // Load skill registry from bundled-skills-metadata.json
    const SKILL_REGISTRY = (window as any).__BUNDLE_SKILLS_METADATA?.skills?.map((s: any) => ({
        slug: s.slug,
        name: s.display_name,
        icon: s.icon || '🔧',
        desc: s.description,
        tag: s.category === 'core' ? t('agents.tag_core') : t('agents.tag_integration'),
    })) ?? [
        // Fallback to hardcoded list if metadata not loaded
        { slug: 'multi-round-memory', name: t('agents.skill_multi_round_memory'), icon: '💾', desc: t('agents.skill_multi_round_memory_desc'), tag: t('agents.tag_memory') },
        { slug: 'proactive-speak', name: t('agents.skill_proactive_speak'), icon: '🔔', desc: t('agents.skill_proactive_speak_desc'), tag: t('agents.tag_interaction') },
        { slug: 'scheduled-heartbeat', name: t('agents.skill_scheduled_heartbeat'), icon: '⏰', desc: t('agents.skill_scheduled_heartbeat_desc'), tag: t('agents.tag_scheduled') },
        { slug: 'mention-response', name: t('agents.skill_mention_response'), icon: '@', desc: t('agents.skill_mention_response_desc'), tag: t('agents.tag_group') },
        { slug: 'direct-response', name: t('agents.skill_direct_response'), icon: '💬', desc: t('agents.skill_direct_response_desc'), tag: t('agents.tag_dm') },
        { slug: 'message-routing', name: t('agents.skill_message_routing'), icon: '↔', desc: t('agents.skill_message_routing_desc'), tag: t('agents.tag_coordination') },
        { slug: 'context-compression', name: t('agents.skill_context_compression'), icon: '📦', desc: t('agents.skill_context_compression_desc'), tag: t('agents.tag_efficiency') },
        { slug: 'tool-calling', name: t('agents.skill_tool_calling'), icon: '🔧', desc: t('agents.skill_tool_calling_desc'), tag: t('agents.tag_smart') },
        { slug: 'memory-persistence', name: t('agents.skill_memory_persistence'), icon: '💾', desc: t('agents.skill_memory_persistence_desc'), tag: t('agents.tag_memory') },
        { slug: 'emotional-aware', name: t('agents.skill_emotional_aware'), icon: '💭', desc: t('agents.skill_emotional_aware_desc'), tag: t('agents.tag_interaction') },
        { slug: 'github-helper', name: 'GitHub 助手', icon: '🐙', desc: 'GitHub 仓库管理、PR/Issue 操作', tag: t('agents.tag_integration') },
        { slug: 'web-search', name: '网页搜索', icon: '🔍', desc: '多引擎网页搜索（Google/Bing/百度）', tag: t('agents.tag_search') },
        { slug: 'feishu-helper', name: '飞书助手', icon: '📱', desc: '飞书消息、日历、文档管理', tag: t('agents.tag_integration') },
    ]
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
    const [aiModalOpen, setAiModalOpen] = useState(false)
    const [batchModalOpen, setBatchModalOpen] = useState(false)
    const [batchPrompts, setBatchPrompts] = useState<string[]>(['', ''])
    const [batchProgress, setBatchProgress] = useState<('idle' | 'generating' | 'done' | 'error')[]>([])
    const [batchRunning, setBatchRunning] = useState(false)
    const [models, setModels] = useState<ModelInfo[]>([])
    const [skillModalOpen, setSkillModalOpen] = useState(false)
    const [chatAgent, setChatAgent] = useState<AgentConfig | null>(null)
    const [chatSoulOverride, setChatSoulOverride] = useState<string | undefined>(undefined)
    const [customToolInput, setCustomToolInput] = useState('')
    const dragIndex = useRef<number | null>(null)
    const dragOpcId = useRef<string | null>(null)
    const [opcAgentsMap, setOpcAgentsMap] = useState<Record<string, AgentConfig[]>>({})

    useEffect(() => { getModels().then(setModels).catch(() => { }) }, [])

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
            await createSnapshot(currentOpc.id, `auto:save-agent:${form.display_name ?? selectedAgent.display_name}`, true).catch(() => {})
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
            toast(t('agents.save_success'), 'success')
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
            setAiModalOpen(false)
            setAiPrompt('')
            setForm(prev => ({
                ...prev,
                display_name: result.display_name || prev.display_name,
                name: result.name || prev.name,
                job_title: result.job_title || prev.job_title,
                description: result.description || prev.description,
                personality: result.personality || prev.personality,
                guardrail_allow: result.guardrail_allow?.length ? result.guardrail_allow : prev.guardrail_allow,
                guardrail_rules: result.guardrail_allow?.length ? result.guardrail_allow : prev.guardrail_rules,
                guardrail_deny: result.guardrail_deny?.length ? result.guardrail_deny : prev.guardrail_deny,
                enabled_tools: result.enabled_tools?.length ? result.enabled_tools : prev.enabled_tools,
                enabled_skills: result.enabled_skills?.length ? result.enabled_skills : prev.enabled_skills,
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
            toast(t('agents.ai_generate_success'), 'success')
        } catch (e) { toast(String(e), 'error') }
        finally { setAiGenerating(false) }
    }

    const handleSaveDoc = async () => {
        if (!selectedAgent) return
        try {
            await updateAgentDocument(selectedAgent.id, activeDocTab, docContent)
            toast(t('agents.doc_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
    }

    const handleBatchGenerate = async () => {
        const opc = currentOpc
        if (!opc) return
        const prompts = batchPrompts.filter(p => p.trim())
        if (!prompts.length) return
        setBatchRunning(true)
        setBatchProgress(batchPrompts.map(p => p.trim() ? 'idle' : 'done'))
        await createSnapshot(opc.id, `auto:batch-add:${prompts.length}agents`, true).catch(() => {})

        try {
            // 步骤 1: 一次性用 AI 生成多个智能体配置
            setBatchProgress(prev => prev.map((s, i) => prompts[i] ? 'generating' : s))
            const generated = await aiGenerateAgents(prompts)

            const allAgents = Object.values(opcAgentsMap).flat()
            const usedColors = new Set(allAgents.map(a => a.gradient_start))
            const now = Math.floor(Date.now() / 1000)

            // 步骤 2: 构建 agents 数组和 documents 对象
            const agents: AgentConfig[] = []
            const documents: Record<string, Record<string, string>> = {}

            generated.forEach((result, idx) => {
                const colorPick = AGENT_COLORS.find(c => !usedColors.has(c)) ?? AGENT_COLORS[(allAgents.length + idx) % AGENT_COLORS.length]
                usedColors.add(colorPick)

                const agentId = crypto.randomUUID()
                const agent: AgentConfig = {
                    id: agentId, opc_id: opc.id,
                    name: slugify(result.name || prompts[idx]),
                    display_name: result.display_name || prompts[idx].slice(0, 8),
                    job_title: result.job_title,
                    description: result.description,
                    personality: result.personality,
                    initials: (result.display_name || prompts[idx]).slice(0, 2),
                    gradient_start: colorPick, gradient_end: colorPick,
                    is_default: false, order_index: idx,
                    model: undefined,
                    enabled_tools: result.enabled_tools ?? [],
                    disabled_tools: [],
                    enabled_skills: result.enabled_skills ?? [],
                    guardrail_rules: result.guardrail_allow ?? [],
                    guardrail_allow: result.guardrail_allow ?? [],
                    guardrail_deny: result.guardrail_deny ?? [],
                    reports_to: [], manages: [],
                    created_at: now, updated_at: now,
                }
                agents.push(agent)

                // 收集文档
                documents[agentId] = {
                    SOUL: result.soul ?? '',
                    IDENTITY: result.identity ?? '',
                    AGENTS: result.agents ?? '',
                    USER: result.user ?? '',
                    MEMORY: result.memory ?? '',
                    HEARTBEAT: result.heartbeat ?? '',
                    TOOLS: result.tools ?? '',
                }
            })

            // 步骤 3: 批量保存到数据库（包含文档）
            await batchCreateAgents(agents, documents)

            setBatchProgress(prev => prev.map((s, i) => prompts[i] ? 'done' : s))
        } catch (e) {
            console.error('batch generate error:', e)
            setBatchProgress(prev => prev.map((s, i) => s === 'generating' ? 'error' : s))
        }

        const list = await getAgents(opc.id)
        setOpcAgentsMap(prev => ({ ...prev, [opc.id]: list }))
        setBatchRunning(false)
        toast(t('agents.ai_generate_success'), 'success')
    }

    const handleAddAgent = (targetOpc?: OpcConfig) => {
        const opc = targetOpc ?? currentOpc
        if (!opc) return
        if (editing || isNewAgent) { toast(t('agents.unsaved_agent_warning'), 'error'); return }
        const currentAgents = opcAgentsMap[opc.id] ?? []
        const allAgents = Object.values(opcAgentsMap).flat()
        const usedColors = new Set(allAgents.map(a => a.gradient_start))
        const colorPick = AGENT_COLORS.find(c => !usedColors.has(c)) ?? AGENT_COLORS[allAgents.length % AGENT_COLORS.length]
        const displayName = t('agents.new_agent_name', { index: currentAgents.length + 1 })
        const now = Math.floor(Date.now() / 1000)
        const draft: AgentConfig = {
            id: crypto.randomUUID(), opc_id: opc.id,
            name: slugify(displayName), display_name: displayName,
            job_title: undefined, personality: undefined, description: undefined,
            initials: displayName.slice(0, 2),
            gradient_start: colorPick, gradient_end: colorPick,
            is_default: false, order_index: currentAgents.length,
            model: undefined,
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
            toast(t('common.deleted'), 'success')
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
            toast(t('agents.set_default_success', { name: agent.display_name }), 'success')
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
            toast(t('agents.reorder_saved'), 'success')
        } catch (e) { toast(String(e), 'error') }
        dragIndex.current = null
        dragOpcId.current = null
    }

    // ── Model selection helpers ──────────────────────────────
    // model field format: 'provider_name/model_id' e.g. 'bailian/qwen3.5-plus'
    // Backward compat: derive from legacy fields if model is unset
    const selectedModel = form.model
        ?? (form.model_provider && form.model_name ? `${form.model_provider}/${form.model_name}` : '')
    const modelInList = models.some(m => `${m.provider_name}/${m.model_id}` === selectedModel)
    const hasCustomModel = Boolean(selectedModel && !modelInList)

    const modelsByProvider = models.reduce((acc, m) => {
        acc[m.provider_name] = acc[m.provider_name] ?? []
        acc[m.provider_name].push(m)
        return acc
    }, {} as Record<string, ModelInfo[]>)

    const handleModelSelect = (value: string) => {
        handleFormChange('model', value || undefined)
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
            {/* ── AI 一键生成 Modal ── */}
            {aiModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', zIndex: 1000 }} onClick={() => { if (!aiGenerating) setAiModalOpen(false) }}>
                    <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '480px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{t('agents.ai_quick_gen')}</div>
                            <div style={{ fontSize: '12px', color: '#8E8E93' }}>{aiGenerating ? t('agents.generating') : t('agents.ai_generate_placeholder')}</div>
                        </div>
                        {aiGenerating ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px 0', color: '#a78bfa', fontSize: '13px' }}>
                                <Icon name="loading" size={18} spin />
                                {t('agents.generating')}
                            </div>
                        ) : (
                            <textarea
                                autoFocus
                                className="field-input"
                                rows={3}
                                style={{ resize: 'none', padding: '8px 10px', height: 'auto', lineHeight: 1.6 }}
                                placeholder={t('agents.ai_generate_placeholder')}
                                value={aiPrompt}
                                onChange={e => setAiPrompt(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiGenerate() }}
                            />
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="tbtn tbtn-ghost" disabled={aiGenerating} onClick={() => setAiModalOpen(false)}>{t('common.button_cancel')}</button>
                            <button className="tbtn tbtn-accent" disabled={aiGenerating || !aiPrompt.trim()} onClick={handleAiGenerate}>{t('agents.ai_generate_btn')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 批量添加 Modal ── */}
            {batchModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', zIndex: 1000 }} onClick={() => { if (!batchRunning) setBatchModalOpen(false) }}>
                    <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>批量添加智能体</div>
                            <div style={{ fontSize: '12px', color: '#8E8E93' }}>每行描述一个智能体角色，AI 自动生成并立即保存</div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {batchPrompts.map((p, i) => {
                                const status = batchProgress[i]
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: '#8E8E93', width: '16px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                        <input
                                            className="field-input"
                                            style={{ flex: 1 }}
                                            placeholder={`智能体 ${i + 1} 的角色描述…`}
                                            value={p}
                                            disabled={batchRunning}
                                            onChange={e => setBatchPrompts(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                                            onKeyDown={e => { if (e.key === 'Enter' && i === batchPrompts.length - 1 && !batchRunning) setBatchPrompts(prev => [...prev, '']) }}
                                        />
                                        {status === 'generating' && (
                                            <Icon name="loading" size={14} stroke="#a78bfa" strokeWidth={2} spin />
                                        )}
                                        {status === 'done' && <span style={{ color: '#34c759', fontSize: '14px', flexShrink: 0 }}>✓</span>}
                                        {status === 'error' && <span style={{ color: '#f43f5e', fontSize: '14px', flexShrink: 0 }}>✗</span>}
                                        {!batchRunning && !status && (
                                            <button onClick={() => setBatchPrompts(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                                        )}
                                    </div>
                                )
                            })}
                            {!batchRunning && (
                                <button className="tbtn tbtn-ghost" style={{ alignSelf: 'flex-start', fontSize: '12px' }} onClick={() => setBatchPrompts(prev => [...prev, ''])}>+ 添加一行</button>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="tbtn tbtn-ghost" disabled={batchRunning} onClick={() => setBatchModalOpen(false)}>{batchProgress.every(s => s === 'done' || s === 'error') && batchRunning === false && batchProgress.length > 0 ? '关闭' : t('common.button_cancel')}</button>
                            {!batchProgress.length || batchProgress.some(s => s === 'idle') ? (
                                <button className="tbtn tbtn-accent" disabled={batchRunning || !batchPrompts.some(p => p.trim())} onClick={handleBatchGenerate}>
                                    {batchRunning ? t('agents.generating') : '开始生成'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* ── COL 2: Company list ─────────────────────────── */}
            <div className="list-pane">
                <div data-tauri-drag-region className="toolbar">
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{t('agents.section_title')}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {opcs.length === 0 && (
                        <div style={{ padding: '20px 12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>{t('agents.no_companies')}</div>
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
                                    onClick={() => { selectOpc(opc); setIsNewAgent(false); setEditing(false) }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="avatar avatar-lg" style={{ background: opc.avatar_color ?? '#8b5cf6' }}>
                                        {opc.avatar_initials ?? opc.display_name.slice(0, 2)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="text-sm text-medium" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opc.display_name}</div>
                                        <div className="text-xs text-dim">{t('agents.agent_count', { count: agentCount })}</div>
                                    </div>
                                </div>
                            )
                        }
                        return (
                            <>
                                {running.length > 0 && (
                                    <>
                                        <div className="section-label" style={{ padding: '8px 12px 3px' }}>{t('common.status_running')}</div>
                                        {running.map(renderRow)}
                                    </>
                                )}
                                {stopped.length > 0 && (
                                    <>
                                        <div className="section-label" style={{ padding: '10px 12px 3px' }}>{t('common.status_stopped')}</div>
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
                        {t('agents.select_company_hint')}
                    </div>
                ) : (
                    <>
                        {/* Agents strip */}
                        <div style={{ flexShrink: 0, background: '#1a1a1f', display: 'flex', alignItems: 'center' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', padding: '10px 12px', overflowX: 'auto', minWidth: 0 }}>
                                {(() => {
                                    const base = [...(opcAgentsMap[currentOpc.id] ?? [])].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
                                    const list = isNewAgent && selectedAgent ? [...base, selectedAgent] : base
                                    return list
                                })().map((agent) => {
                                    const isActive = selectedAgent?.id === agent.id
                                    return (
                                        <div
                                            key={agent.id}
                                            onClick={() => handleSelectAgent(agent)}
                                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 4px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, width: '68px', background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent', border: `1px solid ${isActive ? 'rgba(139,92,246,0.35)' : 'transparent'}`, transition: 'all 0.15s' }}
                                        >
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ width: agent.is_default ? '44px' : '36px', height: agent.is_default ? '44px' : '36px', borderRadius: agent.is_default ? '12px' : '10px', background: agent.gradient_start ?? '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: agent.is_default ? '14px' : '12px', fontWeight: 700, color: 'white' }}>
                                                    {agent.initials ?? agent.display_name.slice(0, 2)}
                                                </div>
                                                {agent.is_default && (
                                                    <div style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', borderRadius: '50%', background: '#a78bfa', border: '1.5px solid #1a1a1f' }} />
                                                )}
                                            </div>
                                            <span style={{ fontSize: '10px', color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.85)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                {agent.display_name}{(isNewAgent || editing) && selectedAgent?.id === agent.id ? ' *' : ''}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                            {/* Add buttons — right-aligned, same column style as before */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 12px', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                                <div
                                    onClick={() => handleAddAgent()}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 4px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, width: '68px', border: '1px dashed rgba(255,255,255,0.15)', transition: 'all 0.15s' }}
                                >
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon name="plus" size={16} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
                                    </div>
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>添加智能体</span>
                                </div>
                                <div
                                    onClick={() => { setBatchPrompts(['', '']); setBatchProgress([]); setBatchRunning(false); setBatchModalOpen(true) }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '6px 4px', borderRadius: '8px', cursor: 'pointer', flexShrink: 0, width: '68px', border: '1px dashed rgba(139,92,246,0.3)', transition: 'all 0.15s' }}
                                >
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(139,92,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon name="bolt" size={16} stroke="rgba(139,92,246,0.6)" strokeWidth={2} />
                                    </div>
                                    <span style={{ fontSize: '10px', color: 'rgba(139,92,246,0.9)' }}>批量添加</span>
                                </div>
                            </div>
                        </div>

                        {/* Agent form */}
                        {!selectedAgent ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8E8E93', fontSize: '13px' }}>
                                {t('agents.select_agent_hint')}
                            </div>
                        ) : (
                            <>
                                <div className="toolbar" style={{ justifyContent: 'space-between', background: '#1a1a1f', borderBottom: '1px solid rgba(255,255,255,0.10)', height: 'auto', padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: selectedAgent.gradient_start ?? '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                                            {selectedAgent.initials ?? selectedAgent.display_name.slice(0, 2)}
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{(editing ? (form as AgentConfig).display_name : null) || selectedAgent.display_name}</span>
                                        {(isNewAgent || editing) && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>[{t('agents.unsaved')}]</span>}
                                        {selectedAgent.is_default && !isNewAgent && (
                                            <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 500 }}>[{t('agents.leader')}]</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {editing && <button className="tbtn tbtn-ghost" style={{ color: '#a78bfa' }} disabled={aiGenerating} onClick={() => { setAiPrompt(''); setAiModalOpen(true) }}>
                                            <Icon name="bolt" size={11} strokeWidth={2.2} style={{ display: 'inline', marginRight: '4px' }} />
                                            {aiGenerating ? t('agents.generating') : t('agents.ai_quick_gen')}
                                        </button>}
                                        <button className="tbtn tbtn-ghost" style={{ color: '#06b6d4' }} onClick={async () => {
                                            if (activeDocTab === 'SOUL' && docContent.trim()) {
                                                // Use current editor content (may be unsaved)
                                                setChatSoulOverride(docContent)
                                                setChatAgent(selectedAgent)
                                            } else if (isNewAgent) {
                                                toast(t('agents.save_first_warning'), 'error')
                                            } else {
                                                const soul = await getAgentDocument(selectedAgent.id, 'SOUL').catch(() => '')
                                                if (!soul?.trim()) { toast(t('agents.soul_empty_warning'), 'error'); return }
                                                setChatSoulOverride(undefined)
                                                setChatAgent(selectedAgent)
                                            }
                                        }}>{t('agents.test_chat')}</button>
                                        {!selectedAgent.is_default && !editing && (
                                            <div className="tip">
                                                <button className="tbtn tbtn-ghost" onClick={() => handleSetDefault(selectedAgent)}>{t('agents.set_as_leader')}</button>
                                                <span className="tip-content">{t('agents.set_as_leader_tooltip')}</span>
                                            </div>
                                        )}
                                        {editing ? (
                                            <>
                                                <button className="tbtn tbtn-ghost" onClick={handleCancelEdit}>{t('common.button_cancel')}</button>
                                                <button className="tbtn tbtn-accent" onClick={handleSaveAgent} disabled={saving}>{saving ? t('common.saving') : t('common.button_save')}</button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="tbtn tbtn-ghost" onClick={() => setEditing(true)}>{t('common.button_edit')}</button>
                                                <button className="tbtn tbtn-ghost" style={{ color: '#f43f5e' }} onClick={() => setConfirmDelete(selectedAgent)}>{t('common.button_delete')}</button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                                    {/* ── 基本信息 ── */}
                                    <section>
                                        <div className="section-label" style={{ padding: '0 0 5px' }}>{t('agents.section_basic')}</div>
                                        <div className="group">
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label">{t('agents.display_name')}</span>
                                                {editing ? <input type="text" value={form.display_name ?? ''} onChange={e => handleFormChange('display_name', e.target.value)} className="field-input" style={{ flex: 1 }} /> : <span className="group-value">{form.display_name || '—'}</span>}
                                            </div>
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label">{t('agents.identifier')}</span>
                                                {editing ? <input type="text" value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} className="field-input" style={{ flex: 1, fontFamily: "'SF Mono','Menlo',monospace" }} /> : <span className="group-value" style={{ fontFamily: "'SF Mono','Menlo',monospace" }}>{form.name || '—'}</span>}
                                            </div>
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label">{t('agents.description')}</span>
                                                {editing ? <textarea className="field-input" rows={1} style={{ flex: 1, padding: '5px 9px', lineHeight: 1.5, resize: 'none', height: '36px', overflowY: 'auto' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} /> : <span className="group-value">{form.description || '—'}</span>}
                                            </div>
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label">{t('agents.job_title')}</span>
                                                {editing ? <input type="text" value={form.job_title ?? ''} onChange={e => handleFormChange('job_title', e.target.value)} className="field-input" style={{ flex: 1 }} /> : <span className="group-value">{form.job_title || '—'}</span>}
                                            </div>
                                        </div>
                                    </section>

                                    {/* ── 模型与工具 ── */}
                                    <section>
                                        <div className="section-label" style={{ padding: '0 0 5px' }}>{t('agents.section_model_tools')}</div>
                                        <div className="group">
                                            <div className="group-row" style={{ gap: '10px' }}>
                                                <span className="group-label">{t('agents.model_label')}</span>
                                                {editing ? (
                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <select
                                                            className="field-input"
                                                            style={{ width: '100%', paddingRight: '24px' }}
                                                            value={selectedModel}
                                                            onChange={e => handleModelSelect(e.target.value)}
                                                        >
                                                            <option value="">{t('agents.model_none')}</option>
                                                            {hasCustomModel && (
                                                                <optgroup label={t('agents.model_stored')}>
                                                                    <option value={selectedModel}>{selectedModel} ({t('agents.model_stored')})</option>
                                                                </optgroup>
                                                            )}
                                                            {Object.entries(modelsByProvider).map(([providerName, mlist]) => (
                                                                <optgroup key={providerName} label={providerName}>
                                                                    {mlist.map(m => (
                                                                        <option key={m.id} value={`${m.provider_name}/${m.model_id}`}>{m.display_name || m.model_id}</option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                        <Icon name="chevron-down" size={10} stroke="#8E8E93" strokeWidth={2} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                                    </div>
                                                ) : (
                                                    <span className="group-value">{selectedModel || t('agents.model_none')}</span>
                                                )}
                                            </div>

                                            <div style={{ padding: '5px 12px 2px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                                {t('agents.tool_permissions')}
                                                <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.35)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t('agents.tools_enabled_count', { count: enabledTools.length })}</span>
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
                                                        placeholder={t('agents.custom_tool_placeholder')}
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
                                                <span className="section-label" style={{ padding: 0 }}>{t('agents.section_skills')}</span>
                                                <span style={{ fontSize: '11px', color: '#8E8E93' }}>{t('agents.skills_count', { count: enabledSkills.length })}</span>
                                            </div>
                                            {editing && <button
                                                className="tbtn tbtn-ghost"
                                                style={{ padding: '1px 8px', fontSize: '11px' }}
                                                onClick={() => setSkillModalOpen(true)}
                                            >
                                                <Icon name="plus" size={10} strokeWidth={1.75} style={{ display: 'inline', marginRight: '3px' }} />
                                                {t('common.button_add')}
                                            </button>}
                                        </div>
                                        <div className="group" style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {enabledSkills.length === 0 && (
                                                <div style={{ fontSize: '12px', color: '#8E8E93' }}>{t('agents.no_skills')}</div>
                                            )}
                                            {enabledSkills.map(slug => {
                                                const skill = SKILL_REGISTRY.find(s => s.slug === slug)
                                                return (
                                                    <div
                                                        key={slug}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', minWidth: '180px', maxWidth: '260px' }}
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

                                    {/* ── 护栏规则 ── */}
                                    <section>
                                        <div className="section-label" style={{ padding: '0 0 5px' }}>{t('agents.section_guardrails')}</div>
                                        <div className="group" style={{ padding: '12px', display: 'flex', gap: '12px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '11px', color: 'rgba(52,199,89,0.9)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34c759', display: 'inline-block' }}></span>
                                                    {t('agents.guardrail_allow')}
                                                </div>
                                                <TagInput
                                                    tags={guardrailAllow}
                                                    onChange={v => { handleFormChange('guardrail_allow', v); handleFormChange('guardrail_rules', v) }}
                                                    placeholder={t('agents.guardrail_allow_placeholder')}
                                                    disabled={!editing}
                                                />
                                            </div>
                                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '11px', color: 'rgba(244,63,94,0.9)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e', display: 'inline-block' }}></span>
                                                    {t('agents.guardrail_deny')}
                                                </div>
                                                <TagInput
                                                    tags={guardrailDeny}
                                                    onChange={v => handleFormChange('guardrail_deny', v)}
                                                    placeholder={t('agents.guardrail_deny_placeholder')}
                                                    disabled={!editing}
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    {/* ── 人格配置 / 文档编辑 ── */}
                                    <section>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
                                            <span className="section-label" style={{ padding: 0 }}>{t('agents.section_persona')}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                            {DOC_TYPES.map(dt => (
                                                <button key={dt} className={`soul-tab${activeDocTab === dt ? ' active' : ''}`} title={DOC_DESCRIPTIONS[dt]} onClick={() => setActiveDocTab(dt)}>{dt}</button>
                                            ))}
                                        </div>
                                        <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <div style={{ height: '26px', background: '#2C2C2E', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <span style={{ fontSize: '11px', color: '#8E8E93', fontFamily: "'SF Mono','Menlo',monospace" }}>{activeDocTab}.md</span>
                                                {editing && <button className="tbtn tbtn-accent" style={{ padding: '1px 8px', fontSize: '11px' }} onClick={handleSaveDoc} disabled={docLoading}>{t('agents.save_doc')}</button>}
                                            </div>
                                            <textarea
                                                className="field-textarea"
                                                rows={12}
                                                spellCheck={false}
                                                value={docLoading ? t('common.loading') : docContent}
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
                <ChatDrawer agent={chatAgent} onClose={() => { setChatAgent(null); setChatSoulOverride(undefined) }} soulOverride={chatSoulOverride} />
            )}

            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
                    <div style={{ background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: confirmDelete.gradient_start ?? '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                                {confirmDelete.initials ?? confirmDelete.display_name.slice(0, 2)}
                            </div>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>{confirmDelete.display_name}</div>
                                {confirmDelete.is_default && (
                                    <div style={{ fontSize: '11px', color: '#a78bfa', marginTop: '2px' }}>{t('agents.leader')}</div>
                                )}
                            </div>
                        </div>
                        {confirmDelete.is_default ? (
                            <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#fca5a5', lineHeight: 1.6 }}>
                                <strong style={{ color: '#f43f5e', display: 'block', marginBottom: '4px' }}>⚠️ {t('agents.delete_leader_warning_title')}</strong>
                                {t('agents.delete_leader_warning_body')}
                            </div>
                        ) : (
                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                                {t('agents.delete_confirm')}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="tbtn tbtn-ghost" onClick={() => setConfirmDelete(null)}>{t('common.button_cancel')}</button>
                            <button className="tbtn" style={{ background: 'rgba(244,63,94,0.15)', color: '#f43f5e' }} onClick={() => handleDeleteAgent(confirmDelete)}>{t('agents.confirm_delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
