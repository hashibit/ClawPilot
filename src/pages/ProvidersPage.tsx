import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApi } from '../hooks/useApi'
import {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getModels,
  setModels as apiSetModels,
  suggestProvider,
  getKnownProviders,
  testProvider,
} from '../lib/api'
import { toast } from '../components/Toast'
import type { ProviderConfig, ModelInfo, ProviderApi, KnownProvider } from '../lib/types'

function maskKey(key?: string, notSetLabel = '---'): string {
  if (!key) return notSetLabel
  if (key.length <= 8) return '****'
  return key.slice(0, 6) + '****' + key.slice(-4)
}

const API_LABELS: Record<ProviderApi, string> = {
  'openai-completions': 'OpenAI',
  'anthropic-messages': 'Anthropic',
  'gemini': 'Gemini',
}

const API_BADGE_COLORS: Record<ProviderApi, { bg: string; color: string }> = {
  'openai-completions': { bg: 'rgba(52,199,89,0.15)', color: '#34c759' },
  'anthropic-messages': { bg: 'rgba(249,115,22,0.15)', color: '#f97316' },
  'gemini': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
}

const API_AVATAR_GRADIENTS: Record<ProviderApi, string> = {
  'openai-completions': '#10b981',
  'anthropic-messages': '#f97316',
  'gemini': '#3b82f6',
}

function ApiBadge({ api }: { api: ProviderApi }) {
  const colors = API_BADGE_COLORS[api] ?? { bg: 'var(--border-subtle)', color: 'var(--text-dimmer)' }
  return (
    <span className="status-badge" style={{ background: colors.bg, color: colors.color }}>
      {API_LABELS[api] ?? api}
    </span>
  )
}

// ── Model Table ────────────────────────────────────────────

