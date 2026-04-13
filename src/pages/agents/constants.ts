import type { DocumentType } from '../../lib/types'

export const AGENT_COLORS: string[] = [
    '#8b5cf6', '#f97316', '#ec4899', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#14b8a6',
    '#f43f5e', '#eab308', '#06b6d4', '#84cc16', '#6366f1', '#e11d48', '#0ea5e9', '#d946ef',
    '#22c55e', '#fb923c', '#2dd4bf', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777',
    '#059669', '#b45309', '#0284c7', '#c026d3', '#16a34a', '#ea580c', '#0e7490', '#9333ea',
    '#be123c', '#4f46e5', '#0f766e', '#d97706', '#7e22ce', '#15803d', '#1d4ed8', '#9d174d',
    '#047857', '#c2410c', '#6d28d9', '#b91c1c', '#0369a1', '#4d7c0f', '#7c2d12', '#831843',
    '#14532d', '#1e3a5f', '#4a044e', '#422006', '#052e16', '#450a0a', '#1a1a2e', '#0d0221',
    '#1b0036', '#0a0a23', '#ff6b6b', '#48dbfb', '#54a0ff', '#1dd1a1', '#f368e0', '#feca57',
]

export const DOC_TYPES: DocumentType[] = ['SOUL', 'IDENTITY', 'AGENTS', 'USER', 'MEMORY', 'HEARTBEAT', 'TOOLS']

export function slugify(name: string): string {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '') || 'agent'
    return /^[a-z]/.test(slug) ? slug : `agent_${slug.replace(/^_+/, '')}`
}
