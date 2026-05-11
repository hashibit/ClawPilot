import { useEffect } from 'react'

/** Close a modal/dialog when Escape is pressed. */
export function useEscClose(isOpen: boolean, onClose: () => void) {
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, onClose])
}
