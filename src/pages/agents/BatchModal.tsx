import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'

export type BatchStatus = 'idle' | 'generating' | 'done' | 'error'

export function BatchModal({ onClose, onGenerate }: {
    onClose: () => void
    onGenerate: (prompts: string[]) => Promise<void>
}) {
    const { t } = useTranslation()
    const [prompts, setPrompts] = useState<string[]>(['', ''])
    const [progress, setProgress] = useState<BatchStatus[]>([])
    const [running, setRunning] = useState(false)

    const handleGenerate = async () => {
        const valid = prompts.filter(p => p.trim())
        if (!valid.length) return
        setRunning(true)
        setProgress(prompts.map(p => p.trim() ? 'generating' : 'done'))
        try {
            await onGenerate(valid)
            setProgress(prompts.map(p => p.trim() ? 'done' : 'done'))
        } catch {
            setProgress(prev => prev.map(s => s === 'generating' ? 'error' : s))
        } finally {
            setRunning(false)
        }
    }

    const allFinished = progress.length > 0 && progress.every(s => s === 'done' || s === 'error') && !running

    return (
        <div className="modal-backdrop" onClick={() => { if (!running) onClose() }}>
            <div className="modal-panel" style={{ padding: '24px', width: '580px', maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
                <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>批量添加智能体</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-dimmer)' }}>每行描述一个智能体角色，AI 自动生成并立即保存</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {prompts.map((p, i) => {
                        const status = progress[i]
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-dimmer)', width: '16px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                                <input
                                    className="field-input"
                                    style={{ flex: 1 }}
                                    placeholder={`智能体 ${i + 1} 的角色描述…`}
                                    value={p}
                                    disabled={running}
                                    onChange={e => setPrompts(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                                    onKeyDown={e => { if (e.key === 'Enter' && i === prompts.length - 1 && !running) setPrompts(prev => [...prev, '']) }}
                                />
                                {status === 'generating' && <Icon name="loading" size={14} stroke="var(--accent-hover)" strokeWidth={2} spin />}
                                {status === 'done' && <span style={{ color: 'var(--success)', fontSize: '14px', flexShrink: 0 }}>✓</span>}
                                {status === 'error' && <span style={{ color: 'var(--error)', fontSize: '14px', flexShrink: 0 }}>✗</span>}
                                {!running && !status && (
                                    <button onClick={() => setPrompts(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                                )}
                            </div>
                        )
                    })}
                    {!running && (
                        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start', fontSize: '12px' }} onClick={() => setPrompts(prev => [...prev, ''])}>+ 添加一行</button>
                    )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" disabled={running} onClick={onClose}>{allFinished ? '关闭' : t('common.button_cancel')}</button>
                    {!allFinished && (
                        <button className="btn btn-primary" disabled={running || !prompts.some(p => p.trim())} onClick={handleGenerate}>
                            {running ? t('agents.generating') : '开始生成'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
