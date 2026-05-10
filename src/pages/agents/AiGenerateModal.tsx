import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'

export function AiGenerateModal({ onClose, onGenerate }: {
    onClose: () => void
    onGenerate: (prompt: string) => Promise<void>
}) {
    const { t } = useTranslation()
    const [prompt, setPrompt] = useState('')
    const [generating, setGenerating] = useState(false)

    const handleGenerate = async () => {
        if (!prompt.trim()) return
        setGenerating(true)
        try {
            await onGenerate(prompt.trim())
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="modal-backdrop" onClick={() => { if (!generating) onClose() }}>
            <div className="modal-panel" style={{ padding: '24px', width: '480px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{t('agents.ai_quick_gen')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>{generating ? t('agents.generating') : t('agents.ai_generate_placeholder')}</div>
                </div>
                {generating ? (
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
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
                    />
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" disabled={generating} onClick={onClose}>{t('common.button_cancel')}</button>
                    <button className="btn btn-primary" disabled={generating || !prompt.trim()} onClick={handleGenerate}>{t('agents.ai_generate_btn')}</button>
                </div>
            </div>
        </div>
    )
}
