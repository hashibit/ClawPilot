import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useOpc } from '../contexts/OpcContext'
import {
    getAgents, createAgent, updateAgent, deleteAgent, reorderAgents, setDefaultAgent,
    getAgentDocument, updateAgentDocument, aiGenerateAgent, aiGenerateAgents, batchCreateAgents, getModels,
    createSnapshot,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { AgentConfig, DocumentType, ModelInfo, OpcConfig } from '../lib/types'
import { ChatDrawer } from '../components/ChatDrawer'
import { AGENT_COLORS, slugify } from './agents/constants'

import { AgentStrip } from './agents/AgentStrip'
import { AgentToolbar } from './agents/AgentToolbar'
import { AgentBasicInfo } from './agents/AgentBasicInfo'
import { AgentModelTools } from './agents/AgentModelTools'
import { AgentSkills } from './agents/AgentSkills'
import { AgentGuardrails } from './agents/AgentGuardrails'
import { AgentPersonaDocs } from './agents/AgentPersonaDocs'
import { SkillModal } from './agents/SkillModal'
import { AiGenerateModal } from './agents/AiGenerateModal'
import { BatchModal } from './agents/BatchModal'
import { DeleteConfirmModal } from './agents/DeleteConfirmModal'

export default function AgentsPage() {
    const { t } = useTranslation()
    const { currentOpc, selectOpc } = useOpc()

    const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
    const [activeDocTab, setActiveDocTab] = useState<DocumentType>('SOUL')
    const [docContent, setDocContent] = useState('')
    const [docLoading, setDocLoading] = useState(false)
    const [form, setForm] = useState<Partial<AgentConfig>>({})
    const [editing, setEditing] = useState(false)
    const [isNewAgent, setIsNewAgent] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<AgentConfig | null>(null)
    const [saving, setSaving] = useState(false)
    const [aiModalOpen, setAiModalOpen] = useState(false)
    const [aiGenerating, setAiGenerating] = useState(false)
    const [batchModalOpen, setBatchModalOpen] = useState(false)
    const [models, setModels] = useState<ModelInfo[]>([])
    const [skillModalOpen, setSkillModalOpen] = useState(false)
    const [chatAgent, setChatAgent] = useState<AgentConfig | null>(null)
    const [chatSoulOverride, setChatSoulOverride] = useState<string | undefined>(undefined)
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

    const handleAiGenerate = async (prompt: string) => {
        if (!selectedAgent) return
        setAiGenerating(true)
        try {
            const result = await aiGenerateAgent(prompt)
            setAiModalOpen(false)
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
                SOUL: result.soul, IDENTITY: result.identity, AGENTS: result.agents,
                USER: result.user, MEMORY: result.memory, HEARTBEAT: result.heartbeat, TOOLS: result.tools,
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

    const handleBatchGenerate = async (prompts: string[]) => {
        const opc = currentOpc
        if (!opc) return
        await createSnapshot(opc.id, `auto:batch-add:${prompts.length}agents`, true).catch(() => {})

        const generated = await aiGenerateAgents(prompts)
        const allAgents = Object.values(opcAgentsMap).flat()
        const usedColors = new Set(allAgents.map(a => a.gradient_start))
        const now = Math.floor(Date.now() / 1000)

        const agents: AgentConfig[] = []
        const documents: Record<string, Record<string, string>> = {}

        generated.forEach((result, idx) => {
            const colorPick = AGENT_COLORS.find(c => !usedColors.has(c)) ?? AGENT_COLORS[(allAgents.length + idx) % AGENT_COLORS.length]
            usedColors.add(colorPick)
            const agentId = crypto.randomUUID()
            agents.push({
                id: agentId, opc_id: opc.id,
                name: slugify(result.name || prompts[idx]),
                display_name: result.display_name || prompts[idx].slice(0, 8),
                job_title: result.job_title, description: result.description, personality: result.personality,
                initials: (result.display_name || prompts[idx]).slice(0, 2),
                gradient_start: colorPick, gradient_end: colorPick,
                is_default: false, order_index: idx, model: undefined,
                enabled_tools: result.enabled_tools ?? [], disabled_tools: [],
                enabled_skills: result.enabled_skills ?? [],
                guardrail_rules: result.guardrail_allow ?? [],
                guardrail_allow: result.guardrail_allow ?? [],
                guardrail_deny: result.guardrail_deny ?? [],
                reports_to: [], manages: [],
                created_at: now, updated_at: now,
            })
            documents[agentId] = {
                SOUL: result.soul ?? '', IDENTITY: result.identity ?? '', AGENTS: result.agents ?? '',
                USER: result.user ?? '', MEMORY: result.memory ?? '', HEARTBEAT: result.heartbeat ?? '', TOOLS: result.tools ?? '',
            }
        })

        await batchCreateAgents(agents, documents)
        const list = await getAgents(opc.id)
        setOpcAgentsMap(prev => ({ ...prev, [opc.id]: list }))
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

    const handleSkillToggle = (slug: string) => {
        const enabledSkills = form.enabled_skills ?? []
        handleFormChange('enabled_skills',
            enabledSkills.includes(slug)
                ? enabledSkills.filter(s => s !== slug)
                : [...enabledSkills, slug]
        )
    }

    const handleChat = (agent: AgentConfig, soulOverride?: string) => {
        setChatSoulOverride(soulOverride)
        setChatAgent(agent)
    }

    const enabledSkills = form.enabled_skills ?? []

    return (
        <div className="agents-page">
            {aiModalOpen && (
                <AiGenerateModal
                    onClose={() => setAiModalOpen(false)}
                    onGenerate={handleAiGenerate}
                />
            )}

            {batchModalOpen && (
                <BatchModal
                    onClose={() => setBatchModalOpen(false)}
                    onGenerate={handleBatchGenerate}
                />
            )}

            {!currentOpc ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmer)', fontSize: '13px' }}>
                    {t('agents.select_company_hint')}
                </div>
            ) : (
                <>
                    <AgentStrip
                        agents={opcAgentsMap[currentOpc.id] ?? []}
                        selectedAgent={selectedAgent}
                        isNewAgent={isNewAgent}
                        editing={editing}
                        onSelect={handleSelectAgent}
                        onAdd={() => handleAddAgent()}
                        onBatchAdd={() => setBatchModalOpen(true)}
                    />

                    {!selectedAgent ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dimmer)', fontSize: '13px', minWidth: 0 }}>
                            {t('agents.select_agent_hint')}
                        </div>
                    ) : (
                        <div className="agent-detail-wrap">
                            <AgentToolbar
                                agent={selectedAgent}
                                editing={editing}
                                isNewAgent={isNewAgent}
                                saving={saving}
                                aiGenerating={aiGenerating}
                                docTab={activeDocTab}
                                docContent={docContent}
                                onEdit={() => setEditing(true)}
                                onCancelEdit={handleCancelEdit}
                                onSave={handleSaveAgent}
                                onAiGenerate={() => setAiModalOpen(true)}
                                onSetDefault={handleSetDefault}
                                onDelete={setConfirmDelete}
                                onChat={handleChat}
                            />
                            <div className="agent-detail">
                            <AgentBasicInfo form={form} editing={editing} onChange={handleFormChange} />
                            <AgentModelTools form={form} editing={editing} models={models} onChange={handleFormChange} />
                            <AgentSkills form={form} editing={editing} onChange={handleFormChange} onOpenSkillModal={() => setSkillModalOpen(true)} />
                            <AgentGuardrails form={form} editing={editing} onChange={handleFormChange} />
                            <AgentPersonaDocs
                                activeTab={activeDocTab}
                                docContent={docContent}
                                docLoading={docLoading}
                                editing={editing}
                                onTabChange={setActiveDocTab}
                                onContentChange={setDocContent}
                                onSave={handleSaveDoc}
                            />
                            </div>
                        </div>
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
                <DeleteConfirmModal
                    agent={confirmDelete}
                    onClose={() => setConfirmDelete(null)}
                    onConfirm={handleDeleteAgent}
                />
            )}
        </div>
    )
}