function ModelTable({ models, providerName, providerBaseUrl, knownProviders, onReset,
  editMode, onToggleEdit, onSaveModels, onAddModel, onDeleteModel, onUpdateModel }: {
  models: ModelInfo[]
  providerName: string
  providerBaseUrl: string
  knownProviders: KnownProvider[]
  onReset: () => void
  editMode?: boolean
  onToggleEdit?: () => void
  onSaveModels?: () => void
  onAddModel?: () => void
  onDeleteModel?: (id: string) => void
  onUpdateModel?: (id: string, field: keyof ModelInfo, value: string | number | boolean) => void
}) {
  const { t } = useTranslation()
  const knownByName = knownProviders.find(p => p.suggest_name === providerName)
  const knownByUrl = !knownByName && models.length === 0
    ? knownProviders.find(p => p.match_urls && p.match_urls.some(u => providerBaseUrl.includes(u)))
    : null
  const known = knownByName ?? knownByUrl

  return (
    <div>
      <div className="flex-between mb-4">
        <span className="text-xs text-bold text-dimmer">
          {t('providers.available_models')} ({models.length})
        </span>
        <div className="flex-center gap-6">
          {editMode ? (
            <>
              <button className="btn btn-sm btn-ghost" onClick={onAddModel}>
                + {t('providers.button_add_model')}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={onToggleEdit}>
                {t('common.button_cancel')}
              </button>
              <button className="btn btn-sm btn-primary" onClick={onSaveModels}>
                {t('common.button_save')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-ghost" onClick={onToggleEdit}>
                {t('common.button_edit')}
              </button>
              {known && models.length > 0 && (
                <button className="btn btn-sm btn-ghost" onClick={onReset}>
                  {t('providers.button_reset_models')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {models.length === 0 && known ? (
        <div className="flex-between" style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
          <span className="text-xs text-dimmer">
            {t('providers.inferred_provider', { name: known.suggest_name, count: known.models.length })}
          </span>
          <button className="btn btn-sm btn-ghost flex-shrink-0" onClick={onReset}>
            {t('providers.button_apply_recommended')}
          </button>
        </div>
      ) : models.length === 0 ? (
        <div className="text-xs text-dimmer text-center" style={{ padding: '12px 0' }}>
          {t('providers.no_models')}
        </div>
      ) : (
        <div className="group">
          <table>
            <thead>
              <tr>
                <th>model_id</th>
                <th>{t('providers.col_model')}</th>
                <th>{t('providers.col_context')}</th>
                <th>input_types</th>
                <th>vision</th>
                {editMode && <th style={{ width: '60px' }}>{t('providers.col_actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {models.map((m, index) => {
                const isNew = m.id?.startsWith('new_')
                return (
                  <tr key={m.id}>
                    {editMode ? (
                      <>
                        <td className="mono-xs">
                          <input
                            type="text"
                            value={m.model_id}
                            onChange={(e) => onUpdateModel?.(m.id, 'model_id', e.target.value)}
                            className="field-input mono-xs"
                          />
                        </td>
                        <td className="text-xs">
                          <input
                            type="text"
                            value={m.display_name}
                            onChange={(e) => onUpdateModel?.(m.id, 'display_name', e.target.value)}
                            className="field-input"
                          />
                          {isNew && <span className="unsaved-tag" style={{ marginLeft: '4px' }}>[{t('common.status_unsaved')}]</span>}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={m.context_window}
                            onChange={(e) => onUpdateModel?.(m.id, 'context_window', parseInt(e.target.value) || 0)}
                            className="field-input"
                            style={{ width: '80px' }}
                          />
                        </td>
                        <td className="mono-xs text-dimmer">
                          <select
                            value={m.input_types}
                            onChange={(e) => onUpdateModel?.(m.id, 'input_types', e.target.value)}
                            className="field-input mono-xs"
                          >
                            <option value='["text"]'>text</option>
                            <option value='["text","image"]'>text+image</option>
                          </select>
                        </td>
                        <td>
                          <label className="flex-center gap-4" style={{ cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={m.supports_vision}
                              onChange={(e) => onUpdateModel?.(m.id, 'supports_vision', e.target.checked)}
                              style={{ accentColor: 'var(--accent)' }}
                            />
                          </label>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => onDeleteModel?.(m.id)}>
                            {t('common.button_delete')}
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono-xs">{m.model_id}</td>
                        <td className="text-xs">{m.display_name}{isNew && <span className="unsaved-tag" style={{ marginLeft: '4px' }}>[{t('common.status_unsaved')}]</span>}</td>
                        <td>{m.context_window >= 1000000 ? `${(m.context_window / 1000000).toFixed(0)}M` : m.context_window >= 1000 ? `${Math.round(m.context_window / 1000)}K` : m.context_window}</td>
                        <td className="mono-xs text-dimmer">{m.input_types}</td>
                        <td>
                          {m.supports_vision
                            ? <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{t('providers.cap_vision')}</span>
                            : <span className="text-dimmer">-</span>}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────

export default function ProvidersPage() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [knownProviders, setKnownProviders] = useState<KnownProvider[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [editMode, setEditMode] = useState<'none' | 'create' | 'edit'>('none')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [formTestPassed, setFormTestPassed] = useState<boolean | null>(null)

  // Model edit state
  const [modelEditMode, setModelEditMode] = useState(false)
  const [editingModels, setEditingModels] = useState<ModelInfo[]>([])

  // Form state (shared between create and edit)
  const [formName, setFormName] = useState('')
  const [formApi, setFormApi] = useState<ProviderApi>('openai-completions')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [pendingModels, setPendingModels] = useState<Partial<ModelInfo>[]>([])
  const [nameTouched, setNameTouched] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  const { reload: reloadProviders } = useApi(
    () => Promise.all([getProviders(), getKnownProviders()]),
    [],
    {
      onSuccess: ([provs, known]) => {
        setProviders(provs)
        setKnownProviders(known)
        setSelectedId(prev => prev ?? provs[0]?.id ?? null)
      },
      onError: (e) => toast(e.message, 'error'),
    }
  )

  const loadModels = async (providerName: string) => {
    try {
      const mods = await getModels(providerName)
      setModels(mods)
    } catch (e) {
      toast(String(e), 'error')
    }
  }


  const selectedProvider = providers.find(p => p.id === selectedId) ?? null

  useEffect(() => {
    if (selectedProvider) {
      loadModels(selectedProvider.name)
    } else {
      setModels([])
    }
  }, [selectedId, selectedProvider?.name])

  // Auto-suggest on baseUrl change (debounced) — only in create mode
  useEffect(() => {
    if (editMode !== 'create') return
    if (!formBaseUrl.trim()) return
    const timer = setTimeout(async () => {
      setSuggesting(true)
      try {
        const result = await suggestProvider(formBaseUrl)
        if (result) {
          if (!nameTouched) setFormName(result.name)
          setFormApi(result.api)
          setPendingModels(result.models)
        }
      } catch {
        // ignore
      } finally {
        setSuggesting(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [formBaseUrl, editMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = formName.trim() && formApi && formBaseUrl.trim() && !suggesting
  const canTest = editMode !== 'none'
    ? !!(formBaseUrl.trim() && formApi)
    : !!(selectedProvider?.base_url && selectedProvider?.api)

  const handleSelectProvider = (id: string) => {
    if (editMode !== 'none') {
      if (!window.confirm(t('providers.unsaved_changes_confirm'))) return
    }
    setSelectedId(id)
    setEditMode('none')
    setConfirmDelete(null)
  }

  const handleAddProvider = () => {
    setSelectedId(null)
    setFormName('')
    setFormApi('openai-completions')
    setFormBaseUrl('')
    setFormApiKey('')
    setPendingModels([])
    setNameTouched(false)
    setFormTestPassed(null)
    setEditMode('create')
  }

  const handleEditProvider = () => {
    if (!selectedProvider) return
    setFormName(selectedProvider.name)
    setFormApi(selectedProvider.api)
    setFormBaseUrl(selectedProvider.base_url)
    setFormApiKey(selectedProvider.api_key ?? '')
    setPendingModels([])
    setNameTouched(true)
    setFormTestPassed(null)
    setEditMode('edit')
  }

  const handleCancel = () => {
    setFormTestPassed(null)
    setEditMode('none')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let saved: ProviderConfig
      const n = Math.floor(Date.now() / 1000)
      if (editMode === 'create') {
        saved = await createProvider({
          name: formName,
          api: formApi,
          base_url: formBaseUrl,
          api_key: formApiKey,
          is_enabled: true,
          is_available: formTestPassed === true,
          last_tested: formTestPassed !== null ? Math.floor(Date.now() / 1000) : undefined,
        })
      } else {
        saved = await updateProvider({
          id: selectedProvider!.id,
          name: formName,
          api: formApi,
          base_url: formBaseUrl,
          api_key: formApiKey,
          is_enabled: selectedProvider!.is_enabled,
        })
      }
      if (pendingModels.length > 0) {
        await apiSetModels(saved.name, pendingModels)
      }
      await reloadProviders()
      setSelectedId(saved.id)
      setEditMode('none')
      toast(t('providers.saved'), 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    try {
      await deleteProvider(id)
      await reloadProviders()
      if (selectedId === id) {
        setSelectedId(null)
        setEditMode('none')
      }
      setConfirmDelete(null)
      toast(t('providers.deleted'), 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleResetModels = async () => {
    if (!selectedProvider) return
    // 先尝试按名称匹配，再尝试按 URL 匹配
    let known = knownProviders.find(p => p.suggest_name === selectedProvider.name)
    if (!known) {
      known = knownProviders.find(p => p.match_urls && p.match_urls.some(u => selectedProvider.base_url.includes(u)))
    }
    if (!known) return
    try {
      await apiSetModels(selectedProvider.name, known.models)
      await loadModels(selectedProvider.name)
      toast(t('providers.models_reset'), 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  // Model edit handlers
  const handleToggleModelEdit = () => {
    if (modelEditMode) {
      // Cancel - restore from original models
      setEditingModels([])
      setModelEditMode(false)
    } else {
      // Start editing - copy current models
      setEditingModels([...models])
      setModelEditMode(true)
    }
  }

  const handleAddModel = () => {
    const newModel: ModelInfo = {
      id: `new_${Date.now()}`,
      provider_name: selectedProvider?.name || '',
      model_id: '',
      display_name: '',
      context_window: 0,
      max_tokens: 0,
      input_types: '["text"]',
      cost_input: 0,
      cost_output: 0,
      supports_vision: false,
      supports_function_calling: false,
      supports_streaming: true,
      is_custom: true,
      sort_order: editingModels.length,
      updated_at: Math.floor(Date.now() / 1000),
    }
    setEditingModels([...editingModels, newModel])
  }

  const handleDeleteModel = (id: string) => {
    setEditingModels(editingModels.filter(m => m.id !== id))
  }

  const handleUpdateModel = (id: string, field: keyof ModelInfo, value: string | number | boolean) => {
    setEditingModels(editingModels.map(m => m.id === id ? { ...m, [field]: value } : m))
  }

  const handleSaveModels = async () => {
    if (!selectedProvider) return
    try {
      await apiSetModels(selectedProvider.name, editingModels)
      await loadModels(selectedProvider.name)
      setEditingModels([])
      setModelEditMode(false)
      toast(t('providers.models_saved'), 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleTestConnection = async () => {
    if (!canTest) return
    setTesting(true)
    const baseUrl = editMode !== 'none' ? formBaseUrl : selectedProvider!.base_url
    const apiKey = editMode !== 'none' ? formApiKey : (selectedProvider!.api_key ?? '')
    const api = editMode !== 'none' ? formApi : selectedProvider!.api
    const providerId = editMode === 'none' ? selectedProvider!.id : undefined
    try {
      const result = await testProvider(baseUrl, apiKey, api, providerId)
      if (result.ok) {
        toast(t('providers.connect_success_msg', { latency: result.latency_ms != null ? `（${result.latency_ms}ms）` : '' }), 'success')
      } else {
        toast(t('providers.connect_failed_msg', { error: result.error ?? t('common.unknown_error') }), 'error')
      }
      if (editMode !== 'none') setFormTestPassed(result.ok)
      if (providerId) await reloadProviders()
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      {/* ── Left: Provider List ───────────────────────────── */}
      <div className="list-pane">
        <div className="list-scroll">
          {providers.length === 0 && (
            <div className="text-xs text-dimmer text-center" style={{ padding: '12px' }}>
              {t('providers.no_providers')}
            </div>
          )}
          {providers.map(p => {
            const gradient = API_AVATAR_GRADIENTS[p.api] ?? 'linear-gradient(135deg,#8b5cf6,#06b6d4)'
            const initials = p.name.slice(0, 2).toUpperCase()
            return (
              <div
                key={p.id}
                className={`list-row${selectedId === p.id ? ' selected' : ''}`}
                onClick={() => handleSelectProvider(p.id)}
              >
                <div className="list-row-avatar" style={{ background: gradient, color: 'white' }}>
                  {initials}
                </div>
                <div className="list-row-info">
                  <div className="flex-center items-baseline gap-5">
                    <span className="list-row-title">{p.name}</span>
                    {editMode === 'edit' && selectedId === p.id && (
                      <span className="unsaved-tag">[{t('common.status_unsaved')}]</span>
                    )}
                  </div>
                  <div className="list-row-meta">
                    <ApiBadge api={p.api} />
                    <span
                      className="status-badge"
                      style={{
                        background: p.is_available ? 'var(--success-muted)' : (p.is_enabled ? (p.last_tested ? 'var(--error-muted)' : 'var(--border-subtle)') : 'var(--border-subtle)'),
                        color: p.is_available ? 'var(--success)' : (p.is_enabled ? (p.last_tested ? 'var(--error)' : 'var(--text-dimmer)') : 'var(--text-dimmer)'),
                      }}
                    >
                      {p.is_available ? t('providers.status_connected') : (p.is_enabled ? (p.last_tested ? t('providers.status_failed') : t('providers.status_untested')) : t('providers.status_disabled'))}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="pane-footer">
          <button
            className="btn btn-sm btn-ghost justify-center"
            style={{ width: '100%', color: editMode === 'create' ? 'var(--warning)' : undefined }}
            onClick={handleAddProvider}
          >
            + {t('common.button_add')}{editMode === 'create' && <span className="unsaved-tag" style={{ marginLeft: '4px' }}>{t('common.status_unsaved')}</span>}
          </button>
        </div>
      </div>

      {/* ── Right: Detail / Form ─────────────────────────── */}
      <main className="detail-pane">
        {/* Toolbar */}
        <div data-tauri-drag-region className="toolbar flex-between">
          <div className="flex-center gap-8">
            {editMode === 'none' && selectedProvider && (
              <>
                <span className="text-title">{selectedProvider.name}</span>
                <ApiBadge api={selectedProvider.api} />
                <span
                  className="status-badge"
                  style={{
                    background: selectedProvider.is_available ? 'var(--success-muted)' : 'var(--border-subtle)',
                    color: selectedProvider.is_available ? 'var(--success)' : 'var(--text-dimmer)',
                  }}
                >
                  {selectedProvider.is_available ? t('common.status_connected') : t('common.status_configured')}
                </span>
              </>
            )}
            {editMode === 'create' && (
              <span className="text-title">{t('providers.add_provider')}</span>
            )}
            {editMode === 'edit' && (
              <span className="text-title">{t('providers.edit_provider')}</span>
            )}
            {editMode === 'none' && !selectedProvider && (
              <span className="text-title">{t('providers.section_title')}</span>
            )}
          </div>
          <div className="flex-center gap-6">
            {(editMode !== 'none' || selectedProvider) && (
              <button
                className="btn btn-sm"
                onClick={handleTestConnection}
                disabled={!canTest || testing}
              >
                {testing ? t('common.testing') : t('common.button_test_connection')}
              </button>
            )}
            {editMode !== 'none' && (
              <>
                <button className="btn btn-sm btn-ghost" onClick={handleCancel}>{t('common.button_cancel')}</button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleSave}
                  disabled={saving || !canSave}
                >
                  {saving ? t('common.saving') : t('common.button_save')}
                </button>
              </>
            )}
            {editMode === 'none' && selectedProvider && (
              <>
                <button className="btn btn-sm" onClick={handleEditProvider}>
                  {t('common.button_edit')}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => setConfirmDelete(selectedProvider.id)}
                >
                  {t('common.button_delete')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="detail-scroll gap-14">
          {editMode === 'none' && !selectedProvider && (
            <div className="flex-center justify-center" style={{ height: '200px' }}>
              <div className="text-sm text-dimmer text-center">
                {t('providers.select_hint')}
              </div>
            </div>
          )}

          {/* Create / Edit form */}
          {editMode !== 'none' && (
            <div className="flex-col gap-10">
              <div className="group-row gap-8">
                <span className="group-label flex-shrink-0">Base URL</span>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={e => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="field-input mono-xs flex-1"
                />
                {suggesting && <span className="mono-xs text-dimmer">...</span>}
              </div>

              <div className="group-row gap-8">
                <span className="group-label flex-shrink-0">Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={e => { setFormName(e.target.value); setNameTouched(true) }}
                  placeholder="my-provider"
                  className="field-input flex-1"
                />
              </div>

              <div className="group-row gap-8">
                <span className="group-label flex-shrink-0">Protocol</span>
                <select
                  value={formApi}
                  onChange={e => setFormApi(e.target.value as ProviderApi)}
                  className="field-input flex-1"
                >
                  <option value="openai-completions">openai-completions</option>
                  <option value="anthropic-messages">anthropic-messages</option>
                  <option value="gemini">gemini</option>
                </select>
              </div>

              <div className="group-row gap-8">
                <span className="group-label flex-shrink-0">API Key</span>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={e => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="field-input mono-xs flex-1"
                />
              </div>

              {pendingModels.length > 0 && (
                <div className="mono-xs text-dimmer" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                  <div className="mb-4" style={{ color: 'var(--accent-hover)' }}>{t('providers.auto_detected_models', { count: pendingModels.length })}</div>
                  <div className="flex flex-wrap gap-4">
                    {pendingModels.slice(0, 8).map((m, i) => (
                      <span key={i} className="status-badge" style={{ background: 'var(--accent-muted)', color: 'var(--accent-hover)' }}>
                        {m.model_id}
                      </span>
                    ))}
                    {pendingModels.length > 8 && (
                      <span className="text-dimmer mono-xs">+{pendingModels.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View mode: provider details */}
          {editMode === 'none' && selectedProvider && (
            <>
              <div className="group">
                <div className="group-row">
                  <span className="group-label">{t('providers.label_name')}</span>
                  <span className="group-value mono-xs">{selectedProvider.name}</span>
                </div>
                <div className="group-row">
                  <span className="group-label">{t('providers.label_protocol')}</span>
                  <span className="group-value"><ApiBadge api={selectedProvider.api} /></span>
                </div>
                <div className="group-row">
                  <span className="group-label">Base URL</span>
                  <span className="group-value mono-xs">
                    {selectedProvider.base_url || t('common.not_set')}
                  </span>
                </div>
                <div className="group-row">
                  <span className="group-label">API Key</span>
                  <span className="group-value mono-xs">
                    {maskKey(selectedProvider.api_key, t('common.not_set'))}
                  </span>
                </div>
                <div className="group-row">
                  <span className="group-label">{t('providers.label_status')}</span>
                  <span
                    className="group-value text-xs"
                    style={{ color: selectedProvider.is_available ? 'var(--success)' : selectedProvider.last_tested ? 'var(--error)' : 'var(--text-dimmer)' }}
                  >
                    {selectedProvider.is_available ? t('providers.status_connected') : selectedProvider.last_tested ? t('providers.status_failed') : t('providers.status_untested')}
                  </span>
                </div>
                {selectedProvider.last_tested && (
                  <div className="group-row">
                    <span className="group-label">{t('providers.label_last_tested')}</span>
                    <span className="group-value mono-xs text-dimmer">
                      {new Date(selectedProvider.last_tested * 1000).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Delete confirmation */}
              {confirmDelete === selectedProvider.id && (
                <div className="confirm-block">
                  <div className="text-xs mb-4" style={{ color: 'var(--error)' }}>
                    {t('providers.delete_confirm_msg', { name: selectedProvider.name })}
                  </div>
                  <div className="flex-center gap-6">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDeleteProvider(selectedProvider.id)}
                    >
                      {t('providers.delete_confirm_btn')}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(null)}>
                      {t('common.button_cancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* Model list */}
              <ModelTable
                models={modelEditMode ? editingModels : models}
                providerName={selectedProvider.name}
                providerBaseUrl={selectedProvider.base_url}
                knownProviders={knownProviders}
                onReset={handleResetModels}
                editMode={modelEditMode}
                onToggleEdit={handleToggleModelEdit}
                onSaveModels={handleSaveModels}
                onAddModel={handleAddModel}
                onDeleteModel={handleDeleteModel}
                onUpdateModel={handleUpdateModel}
              />
            </>
          )}
        </div>
      </main>
    </>
  )
}
