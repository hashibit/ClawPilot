import { useState, useCallback, useEffect } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

let _addToast: ((msg: string, kind: ToastKind) => void) | null = null

export function toast(message: string, kind: ToastKind = 'info') {
  _addToast?.(message, kind)
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])
  let counter = 0

  const add = useCallback((message: string, kind: ToastKind) => {
    const id = ++counter
    setItems(prev => [...prev, { id, message, kind }])
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  useEffect(() => {
    _addToast = add
    return () => { _addToast = null }
  }, [add])

  if (!items.length) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999,
    }}>
      {items.map(t => (
        <div key={t.id} style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: t.kind === 'success' ? 'rgba(52,199,89,0.15)'
            : t.kind === 'error' ? 'rgba(244,63,94,0.15)'
            : 'rgba(255,255,255,0.1)',
          color: t.kind === 'success' ? '#34c759'
            : t.kind === 'error' ? '#f43f5e'
            : '#ebebf5',
          border: `1px solid ${
            t.kind === 'success' ? 'rgba(52,199,89,0.3)'
            : t.kind === 'error' ? 'rgba(244,63,94,0.3)'
            : 'rgba(255,255,255,0.12)'
          }`,
          backdropFilter: 'blur(8px)',
          maxWidth: 320,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
