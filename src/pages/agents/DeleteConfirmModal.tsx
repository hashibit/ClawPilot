import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { agentAvatarText, isEmojiAvatar } from '../../lib/agent-avatar'
import { useEscClose } from '../../hooks/useEscClose'

export function DeleteConfirmModal({ agent, onClose, onConfirm }: {
    agent: AgentConfig
    onClose: () => void
    onConfirm: (agent: AgentConfig) => void
}) {
    const { t } = useTranslation()
    useEscClose(true, onClose)

    return (
        <div className="modal-backdrop" style={{ zIndex: 200 }}>
            <div className="modal-panel flex flex-col gap-16" style={{ padding: '24px', width: '360px' }}>
                <div className="flex-center gap-10">
                    <div
                        className="flex-center justify-center flex-shrink-0"
                        style={{ width: '36px', height: '36px', borderRadius: '10px', background: agent.gradient_start ?? 'var(--accent)', fontSize: isEmojiAvatar(agent) ? '20px' : '13px', fontWeight: 700, color: 'white' }}
                    >
                        {agentAvatarText(agent)}
                    </div>
                    <div>
                        <div className="text-title">{agent.display_name}</div>
                        {agent.is_default && (
                            <div className="text-xxs" style={{ color: 'var(--accent-hover)', marginTop: '2px' }}>{t('agents.leader')}</div>
                        )}
                    </div>
                </div>
                {agent.is_default ? (
                    <div className="confirm-block text-sm" style={{ lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--error)', display: 'block', marginBottom: '4px' }}>⚠️ {t('agents.delete_leader_warning_title')}</strong>
                        {t('agents.delete_leader_warning_body')}
                    </div>
                ) : (
                    <div className="text-sm muted" style={{ lineHeight: 1.6 }}>
                        {t('agents.delete_confirm')}
                    </div>
                )}
                <div className="flex justify-end gap-8">
                    <button className="btn btn-ghost" onClick={onClose}>{t('common.button_cancel')}</button>
                    <button className="btn" style={{ background: 'var(--error-muted)', color: 'var(--error)' }} onClick={() => onConfirm(agent)}>{t('agents.confirm_delete')}</button>
                </div>
            </div>
        </div>
    )
}
