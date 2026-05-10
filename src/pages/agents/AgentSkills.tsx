import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { Icon } from '../../components/Icon'

interface BundleSkillMeta { slug: string; name: string; display_name: string; description?: string; icon?: string; category?: string }
interface BundleSkillsMetadata { skills?: BundleSkillMeta[] }
declare global { interface Window { __BUNDLE_SKILLS_METADATA?: BundleSkillsMetadata } }

export function AgentSkills({ form, editing, onChange, onOpenSkillModal }: {
    form: Partial<AgentConfig>
    editing: boolean
    onChange: (field: keyof AgentConfig, value: unknown) => void
    onOpenSkillModal: () => void
}) {
    const { t } = useTranslation()

    const SKILL_REGISTRY = window.__BUNDLE_SKILLS_METADATA?.skills?.map((s) => ({
        slug: s.slug,
        name: s.display_name,
        icon: s.icon || '🔧',
        desc: s.description,
        tag: s.category === 'core' ? t('agents.tag_core') : t('agents.tag_integration'),
    })) ?? [
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

    const enabledSkills = form.enabled_skills ?? []

    return (
        <div className="section-card">
            <div className="section-card-head">
                <div>
                    <h3 className="section-card-title">{t('agents.section_skills')}</h3>
                    <div className="section-card-sub">{t('agents.skills_count', { count: enabledSkills.length })}</div>
                </div>
                {editing && (
                    <button className="btn btn-sm btn-ghost" onClick={onOpenSkillModal}>
                        <Icon name="plus" size={10} strokeWidth={1.75} style={{ display: 'inline', marginRight: 3 }} />
                        {t('common.button_add')}
                    </button>
                )}
            </div>
            <div className="section-card-body">
                <div className="skill-list">
                    {enabledSkills.length === 0 && (
                        <div className="text-xs text-dimmer">{t('agents.no_skills')}</div>
                    )}
                    {enabledSkills.map(slug => {
                        const skill = SKILL_REGISTRY.find((s: { slug: string }) => s.slug === slug)
                        return (
                            <div key={slug} className="skill-card">
                                <span className="flex-shrink-0" style={{ fontSize: '14px' }}>{skill?.icon ?? '🔌'}</span>
                                <div className="flex-grow">
                                    <div className="text-xs" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{skill?.name ?? slug}</div>
                                    {skill && <div className="text-xxs muted" style={{ marginTop: 1 }}>{skill.desc}</div>}
                                </div>
                                {editing && (
                                    <button
                                        onClick={() => onChange('enabled_skills', enabledSkills.filter(s => s !== slug))}
                                        className="flex-center justify-center flex-shrink-0 muted"
                                        style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--border-subtle)', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}
                                    >×</button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
