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
    const [focused, setFocused] = useState(false)
    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center',
            background: 'var(--bg-input)', border: `1px solid ${focused ? 'var(--border-focus)' : 'var(--border-default)'}`,
            boxShadow: focused ? '0 0 0 3px var(--accent-glow)' : 'none',
            borderRadius: '8px', padding: '6px 10px', minHeight: '36px',
            opacity: disabled ? 0.7 : 1, transition: 'border-color 0.15s, box-shadow 0.15s',
            width: '100%',
        }}>
            {tags.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(139,92,246,0.18)', color: 'var(--accent-hover)', fontSize: '12px', padding: '2px 8px', borderRadius: '5px' }}>
                    {tag}
                    {!disabled && <button onClick={() => onChange(tags.filter(t => t !== tag))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-hover)', padding: 0, lineHeight: 1, fontSize: '13px' }}>×</button>}
                </span>
            ))}
            {!disabled && <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => { setFocused(false); add() }}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
                    if (e.key === 'Backspace' && !input && tags.length > 0) onChange(tags.slice(0, -1))
                }}
                placeholder={tags.length === 0 ? placeholder : ''}
                style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '12px', minWidth: '120px', flex: 1 }}
            />}
        </div>
    )
}
