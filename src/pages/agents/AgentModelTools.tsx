import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentConfig, ModelInfo } from '../../lib/types'
import { Icon } from '../../components/Icon'

const AVAILABLE_TOOLS = [
    { id: 'web_search', key: 'agents.tool_web_search' },
    { id: 'web_reader', key: 'agents.tool_web_reader' },
    { id: 'feishu_message', key: 'agents.tool_feishu_message' },
    { id: 'code_interpreter', key: 'agents.tool_code_interpreter' },
    { id: 'file_reader', key: 'agents.tool_file_reader' },
    { id: 'image_gen', key: 'agents.tool_image_gen' },
    { id: 'image_analysis', key: 'agents.tool_image_analysis' },
    { id: 'http_request', key: 'agents.tool_http_request' },
    { id: 'asr', key: 'agents.tool_asr' },
    { id: 'tts', key: 'agents.tool_tts' },
]

export function AgentModelTools({ form, editing, models, onChange }: {
    form: Partial<AgentConfig>
    editing: boolean
    models: ModelInfo[]
    onChange: (field: keyof AgentConfig, value: unknown) => void
}) {
    const { t } = useTranslation()
    const [customToolInput, setCustomToolInput] = useState('')

    const tools = AVAILABLE_TOOLS.map(tool => ({ id: tool.id, name: t(tool.key) }))

    const selectedModel = form.model
        ?? (form.model_provider && form.model_name ? `${form.model_provider}/${form.model_name}` : '')
    const modelInList = models.some(m => `${m.provider_name}/${m.model_id}` === selectedModel)
    const hasCustomModel = Boolean(selectedModel && !modelInList)

    const modelsByProvider = models.reduce((acc, m) => {
        acc[m.provider_name] = acc[m.provider_name] ?? []
        acc[m.provider_name].push(m)
        return acc
    }, {} as Record<string, ModelInfo[]>)

    const enabledTools = form.enabled_tools ?? []
    const knownToolIds = new Set(tools.map(t => t.id))
    const customTools = enabledTools.filter(t => !knownToolIds.has(t))

    const toggleTool = (toolId: string) => {
        onChange('enabled_tools',
            enabledTools.includes(toolId)
                ? enabledTools.filter(t => t !== toolId)
                : [...enabledTools, toolId]
        )
    }

    return (
        <div className="section-card">
            <div className="section-card-head">
                <div>
                    <h3 className="section-card-title">{t('agents.section_model_tools')}</h3>
                </div>
            </div>
            <div className="section-card-body">
                <div className="field-row">
                    <div className="field-label-cell"><div className="field-name">{t('agents.model_label')}</div></div>
                    <div className="field-value-cell">
                        {editing ? (
                            <div className="flex-1" style={{ position: 'relative' }}>
                                <select
                                    className="input"
                                    style={{ width: '100%', paddingRight: '24px' }}
                                    value={selectedModel}
                                    onChange={e => onChange('model', e.target.value || undefined)}
                                >
                                    <option value="">{t('agents.model_none')}</option>
                                    {hasCustomModel && (
                                        <optgroup label={t('agents.model_stored')}>
                                            <option value={selectedModel}>{selectedModel} ({t('agents.model_stored')})</option>
                                        </optgroup>
                                    )}
                                    {Object.entries(modelsByProvider).map(([providerName, mlist]) => (
                                        <optgroup key={providerName} label={providerName}>
                                            {mlist.map(m => (
                                                <option key={m.id} value={`${m.provider_name}/${m.model_id}`}>{m.display_name || m.model_id}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <Icon name="chevron-down" size={10} stroke="var(--text-dimmer)" strokeWidth={2} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                            </div>
                        ) : (
                            <div className="read-value">{selectedModel || t('agents.model_none')}</div>
                        )}
                    </div>
                </div>

                <div className="section-title" style={{ padding: '5px 0 4px' }}>
                    {t('agents.tool_permissions')}
                    <span className="muted" style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{t('agents.tools_enabled_count', { count: enabledTools.length })}</span>
                </div>
                <div className="tools-grid">
                    {tools.map(tool => {
                        const active = enabledTools.includes(tool.id)
                        return (
                            <div
                                key={tool.id}
                                className={'tool-chip' + (active ? ' on' : '')}
                                onClick={() => editing && toggleTool(tool.id)}
                                style={{ opacity: editing ? 1 : 0.7, cursor: editing ? 'pointer' : 'default' }}
                            >
                                <div className="tool-chip-name">{tool.name}</div>
                            </div>
                        )
                    })}
                    {customTools.map(id => (
                        <div
                            key={id}
                            className="tool-chip on"
                            onClick={() => editing && toggleTool(id)}
                            style={{ opacity: editing ? 1 : 0.7, cursor: editing ? 'pointer' : 'default' }}
                        >
                            <div className="tool-chip-name">{id} <span style={{ opacity: 0.6 }}>×</span></div>
                        </div>
                    ))}
                    <input
                        value={customToolInput}
                        onChange={e => setCustomToolInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                const v = customToolInput.trim()
                                if (v && !enabledTools.includes(v)) {
                                    onChange('enabled_tools', [...enabledTools, v])
                                }
                                setCustomToolInput('')
                            }
                        }}
                        placeholder={t('agents.custom_tool_placeholder')}
                        disabled={!editing}
                        style={{ background: 'var(--border-subtle)', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', color: 'var(--text-secondary)', outline: 'none', width: '130px', opacity: editing ? 1 : 0.5 }}
                    />
                </div>
            </div>
        </div>
    )
}
