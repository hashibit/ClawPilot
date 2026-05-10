import { useTranslation } from 'react-i18next'
import type { DocumentType } from '../../lib/types'
import { DOC_TYPES } from './constants'

const DOC_DESCRIPTION_KEYS: Record<DocumentType, string> = {
    SOUL: 'agents.doc_soul',
    IDENTITY: 'agents.doc_identity',
    AGENTS: 'agents.doc_agents',
    USER: 'agents.doc_user',
    MEMORY: 'agents.doc_memory',
    HEARTBEAT: 'agents.doc_heartbeat',
    TOOLS: 'agents.doc_tools',
}

export function AgentPersonaDocs({ activeTab, docContent, docLoading, editing, onTabChange, onContentChange, onSave }: {
    activeTab: DocumentType
    docContent: string
    docLoading: boolean
    editing: boolean
    onTabChange: (tab: DocumentType) => void
    onContentChange: (content: string) => void
    onSave: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="section-card-head" style={{ padding: '14px 16px 12px' }}>
                <div>
                    <h3 className="section-card-title">{t('agents.section_persona')}</h3>
                </div>
                {editing && (
                    <button className="btn btn-sm btn-primary" onClick={onSave} disabled={docLoading}>
                        {t('agents.save_doc')}
                    </button>
                )}
            </div>
            <div className="tabs" style={{ display: 'flex', gap: 2, padding: '0 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                {DOC_TYPES.map(dt => (
                    <div
                        key={dt}
                        className={'tab' + (activeTab === dt ? ' active' : '')}
                        title={t(DOC_DESCRIPTION_KEYS[dt])}
                        onClick={() => onTabChange(dt)}
                    >
                        {dt}.md
                    </div>
                ))}
            </div>
            <div className="editor">
                <textarea
                    className="field-textarea"
                    rows={24}
                    spellCheck={false}
                    value={docLoading ? t('common.loading') : docContent}
                    onChange={e => onContentChange(e.target.value)}
                    disabled={docLoading || !editing}
                    style={{ borderRadius: 0, border: 'none', resize: 'vertical' }}
                />
            </div>
        </div>
    )
}
