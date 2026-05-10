import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'
import { agentAvatarText, isEmojiAvatar } from '../../lib/agent-avatar'

export function DeleteConfirmModal({ agent, onClose, onConfirm }: {
    agent: AgentConfig
    onClose: () => void
    onConfirm: (agent: AgentConfig) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="modal-backdrop" style={{ zIndex: 200 }}>
            <div className="modal-panel" style={{ padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: agent.gradient_start ?? 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isEmojiAvatar(agent) ? '20px' : '13px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {agentAvatarText(agent)}
                    </div>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.display_name}</div>
                        {agent.is_default && (
                            <div style={{ fontSize: '11px', color: 'var(--accent-hover)', marginTop: '2px' }}>{t('agents.leader')}</div>
                        )}
                    </div>
                </div>
                {agent.is_default ? (
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
                    <button className="btn btn-ghost" onClick={onClose}>{t('common.button_cancel')}</button>
                    <button className="btn" style={{ background: 'var(--error-muted)', color: 'var(--error)' }} onClick={() => onConfirm(agent)}>{t('agents.confirm_delete')}</button>
                </div>
            </div>
        </div>
    )
}
