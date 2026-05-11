import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import { useEscClose } from '../../hooks/useEscClose'

export type BatchStatus = 'idle' | 'generating' | 'done' | 'error'

export function BatchModal({ onClose, onGenerate }: {
    onClose: () => void
    onGenerate: (prompts: string[]) => Promise<void>
}) {
    const { t } = useTranslation()
    useEscClose(true, onClose)
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
            <div className="modal-panel modal-lg flex flex-col gap-16" style={{ padding: '24px', maxWidth: '90vw', maxHeight: '70vh' }} onClick={e => e.stopPropagation()}>
                <div>
                    <div className="text-title" style={{ marginBottom: '4px' }}>批量添加智能体</div>
                    <div className="text-xs text-dimmer">每行描述一个智能体角色，AI 自动生成并立即保存</div>
                </div>
                <div className="flex-1 flex flex-col gap-8" style={{ overflowY: 'auto' }}>
                    {prompts.map((p, i) => {
                        const status = progress[i]
                        return (
                            <div key={i} className="flex-center gap-8">
                                <span className="text-xxs text-dimmer flex-shrink-0" style={{ width: '16px', textAlign: 'right' }}>{i + 1}</span>
                                <input
                                    className="field-input flex-1"
                                    placeholder={`智能体 ${i + 1} 的角色描述…`}
                                    value={p}
                                    disabled={running}
                                    onChange={e => setPrompts(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                                    onKeyDown={e => { if (e.key === 'Enter' && i === prompts.length - 1 && !running) setPrompts(prev => [...prev, '']) }}
                                />
                                {status === 'generating' && <Icon name="loading" size={14} stroke="var(--accent-hover)" strokeWidth={2} spin />}
                                {status === 'done' && <span className="flex-shrink-0" style={{ color: 'var(--success)', fontSize: '14px' }}>✓</span>}
                                {status === 'error' && <span className="flex-shrink-0" style={{ color: 'var(--error)', fontSize: '14px' }}>✗</span>}
                                {!running && !status && (
                                    <button onClick={() => setPrompts(prev => prev.filter((_, j) => j !== i))} className="flex-shrink-0 muted" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>×</button>
                                )}
                            </div>
                        )
                    })}
                    {!running && (
                        <button className="btn btn-ghost text-xs" style={{ alignSelf: 'flex-start' }} onClick={() => setPrompts(prev => [...prev, ''])}>+ 添加一行</button>
                    )}
                </div>
                <div className="flex justify-end gap-8">
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
