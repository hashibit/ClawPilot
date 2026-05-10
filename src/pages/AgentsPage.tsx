import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'

interface BundleSkillMeta { slug: string; name: string; display_name: string; description?: string; icon?: string; category?: string }
interface BundleSkillsMetadata { skills?: BundleSkillMeta[] }
declare global { interface Window { __BUNDLE_SKILLS_METADATA?: BundleSkillsMetadata } }
import {
    getAgents, createAgent, updateAgent, deleteAgent, reorderAgents, setDefaultAgent,
    getAgentDocument, updateAgentDocument, aiGenerateAgent, aiGenerateAgents, batchCreateAgents, getModels,
    createSnapshot,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType, ModelInfo, OpcConfig } from '../lib/types'
import { agentAvatarText, isEmojiAvatar } from '../lib/agent-avatar'
import { Icon } from '../components/Icon'
import { TagInput } from '../components/TagInput'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENT_COLORS, DOC_TYPES, slugify } from './agents/constants'

import type { RemoteSkillResult as RemoteSkill } from '../lib/api'

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
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : t('agents.skill_install_failed'), 'error')
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
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : t('agents.skill_uninstall_failed'), 'error')
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
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className="modal-panel"
                style={{ width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('agents.skill_modal_title')}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-dimmer)', marginTop: '2px' }}>{t('agents.skill_modal_subtitle')}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
                </div>

                {/* Search */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
                    <input
                        type="text" placeholder={t('agents.skill_search_placeholder')} className="field-input"
                        style={{ width: '100%' }} value={search} onChange={e => setSearch(e.target.value)}
                    />
                    {searching && (
                        <span style={{ position: 'absolute', right: '32px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-dimmer)' }}>{t('agents.searching')}</span>
                    )}
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                    {/* Installed skills */}
                    {installedSkills.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', padding: '2px 0', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.installed')}</div>
                            {installedSkills.map(skill => {
                                const slug = skill.slug ?? skill.name
                                const added = enabled.includes(slug)
                                return (
                                    <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${added ? 'var(--success-muted)' : 'var(--border-default)'}`, background: added ? 'var(--success-muted)' : 'var(--border-subtle)' }}>
                                        <span style={{ fontSize: '18px', flexShrink: 0 }}>🔧</span>
                                        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onToggle(slug)}>
                                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{skill.display_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                                            {skill.version && <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '1px' }}>v{skill.version}{skill.author ? ` · ${skill.author}` : ''}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            <span
                                                onClick={() => onToggle(slug)}
                                                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: added ? 'var(--success-muted)' : 'var(--accent-muted)', color: added ? 'var(--success)' : 'var(--accent-hover)', cursor: 'pointer' }}
                                            >{added ? `✓ ${t('agents.added')}` : `+ ${t('agents.add')}`}</span>
                                            <span
                                                onClick={() => handleUninstall(slug)}
                                                style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--error-muted)', color: 'var(--error)', cursor: 'pointer' }}
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
                            <div style={{ fontSize: '11px', color: 'var(--text-dimmer)', padding: '4px 0 2px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('agents.clawhub_results')}</div>
                            {remoteNew.map(skill => (
                                <SkillRow key={skill.slug} skill={skill} installing={installing} onInstall={handleInstall} />
                            ))}
                        </>
                    )}

                    {installedSkills.length === 0 && remoteSkills.length === 0 && !searching && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px', padding: '32px 0' }}>
                            <div style={{ marginBottom: '8px' }}>{t('agents.no_installed_skills')}</div>
                            <div style={{ fontSize: '11px' }}>{t('agents.skill_search_hint')}</div>
                        </div>
                    )}

                    {!searching && search.trim() && installedSkills.length === 0 && remoteSkills.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '13px', padding: '24px 0' }}>{t('agents.no_skills_found')}</div>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{t('agents.skill_selected_count', { selected: enabled.length, installed: dbSkills.filter(s => s.is_installed).length })}</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--border-subtle)' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>🔌</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{skill.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description_zh || skill.description}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-dimmer)', marginTop: '1px' }}>
                    {skill.ownerName} · ↓{skill.downloads.toLocaleString()} · ★{skill.stars} · v{skill.version}
                </div>
            </div>
            <button
                onClick={() => onInstall(skill.slug)}
                disabled={isInstalling}
                style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '5px', border: '1px solid rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)', color: isInstalling ? 'var(--text-dimmer)' : 'var(--info)', cursor: isInstalling ? 'not-allowed' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            >{isInstalling ? t('agents.installing') : t('agents.install')}</button>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────
export default function AgentsPage() {
    const { t } = useTranslation()
    const { currentOpc, selectOpc } = useOpc()

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
    const SKILL_REGISTRY = window.__BUNDLE_SKILLS_METADATA?.skills?.map((s) => ({
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
                // guardrail_rules is a legacy alias for guardrail_allow (see types.ts comment).
                // The AI result struct has no separate `guardrail_rules` field, so we
                // intentionally mirror guardrail_allow into both. Confirmed not a bug —
                // see cccombat seq-4 for the back-and-forth.
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

    // Derived display values for the selected agent toolbar
    const toolbarColor = selectedAgent?.gradient_start ?? 'var(--accent)'
    const toolbarInitials = selectedAgent ? agentAvatarText(selectedAgent) : ''
    const toolbarIsEmoji = selectedAgent ? isEmojiAvatar(selectedAgent) : false
    const toolbarName = editing
        ? ((form as AgentConfig).display_name || selectedAgent?.display_name || '')
        : (selectedAgent?.display_name || '')

    return (
        <div className="agents-page">
            {/* ── AI 一键生成 Modal ── */}
            {aiModalOpen && (
                <div className="modal-backdrop" onClick={() => { if (!aiGenerating) setAiModalOpen(false) }}>
                    <div className="modal-panel" style={{ padding: '24px', width: '480px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{t('agents.ai_quick_gen')}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{aiGenerating ? t('agents.generating') : t('agents.ai_generate_placeholder')}</div>
                        </div>
                        {aiGenerating ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '20px 0', color: 'var(--accent-hover)', fontSize: '13px' }}>
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
                            <button className="btn btn-ghost" disabled={aiGenerating} onClick={() => setAiModalOpen(false)}>{t('common.button_cancel')}</button>
                            <button className="btn btn-primary" disabled={aiGenerating || !aiPrompt.trim()} onClick={handleAiGenerate}>{t('agents.ai_generate_btn')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 批量添加 Modal ── */}
            {batchModalOpen && (
                <div className="modal-backdrop" onClick={() => { if (!batchRunning) setBatchModalOpen(false) }}>
                    <div className="modal-panel" style={{ padding: '24px', width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>批量添加智能体</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>每行描述一个智能体角色，AI 自动生成并立即保存</div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {batchPrompts.map((p, i) => {
                                const status = batchProgress[i]
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', width: '16px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
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
                                            <Icon name="loading" size={14} stroke="var(--accent-hover)" strokeWidth={2} spin />
                                        )}
                                        {status === 'done' && <span style={{ color: 'var(--success)', fontSize: '14px', flexShrink: 0 }}>✓</span>}
                                        {status === 'error' && <span style={{ color: 'var(--error)', fontSize: '14px', flexShrink: 0 }}>✗</span>}
                                        {!batchRunning && !status && (
                                            <button onClick={() => setBatchPrompts(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                                        )}
                                    </div>
                                )
                            })}
                            {!batchRunning && (
                                <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: '12px' }} onClick={() => setBatchPrompts(prev => [...prev, ''])}>+ 添加一行</button>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-ghost" disabled={batchRunning} onClick={() => setBatchModalOpen(false)}>{batchProgress.every(s => s === 'done' || s === 'error') && batchRunning === false && batchProgress.length > 0 ? '关闭' : t('common.button_cancel')}</button>
                            {!batchProgress.length || batchProgress.some(s => s === 'idle') ? (
                                <button className="btn btn-primary" disabled={batchRunning || !batchPrompts.some(p => p.trim())} onClick={handleBatchGenerate}>
                                    {batchRunning ? t('agents.generating') : '开始生成'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {!currentOpc ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>
                    {t('agents.select_company_hint')}
                </div>
            ) : (
                <>
                    {/* ── Agent strip ── */}
                    <div className="agent-strip">
                        {(() => {
                            const base = [...(opcAgentsMap[currentOpc.id] ?? [])].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
                            return isNewAgent && selectedAgent ? [...base, selectedAgent] : base
                        })().map(agent => {
                            const isActive = selectedAgent?.id === agent.id
                            const avatarText = agentAvatarText(agent)
                            return (
                                <div
                                    key={agent.id}
                                    className={'agent-pill' + (isActive ? ' selected' : '') + (agent.is_default ? ' leader' : '')}
                                    onClick={() => handleSelectAgent(agent)}
                                >
                                    <div
                                        className="agent-pill-avatar"
                                        style={{ background: agent.gradient_start ?? 'var(--accent)', color: 'white', fontWeight: 700 }}
                                    >
                                        {avatarText}
                                    </div>
                                    <div className="agent-pill-name">
                                        {agent.display_name}
                                        {(isNewAgent || editing) && isActive ? ' *' : ''}
                                    </div>
                                </div>
                            )
                        })}

                        {/* Empty hint */}
                        {(opcAgentsMap[currentOpc.id] ?? []).length === 0 && !isNewAgent && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
                                还没有智能体，点击右侧按钮添加
                            </div>
                        )}

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            {/* Add single agent */}
                            <div className="agent-pill" onClick={() => handleAddAgent()}>
                                <div className="agent-pill-add">
                                    <Icon name="plus" size={18} stroke="var(--text-tertiary)" strokeWidth={2} />
                                </div>
                                <div className="agent-pill-name">添加</div>
                            </div>

                            {/* Batch add */}
                            <div
                                className="agent-pill"
                                style={{ borderColor: 'var(--accent-border)' }}
                                onClick={() => { setBatchPrompts(['', '']); setBatchProgress([]); setBatchRunning(false); setBatchModalOpen(true) }}
                            >
                                <div className="agent-pill-add" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
                                    <Icon name="bolt" size={16} stroke="var(--accent)" strokeWidth={2} />
                                </div>
                                <div className="agent-pill-name" style={{ color: 'var(--accent)' }}>批量</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Agent detail area ── */}
                    {!selectedAgent ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>
                            {t('agents.select_agent_hint')}
                        </div>
                    ) : (
                        <>
                            {/* ── Agent detail (scrollable, includes toolbar) ── */}
                            <div className="agent-detail">
                                {/* ── Agent toolbar ── */}
                                <div className="agent-toolbar">
                                    <div className="agent-toolbar-name">
                                        {toolbarName}
                                        {selectedAgent.is_default && !isNewAgent && (
                                            <span className="tag accent" style={{ marginLeft: 8 }}><Icon name="star" size={10} style={{ marginRight: 4 }} />{t('agents.leader')}</span>
                                        )}
                                        {(isNewAgent || editing) && (
                                            <span className="unsaved-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--warning, orange)', marginLeft: 6, verticalAlign: 'middle' }} />
                                        )}
                                    </div>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button
                                            className="btn btn-sm"
                                            disabled={aiGenerating}
                                            onClick={() => { if (!editing) setEditing(true); setAiPrompt(''); setAiModalOpen(true) }}
                                        >
                                            <Icon name="bolt" size={11} strokeWidth={2.2} style={{ display: 'inline', marginRight: 4 }} />
                                            {aiGenerating ? t('agents.generating') : t('agents.ai_quick_gen')}
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            onClick={async () => {
                                                if (activeDocTab === 'SOUL' && docContent.trim()) {
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
                                            }}
                                        >
                                            <Icon name="message" size={13} />
                                            {t('agents.test_chat')}
                                        </button>
                                        {!selectedAgent.is_default && !editing && (
                                            <div className="tip">
                                                <button className="btn btn-sm" onClick={() => handleSetDefault(selectedAgent)}>
                                                    <Icon name="star" size={13} />
                                                    {t('agents.set_as_leader')}
                                                </button>
                                                <span className="tip-content">{t('agents.set_as_leader_tooltip')}</span>
                                            </div>
                                        )}
                                        {editing ? (
                                            <>
                                                <button className="btn btn-sm" onClick={handleCancelEdit}>{t('common.button_cancel')}</button>
                                                <button className="btn btn-sm btn-primary" onClick={handleSaveAgent} disabled={saving}>
                                                    <Icon name="check" size={13} />
                                                    {saving ? t('common.saving') : t('common.button_save')}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
                                                    <Icon name="edit" size={13} />
                                                    {t('common.button_edit')}
                                                </button>
                                                <button className="btn btn-sm btn-danger btn-icon" onClick={() => setConfirmDelete(selectedAgent)} title={t('common.button_delete')}>
                                                    <Icon name="trash" size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Basic Info */}
                                <div className="section-card">
                                    <div className="section-card-head">
                                        <div>
                                            <h3 className="section-card-title">{t('agents.section_basic')}</h3>
                                            <div className="section-card-sub">名称、职位、简介</div>
                                        </div>
                                    </div>
                                    <div className="section-card-body">
                                        <div className="field-row">
                                            <div className="field-label-cell"><div className="field-name">{t('agents.display_name')}</div></div>
                                            <div className="field-value-cell">
                                                {editing
                                                    ? <input type="text" className="input" value={form.display_name ?? ''} onChange={e => handleFormChange('display_name', e.target.value)} />
                                                    : <div className="read-value">{form.display_name || '—'}</div>}
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label-cell"><div className="field-name">{t('agents.identifier')}</div></div>
                                            <div className="field-value-cell">
                                                {editing
                                                    ? <input type="text" className="input" style={{ fontFamily: "'SF Mono','Menlo',monospace" }} value={form.name ?? ''} onChange={e => handleFormChange('name', e.target.value)} />
                                                    : <div className="read-value" style={{ fontFamily: "'SF Mono','Menlo',monospace" }}>{form.name || '—'}</div>}
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label-cell"><div className="field-name">{t('agents.job_title')}</div></div>
                                            <div className="field-value-cell">
                                                {editing
                                                    ? <input type="text" className="input" value={form.job_title ?? ''} onChange={e => handleFormChange('job_title', e.target.value)} />
                                                    : <div className="read-value">{form.job_title || '—'}</div>}
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label-cell"><div className="field-name">{t('agents.description')}</div></div>
                                            <div className="field-value-cell">
                                                {editing
                                                    ? <textarea className="input" rows={2} style={{ resize: 'none', height: 'auto', padding: '8px 12px' }} value={form.description ?? ''} onChange={e => handleFormChange('description', e.target.value)} />
                                                    : <div className="read-value">{form.description || '—'}</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Model & Tools */}
                                <div className="section-card">
                                    <div className="section-card-head">
                                        <div>
                                            <h3 className="section-card-title">{t('agents.section_model_tools')}</h3>
                                        </div>
                                    </div>
                                    <div className="section-card-body">
                                        <div className="field-row">
                                            <div className="field-label-cell"><div className="field-name">{t('agents.model_label')}</div></div>
                                            <div className="field-value-cell">
                                                {editing ? (
                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <select
                                                            className="input"
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
                                                        <Icon name="chevron-down" size={10} stroke="var(--text-dimmer)" strokeWidth={2} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                                    </div>
                                                ) : (
                                                    <div className="read-value">{selectedModel || t('agents.model_none')}</div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ padding: '5px 0 4px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                            {t('agents.tool_permissions')}
                                            <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t('agents.tools_enabled_count', { count: enabledTools.length })}</span>
                                        </div>
                                        <div className="tools-grid">
                                            {AVAILABLE_TOOLS.map(tool => {
                                                const active = enabledTools.includes(tool.id)
                                                return (
                                                    <div
                                                        key={tool.id}
                                                        className={'tool-chip' + (active ? ' on' : '')}
                                                        onClick={() => editing && toggleTool(tool.id)}
                                                        style={{ opacity: editing ? 1 : 0.7, cursor: editing ? 'pointer' : 'default' }}
                                                    >
                                                        <div className="tool-chip-name">{tool.name}</div>
                                                    </div>
                                                )
                                            })}
                                            {customTools.map(id => (
                                                <div
                                                    key={id}
                                                    className="tool-chip on"
                                                    onClick={() => editing && toggleTool(id)}
                                                    style={{ opacity: editing ? 1 : 0.7, cursor: editing ? 'pointer' : 'default' }}
                                                >
                                                    <div className="tool-chip-name">{id} <span style={{ opacity: 0.6 }}>×</span></div>
                                                </div>
                                            ))}
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
                                                style={{ background: 'var(--border-subtle)', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', color: 'var(--text-secondary)', outline: 'none', width: '130px', opacity: editing ? 1 : 0.5 }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Skills */}
                                <div className="section-card">
                                    <div className="section-card-head">
                                        <div>
                                            <h3 className="section-card-title">{t('agents.section_skills')}</h3>
                                            <div className="section-card-sub">{t('agents.skills_count', { count: enabledSkills.length })}</div>
                                        </div>
                                        {editing && (
                                            <button className="btn btn-sm btn-ghost" onClick={() => setSkillModalOpen(true)}>
                                                <Icon name="plus" size={10} strokeWidth={1.75} style={{ display: 'inline', marginRight: 3 }} />
                                                {t('common.button_add')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="section-card-body">
                                        <div className="skill-list">
                                            {enabledSkills.length === 0 && (
                                                <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{t('agents.no_skills')}</div>
                                            )}
                                            {enabledSkills.map(slug => {
                                                const skill = SKILL_REGISTRY.find((s: { slug: string }) => s.slug === slug)
                                                return (
                                                    <div key={slug} className="skill-card">
                                                        <span style={{ fontSize: '14px', flexShrink: 0 }}>{skill?.icon ?? '🔌'}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{skill?.name ?? slug}</div>
                                                            {skill && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 1 }}>{skill.desc}</div>}
                                                        </div>
                                                        {editing && (
                                                            <button
                                                                onClick={() => handleFormChange('enabled_skills', enabledSkills.filter(s => s !== slug))}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'var(--border-subtle)', color: 'var(--text-dimmer)', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1, flexShrink: 0 }}
                                                            >×</button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Guardrails */}
                                <div className="section-card">
                                    <div className="section-card-head">
                                        <div>
                                            <h3 className="section-card-title">{t('agents.section_guardrails')}</h3>
                                        </div>
                                    </div>
                                    <div className="section-card-body">
                                        <div className="rail-grid">
                                            <div className="rail-pane">
                                                <div className="rail-head allow">
                                                    <Icon name="check" size={12} />
                                                    {t('agents.guardrail_allow')}
                                                </div>
                                                <div className="rail-body">
                                                    <TagInput
                                                        tags={guardrailAllow}
                                                        onChange={v => { handleFormChange('guardrail_allow', v); handleFormChange('guardrail_rules', v) }}
                                                        placeholder={t('agents.guardrail_allow_placeholder')}
                                                        disabled={!editing}
                                                    />
                                                </div>
                                            </div>
                                            <div className="rail-pane">
                                                <div className="rail-head deny">
                                                    <Icon name="lock" size={12} />
                                                    {t('agents.guardrail_deny')}
                                                </div>
                                                <div className="rail-body">
                                                    <TagInput
                                                        tags={guardrailDeny}
                                                        onChange={v => handleFormChange('guardrail_deny', v)}
                                                        placeholder={t('agents.guardrail_deny_placeholder')}
                                                        disabled={!editing}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Persona docs */}
                                <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <div className="section-card-head" style={{ padding: '14px 16px 12px' }}>
                                        <div>
                                            <h3 className="section-card-title">{t('agents.section_persona')}</h3>
                                        </div>
                                        {editing && (
                                            <button className="btn btn-sm btn-primary" onClick={handleSaveDoc} disabled={docLoading}>
                                                {t('agents.save_doc')}
                                            </button>
                                        )}
                                    </div>
                                    <div className="tabs" style={{ display: 'flex', gap: 2, padding: '0 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                                        {DOC_TYPES.map(dt => (
                                            <div
                                                key={dt}
                                                className={'tab' + (activeDocTab === dt ? ' active' : '')}
                                                title={DOC_DESCRIPTIONS[dt]}
                                                onClick={() => setActiveDocTab(dt)}
                                            >
                                                {dt}.md
                                            </div>
                                        ))}
                                    </div>
                                    <div className="editor">
                                        <textarea
                                            className="field-textarea"
                                            rows={24}
                                            spellCheck={false}
                                            value={docLoading ? t('common.loading') : docContent}
                                            onChange={e => setDocContent(e.target.value)}
                                            disabled={docLoading || !editing}
                                            style={{ borderRadius: 0, border: 'none', resize: 'vertical' }}
                                        />
                                    </div>
                                </div>

                            </div>
                        </>
                    )}
                </>
            )}

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
                <div className="modal-backdrop" style={{ zIndex: 200 }}>
                    <div className="modal-panel" style={{ padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: confirmDelete.gradient_start ?? 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isEmojiAvatar(confirmDelete) ? '20px' : '13px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                                {agentAvatarText(confirmDelete)}
                            </div>
                            <div>
                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{confirmDelete.display_name}</div>
                                {confirmDelete.is_default && (
                                    <div style={{ fontSize: '11px', color: 'var(--accent-hover)', marginTop: '2px' }}>{t('agents.leader')}</div>
                                )}
                            </div>
                        </div>
                        {confirmDelete.is_default ? (
                            <div style={{ background: 'var(--error-muted)', border: '1px solid var(--error-muted)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#fca5a5', lineHeight: 1.6 }}>
                                <strong style={{ color: 'var(--error)', display: 'block', marginBottom: '4px' }}>⚠️ {t('agents.delete_leader_warning_title')}</strong>
                                {t('agents.delete_leader_warning_body')}
                            </div>
                        ) : (
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                                {t('agents.delete_confirm')}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>{t('common.button_cancel')}</button>
                            <button className="btn" style={{ background: 'var(--error-muted)', color: 'var(--error)' }} onClick={() => handleDeleteAgent(confirmDelete)}>{t('agents.confirm_delete')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
