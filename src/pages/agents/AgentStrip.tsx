import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { agentAvatarText } from '../../lib/agent-avatar'
import { Icon } from '../../components/Icon'

export function AgentStrip({ agents, selectedAgent, isNewAgent, editing, onSelect, onAdd, onBatchAdd }: {
    agents: AgentConfig[]
    selectedAgent: AgentConfig | null
    isNewAgent: boolean
    editing: boolean
    onSelect: (agent: AgentConfig) => void
    onAdd: () => void
    onBatchAdd: () => void
}) {
    const { t } = useTranslation()

    const displayList = (() => {
        const base = [...agents].sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
        return isNewAgent && selectedAgent ? [...base, selectedAgent] : base
    })()

    return (
        <div className="agent-strip">
            {displayList.map(agent => {
                const isActive = selectedAgent?.id === agent.id
                const avatarText = agentAvatarText(agent)
                return (
                    <div
                        key={agent.id}
                        className={'agent-pill' + (isActive ? ' selected' : '') + (agent.is_default ? ' leader' : '')}
                        onClick={() => onSelect(agent)}
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

            {agents.length === 0 && !isNewAgent && (
                <div className="text-xxs muted text-center" style={{ padding: '16px 8px' }}>
                    还没有智能体
                </div>
            )}

            <div className="flex-1" />

            <div className="flex gap-6" style={{ padding: '8px 0 0', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="agent-pill flex-1" onClick={onAdd}>
                    <div className="agent-pill-add">
                        <Icon name="plus" size={14} stroke="var(--text-tertiary)" strokeWidth={2} />
                    </div>
                    <div className="agent-pill-name">{t('common.button_add', '添加')}</div>
                </div>
                <div className="agent-pill flex-1" onClick={onBatchAdd}>
                    <div className="agent-pill-add" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
                        <Icon name="bolt" size={14} stroke="var(--accent)" strokeWidth={2} />
                    </div>
                    <div className="agent-pill-name" style={{ color: 'var(--accent)' }}>批量</div>
                </div>
            </div>
        </div>
    )
}
