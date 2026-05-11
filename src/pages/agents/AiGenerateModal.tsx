import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import { useEscClose } from '../../hooks/useEscClose'

export function AiGenerateModal({ onClose, onGenerate }: {
    onClose: () => void
    onGenerate: (prompt: string) => Promise<void>
}) {
    const { t } = useTranslation()
    useEscClose(true, onClose)
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
            <div className="modal-panel flex flex-col gap-16" style={{ padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                <div>
                    <div className="text-title" style={{ marginBottom: '4px' }}>{t('agents.ai_quick_gen')}</div>
                    <div className="text-xs text-dimmer">{generating ? t('agents.generating') : t('agents.ai_generate_placeholder')}</div>
                </div>
                {generating ? (
                    <div className="flex-center justify-center gap-10 text-sm" style={{ padding: '20px 0', color: 'var(--accent-hover)' }}>
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
                <div className="flex justify-end gap-8">
                    <button className="btn btn-ghost" disabled={generating} onClick={onClose}>{t('common.button_cancel')}</button>
                    <button className="btn btn-primary" disabled={generating || !prompt.trim()} onClick={handleGenerate}>{t('agents.ai_generate_btn')}</button>
                </div>
            </div>
        </div>
    )
}
