import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { chatWithAgent } from '../lib/api'
import { toast } from './Toast'
import type { AgentConfig } from '../lib/types'

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
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
            <div style={{ position: 'relative', width: '400px', height: '100%', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: agent.gradient_start ?? 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                        {agent.initials ?? agent.display_name.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{agent.display_name}</div>
                        <div style={{ fontSize: '11px', color: soulOverride ? 'var(--warning)' : 'var(--text-dimmer)' }}>{soulOverride ? '临时测试-智能体尚未保存' : '测试对话 · 基于 SOUL.md'}</div>
                    </div>
                    <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>{t('agents.clear_chat')}</button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dimmer)', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-dimmer)', fontSize: '12px', marginTop: '40px' }}>{t('agents.chat_empty', { name: agent.display_name })}</div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <div style={{
                                maxWidth: '85%', padding: '9px 12px', borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                                background: m.role === 'user' ? 'rgba(139,92,246,0.25)' : 'var(--bg-surface)',
                                color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ padding: '9px 14px', borderRadius: '12px 12px 12px 3px', background: 'var(--bg-surface)', color: 'var(--text-dimmer)', fontSize: '13px' }}>…</div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '8px' }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                        placeholder={t('agents.chat_placeholder')}
                        rows={2}
                        style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px', padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                        onClick={send}
                        disabled={!input.trim() || loading}
                        style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--accent)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, opacity: (!input.trim() || loading) ? 0.5 : 1, alignSelf: 'flex-end' }}
                    >{t('agents.send')}</button>
                </div>
            </div>
        </div>
    )
}
