import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { getAgentDocument } from '../../lib/api'
import { toast } from '../../components/Toast'

export function AgentToolbar({ agent, editing, isNewAgent, saving, aiGenerating, docTab, docContent, onEdit, onCancelEdit, onSave, onAiGenerate, onSetDefault, onDelete, onChat }: {
    agent: AgentConfig
    editing: boolean
    isNewAgent: boolean
    saving: boolean
    aiGenerating: boolean
    docTab: string
    docContent: string
    onEdit: () => void
    onCancelEdit: () => void
    onSave: () => void
    onAiGenerate: () => void
    onSetDefault: (agent: AgentConfig) => void
    onDelete: (agent: AgentConfig) => void
    onChat: (agent: AgentConfig, soulOverride?: string) => void
}) {
    const { t } = useTranslation()
    const toolbarName = editing
        ? (agent.display_name || '')
        : (agent.display_name || '')

    return (
        <div className="agent-toolbar">
            <div className="agent-toolbar-name">
                {toolbarName}
                {agent.is_default && !isNewAgent && (
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
                    onClick={() => { if (!editing) onEdit(); onAiGenerate() }}
                >
                    <Icon name="bolt" size={11} strokeWidth={2.2} style={{ display: 'inline', marginRight: 4 }} />
                    {aiGenerating ? t('agents.generating') : t('agents.ai_quick_gen')}
                </button>
                <button
                    className="btn btn-sm"
                    onClick={async () => {
                        if (docTab === 'SOUL' && docContent.trim()) {
                            onChat(agent, docContent)
                        } else if (isNewAgent) {
                            toast(t('agents.save_first_warning'), 'error')
                        } else {
                            const soul = await getAgentDocument(agent.id, 'SOUL').catch(() => '')
                            if (!soul?.trim()) { toast(t('agents.soul_empty_warning'), 'error'); return }
                            onChat(agent)
                        }
                    }}
                >
                    <Icon name="message" size={13} />
                    {t('agents.test_chat')}
                </button>
                {!agent.is_default && !editing && (
                    <div className="tip">
                        <button className="btn btn-sm" onClick={() => onSetDefault(agent)}>
                            <Icon name="star" size={13} />
                            {t('agents.set_as_leader')}
                        </button>
                        <span className="tip-content">{t('agents.set_as_leader_tooltip')}</span>
                    </div>
                )}
                {editing ? (
                    <>
                        <button className="btn btn-sm" onClick={onCancelEdit}>{t('common.button_cancel')}</button>
                        <button className="btn btn-sm btn-primary" onClick={onSave} disabled={saving}>
                            <Icon name="check" size={13} />
                            {saving ? t('common.saving') : t('common.button_save')}
                        </button>
                    </>
                ) : (
                    <>
                        <button className="btn btn-sm btn-primary" onClick={onEdit}>
                            <Icon name="edit" size={13} />
                            {t('common.button_edit')}
                        </button>
                        <button className="btn btn-sm btn-danger btn-icon" onClick={() => onDelete(agent)} title={t('common.button_delete')}>
                            <Icon name="trash" size={13} />
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
