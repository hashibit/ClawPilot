import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { chatWithAgent } from '../lib/api'
import { toast } from './Toast'
import type { AgentConfig } from '../lib/types'
import { agentAvatarText, isEmojiAvatar } from '../lib/agent-avatar'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface ChatDrawerProps {
    agent: AgentConfig
    onClose: () => void
    soulOverride?: string
}

export function ChatDrawer({ agent, onClose, soulOverride }: ChatDrawerProps) {
    const { t } = useTranslation()
    const [messages, setMessages] = useState<ChatMsg[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function send() {
        const text = input.trim()
        if (!text || loading) return
        const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
        setMessages(next)
        setInput('')
        setLoading(true)
        try {
            const { reply } = await chatWithAgent(agent.id, next, soulOverride)
            setMessages(prev => [...prev, { role: 'assistant', content: reply }])
        } catch (e: unknown) {
            toast(e instanceof Error ? e.message : t('agents.request_failed'), 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="chat-drawer-overlay flex justify-end" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
            <div onClick={onClose} className="chat-drawer-backdrop" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
            <div className="chat-drawer-panel flex-col" style={{ position: 'relative', width: '400px', height: '100%', background: 'var(--bg-elevated)', display: 'flex', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div className="chat-drawer-header flex-center gap-10" style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div
                        className="avatar flex-shrink-0"
                        style={{
                            width: '28px', height: '28px', borderRadius: '7px',
                            background: agent.gradient_start ?? 'var(--accent)',
                            fontSize: isEmojiAvatar(agent) ? '16px' : '10px',
                            fontWeight: 700, color: 'var(--text-primary)',
                        }}
                    >
                        {agentAvatarText(agent)}
                    </div>
                    <div className="flex-1 flex-col gap-2" style={{ display: 'flex' }}>
                        <div className="text-sm" style={{ fontWeight: 600 }}>{agent.display_name}</div>
                        <div className="text-xxs" style={{ color: soulOverride ? 'var(--warning)' : 'var(--text-dimmer)' }}>
                            {soulOverride ? '临时测试-智能体尚未保存' : '测试对话 · 基于 SOUL.md'}
                        </div>
                    </div>
                    <button onClick={() => setMessages([])} className="btn-ghost text-xxs text-dimmer" style={{ padding: '4px 8px', borderRadius: '5px' }}>{t('agents.clear_chat')}</button>
                    <button onClick={onClose} className="btn-ghost text-dimmer" style={{ fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
                </div>

                {/* Messages */}
                <div className="flex-1 flex-col gap-10" style={{ overflowY: 'auto', padding: '12px 14px', display: 'flex' }}>
                    {messages.length === 0 && (
                        <div className="text-center text-xs text-dimmer" style={{ marginTop: '40px' }}>{t('agents.chat_empty', { name: agent.display_name })}</div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <div
                                className="text-sm"
                                style={{
                                    maxWidth: '85%', padding: '9px 12px',
                                    borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                                    background: m.role === 'user' ? 'rgba(139,92,246,0.25)' : 'var(--bg-surface)',
                                    color: 'var(--text-primary)', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}
                            >
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex" style={{ justifyContent: 'flex-start' }}>
                            <div className="text-sm text-dimmer" style={{ padding: '9px 14px', borderRadius: '12px 12px 12px 3px', background: 'var(--bg-surface)' }}>…</div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="flex-center gap-8" style={{ padding: '12px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                        placeholder={t('agents.chat_placeholder')}
                        rows={2}
                        className="field-input flex-1 text-xs"
                        style={{ height: 'auto', padding: '8px 10px', resize: 'none', borderRadius: '8px' }}
                    />
                    <button
                        onClick={send}
                        disabled={!input.trim() || loading}
                        className="btn btn-primary text-xs"
                        style={{ padding: '8px 14px', borderRadius: '8px', opacity: (!input.trim() || loading) ? 0.5 : 1, alignSelf: 'flex-end', height: 'auto' }}
                    >{t('agents.send')}</button>
                </div>
            </div>
        </div>
    )
}
