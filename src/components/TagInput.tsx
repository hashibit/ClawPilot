import { useState } from 'react'

interface TagInputProps {
    tags: string[]
    onChange: (tags: string[]) => void
    placeholder?: string
    disabled?: boolean
}

export function TagInput({ tags, onChange, placeholder, disabled }: TagInputProps) {
    const [input, setInput] = useState('')
    const add = () => {
        if (disabled) return
        const v = input.trim()
        if (v && !tags.includes(v)) onChange([...tags, v])
        setInput('')
    }
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px', padding: '6px 9px', minHeight: '36px', opacity: disabled ? 0.7 : 1 }}>
            {tags.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', fontSize: '12px', padding: '2px 8px', borderRadius: '5px' }}>
                    {tag}
                    {!disabled && <button onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', padding: 0, lineHeight: 1, fontSize: '13px' }}>×</button>}
                </span>
            ))}
            {!disabled && <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
                    if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
                }}
                onBlur={add}
                placeholder={tags.length === 0 ? placeholder : ''}
                style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.8)', fontSize: '12px', minWidth: '80px', flex: 1 }}
            />}
        </div>
    )
}
