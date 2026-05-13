import { useTranslation } from 'react-i18next'
import type { AgentConfig } from '../../lib/types'

export function AgentBasicInfo({ form, editing, onChange }: {
    form: Partial<AgentConfig>
    editing: boolean
    onChange: (field: keyof AgentConfig, value: unknown) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="section-card">
            <div className="section-card-head">
                <div>
                    <h3 className="section-card-title">{t('agents.section_basic')}</h3>
                    <div className="section-card-sub">{t('agents.basic_info_desc', '名称、职位、简介')}</div>
                </div>
            </div>
            <div className="section-card-body has-rows">
                <div className="field-row">
                    <div className="field-label-cell"><div className="field-name">{t('agents.display_name')}</div></div>
                    <div className="field-value-cell">
                        {editing
                            ? <input type="text" className="input" value={form.display_name ?? ''} onChange={e => onChange('display_name', e.target.value)} />
                            : <div className="read-value">{form.display_name || '—'}</div>}
                    </div>
                </div>
                <div className="field-row">
                    <div className="field-label-cell"><div className="field-name">{t('agents.identifier')}</div></div>
                    <div className="field-value-cell">
                        {editing
                            ? <input type="text" className="input" style={{ fontFamily: "'SF Mono','Menlo',monospace" }} value={form.name ?? ''} onChange={e => onChange('name', e.target.value)} />
                            : <div className="read-value" style={{ fontFamily: "'SF Mono','Menlo',monospace" }}>{form.name || '—'}</div>}
                    </div>
                </div>
                <div className="field-row">
                    <div className="field-label-cell"><div className="field-name">{t('agents.job_title')}</div></div>
                    <div className="field-value-cell">
                        {editing
                            ? <input type="text" className="input" value={form.job_title ?? ''} onChange={e => onChange('job_title', e.target.value)} />
                            : <div className="read-value">{form.job_title || '—'}</div>}
                    </div>
                </div>
                <div className="field-row">
                    <div className="field-label-cell"><div className="field-name">{t('agents.description')}</div></div>
                    <div className="field-value-cell">
                        {editing
                            ? <textarea className="input" rows={2} style={{ resize: 'none', height: 'auto', padding: '8px 12px' }} value={form.description ?? ''} onChange={e => onChange('description', e.target.value)} />
                            : <div className="read-value">{form.description || '—'}</div>}
                    </div>
                </div>
            </div>
        </div>
    )
}
