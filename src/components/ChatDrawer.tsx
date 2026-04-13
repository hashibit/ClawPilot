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
            <div style={{ position: 'relative', width: '400px', height: '100%', background: '#1C1C1E', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: agent.gradient_start ?? '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {agent.initials ?? agent.display_name.slice(0, 2)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{agent.display_name}</div>
                        <div style={{ fontSize: '11px', color: soulOverride ? '#f59e0b' : '#8E8E93' }}>{soulOverride ? '临时测试-智能体尚未保存' : '测试对话 · 基于 SOUL.md'}</div>
                    </div>
                    <button onClick={() => setMessages([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>{t('agents.clear_chat')}</button>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8E8E93', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}>×</button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {messages.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#636366', fontSize: '12px', marginTop: '40px' }}>{t('agents.chat_empty', { name: agent.display_name })}</div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            <div style={{
                                maxWidth: '85%', padding: '9px 12px', borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                                background: m.role === 'user' ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.07)',
                                color: '#EBEBF5', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ padding: '9px 14px', borderRadius: '12px 12px 12px 3px', background: 'rgba(255,255,255,0.07)', color: '#8E8E93', fontSize: '13px' }}>…</div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '8px' }}>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                        placeholder={t('agents.chat_placeholder')}
                        rows={2}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', color: '#EBEBF5', fontSize: '12px', padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                        onClick={send}
                        disabled={!input.trim() || loading}
                        style={{ padding: '8px 14px', borderRadius: '8px', background: '#8b5cf6', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, opacity: (!input.trim() || loading) ? 0.5 : 1, alignSelf: 'flex-end' }}
                    >{t('agents.send')}</button>
                </div>
            </div>
        </div>
    )
}
