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

function maskKey(key?: string): string {
  if (!key) return '未设置'
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
  const colors = API_BADGE_COLORS[api] ?? { bg: 'rgba(255,255,255,0.08)', color: '#8E8E93' }
  return (
    <span style={{
      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
      background: colors.bg, color: colors.color,
    }}>
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
  const knownByName = knownProviders.find(p => p.suggestName === providerName)
  const knownByUrl = !knownByName && models.length === 0
    ? knownProviders.find(p => p.matchUrls && p.matchUrls.some(u => providerBaseUrl.includes(u)))
    : null
  const known = knownByName ?? knownByUrl

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#8E8E93' }}>
          {t('providers.available_models')} ({models.length})
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {editMode ? (
            <>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onAddModel}>
                + 添加模型
              </button>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onToggleEdit}>
                取消
              </button>
              <button className="tbtn tbtn-accent" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onSaveModels}>
                保存
              </button>
            </>
          ) : (
            <>
              <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onToggleEdit}>
                编辑
              </button>
              {known && models.length > 0 && (
                <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onReset}>
                  恢复默认模型
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {models.length === 0 && known ? (
        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#8E8E93' }}>
            根据 Base URL 推断为 <span style={{ color: '#EBEBF5' }}>{known.suggestName}</span>，可使用 {known.models.length} 个推荐模型
          </span>
          <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', flexShrink: 0 }} onClick={onReset}>
            应用推荐模型
          </button>
        </div>
      ) : models.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#8E8E93', padding: '12px 0', textAlign: 'center' }}>
          暂无模型配置
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
                {editMode && <th style={{ width: '60px' }}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {models.map((m, index) => {
                const isNew = m.id?.startsWith('new_')
                return (
                  <tr key={m.id}>
                    {editMode ? (
                      <>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                          <input
                            type="text"
                            value={m.model_id}
                            onChange={(e) => onUpdateModel?.(m.id, 'model_id', e.target.value)}
                            className="field-input"
                            style={{ width: '100%', padding: '4px 6px', fontSize: '11px', fontFamily: 'monospace' }}
                          />
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <input
                            type="text"
                            value={m.display_name}
                            onChange={(e) => onUpdateModel?.(m.id, 'display_name', e.target.value)}
                            className="field-input"
                            style={{ width: '100%', padding: '4px 6px', fontSize: '12px' }}
                          />
                          {isNew && <span style={{ fontSize: '10px', color: '#f59e0b', marginLeft: '4px' }}>[未保存]</span>}
                        </td>
                        <td>
                          <input
                            type="number"
                            value={m.context_window}
                            onChange={(e) => onUpdateModel?.(m.id, 'context_window', parseInt(e.target.value) || 0)}
                            className="field-input"
                            style={{ width: '80px', padding: '4px 6px', fontSize: '11px' }}
                          />
                        </td>
                        <td style={{ fontSize: '11px', color: '#8E8E93', fontFamily: 'monospace' }}>
                          <select
                            value={m.input_types}
                            onChange={(e) => onUpdateModel?.(m.id, 'input_types', e.target.value)}
                            className="field-input"
                            style={{ padding: '4px 6px', fontSize: '11px', fontFamily: 'monospace' }}
                          >
                            <option value='["text"]'>text</option>
                            <option value='["text","image"]'>text+image</option>
                          </select>
                        </td>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={m.supports_vision}
                              onChange={(e) => onUpdateModel?.(m.id, 'supports_vision', e.target.checked)}
                              style={{ accentColor: '#8b5cf6' }}
                            />
                          </label>
                        </td>
                        <td>
                          <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', color: '#f43f5e', padding: '2px 6px', background: 'rgba(244,63,94,0.1)' }} onClick={() => onDeleteModel?.(m.id)}>
                            删除
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{m.model_id}</td>
                        <td style={{ fontSize: '12px' }}>{m.display_name}{isNew && <span style={{ fontSize: '10px', color: '#f59e0b', marginLeft: '4px' }}>[未保存]</span>}</td>
                        <td>{m.context_window >= 1000000 ? `${(m.context_window / 1000000).toFixed(0)}M` : m.context_window >= 1000 ? `${Math.round(m.context_window / 1000)}K` : m.context_window}</td>
                        <td style={{ fontSize: '11px', color: '#8E8E93', fontFamily: 'monospace' }}>{m.input_types}</td>
                        <td>
                          {m.supports_vision
                            ? <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{t('providers.cap_vision')}</span>
                            : <span style={{ color: '#555' }}>-</span>}
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
      if (!window.confirm('有未保存的修改，确认放弃？')) return
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
    let known = knownProviders.find(p => p.suggestName === selectedProvider.name)
    if (!known) {
      known = knownProviders.find(p => p.matchUrls && p.matchUrls.some(u => selectedProvider.base_url.includes(u)))
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
      toast('Models saved', 'success')
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
        toast(`连接成功${result.latency_ms != null ? `（${result.latency_ms}ms）` : ''}`, 'success')
      } else {
        toast(`连接失败: ${result.error ?? '未知错误'}`, 'error')
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
        <div data-tauri-drag-region className="toolbar">
          <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('providers.section_title')}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {providers.length === 0 && (
            <div style={{ padding: '12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>
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
                <div className="avatar avatar-lg" style={{ background: gradient }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.name}</span>
                    {editMode === 'edit' && selectedId === p.id && (
                      <span style={{ fontSize: '10px', color: '#f59e0b' }}>[未保存]</span>
                    )}
                  </div>
                  <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ApiBadge api={p.api} />
                    <span style={{
                      fontSize: '10px', padding: '1px 5px', borderRadius: '4px',
                      background: p.is_available ? 'rgba(52,199,89,0.12)' : (p.is_enabled ? (p.last_tested ? 'rgba(244,63,94,0.12)' : 'rgba(255,255,255,0.06)') : 'rgba(255,255,255,0.06)'),
                      color: p.is_available ? '#34c759' : (p.is_enabled ? (p.last_tested ? '#f43f5e' : '#8E8E93') : '#555'),
                    }}>
                      {p.is_available ? '已连通' : (p.is_enabled ? (p.last_tested ? '连接失败' : '未测试') : '已禁用')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            className="tbtn tbtn-ghost"
            style={{ width: '100%', fontSize: '12px', justifyContent: 'center', color: editMode === 'create' ? '#f59e0b' : undefined }}
            onClick={handleAddProvider}
          >
            + {t('common.button_add')}{editMode === 'create' && <span style={{ marginLeft: '4px', fontSize: '10px' }}>未保存</span>}
          </button>
        </div>
      </div>

      {/* ── Right: Detail / Form ─────────────────────────── */}
      <main className="detail-pane">
        {/* Toolbar */}
        <div data-tauri-drag-region className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editMode === 'none' && selectedProvider && (
              <>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>{selectedProvider.name}</span>
                <ApiBadge api={selectedProvider.api} />
                <span style={{
                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                  background: selectedProvider.is_available ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
                  color: selectedProvider.is_available ? '#34c759' : '#8E8E93',
                }}>
                  {selectedProvider.is_available ? t('common.status_connected') : t('common.status_configured')}
                </span>
              </>
            )}
            {editMode === 'create' && (
              <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('providers.add_provider')}</span>
            )}
            {editMode === 'edit' && (
              <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('providers.edit_provider')}</span>
            )}
            {editMode === 'none' && !selectedProvider && (
              <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('providers.section_title')}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(editMode !== 'none' || selectedProvider) && (
              <button
                className="tbtn tbtn-ghost"
                style={{ fontSize: '11px' }}
                onClick={handleTestConnection}
                disabled={!canTest || testing}
              >
                {testing ? t('common.testing') : t('common.button_test_connection')}
              </button>
            )}
            {editMode !== 'none' && (
              <>
                <button className="tbtn tbtn-ghost" onClick={handleCancel}>{t('common.button_cancel')}</button>
                <button
                  className="tbtn tbtn-accent"
                  onClick={handleSave}
                  disabled={saving || !canSave}
                >
                  {saving ? t('common.saving') : t('common.button_save')}
                </button>
              </>
            )}
            {editMode === 'none' && selectedProvider && (
              <>
                <button className="tbtn tbtn-ghost" style={{ fontSize: '11px' }} onClick={handleEditProvider}>
                  {t('common.button_edit')}
                </button>
                <button
                  className="tbtn tbtn-ghost"
                  style={{ fontSize: '11px', color: '#f43f5e' }}
                  onClick={() => setConfirmDelete(selectedProvider.id)}
                >
                  {t('common.button_delete')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {editMode === 'none' && !selectedProvider && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
              <div style={{ fontSize: '13px', color: '#8E8E93', textAlign: 'center' }}>
                {t('providers.select_hint')}
              </div>
            </div>
          )}

          {/* Create / Edit form */}
          {editMode !== 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="group-row" style={{ gap: '8px' }}>
                <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>Base URL</span>
                <input
                  type="text"
                  value={formBaseUrl}
                  onChange={e => setFormBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="field-input"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
                />
                {suggesting && <span style={{ fontSize: '11px', color: '#8E8E93' }}>...</span>}
              </div>

              <div className="group-row" style={{ gap: '8px' }}>
                <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>Name</span>
                <input
                  type="text"
                  value={formName}
                  onChange={e => { setFormName(e.target.value); setNameTouched(true) }}
                  placeholder="my-provider"
                  className="field-input"
                  style={{ flex: 1, fontSize: '12px' }}
                />
              </div>

              <div className="group-row" style={{ gap: '8px' }}>
                <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>Protocol</span>
                <select
                  value={formApi}
                  onChange={e => setFormApi(e.target.value as ProviderApi)}
                  className="field-input"
                  style={{ flex: 1, fontSize: '12px' }}
                >
                  <option value="openai-completions">openai-completions</option>
                  <option value="anthropic-messages">anthropic-messages</option>
                  <option value="gemini">gemini</option>
                </select>
              </div>

              <div className="group-row" style={{ gap: '8px' }}>
                <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>API Key</span>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={e => setFormApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="field-input"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
                />
              </div>

              {pendingModels.length > 0 && (
                <div style={{ fontSize: '11px', color: '#8E8E93', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '6px', color: '#a78bfa' }}>{t('providers.auto_detected_models', { count: pendingModels.length })}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {pendingModels.slice(0, 8).map((m, i) => (
                      <span key={i} style={{ padding: '2px 6px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: '4px', fontSize: '10px' }}>
                        {m.model_id}
                      </span>
                    ))}
                    {pendingModels.length > 8 && (
                      <span style={{ padding: '2px 6px', color: '#8E8E93', fontSize: '10px' }}>+{pendingModels.length - 8} more</span>
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
                  <span className="group-label">名称</span>
                  <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>{selectedProvider.name}</span>
                </div>
                <div className="group-row">
                  <span className="group-label">协议</span>
                  <span className="group-value"><ApiBadge api={selectedProvider.api} /></span>
                </div>
                <div className="group-row">
                  <span className="group-label">Base URL</span>
                  <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    {selectedProvider.base_url || t('common.not_set')}
                  </span>
                </div>
                <div className="group-row">
                  <span className="group-label">API Key</span>
                  <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    {maskKey(selectedProvider.api_key)}
                  </span>
                </div>
                <div className="group-row">
                  <span className="group-label">状态</span>
                  <span className="group-value" style={{
                    color: selectedProvider.is_available ? '#34c759' : selectedProvider.last_tested ? '#f43f5e' : '#8E8E93',
                    fontSize: '12px',
                  }}>
                    {selectedProvider.is_available ? '已连通' : selectedProvider.last_tested ? '连接失败' : '未测试'}
                  </span>
                </div>
                {selectedProvider.last_tested && (
                  <div className="group-row">
                    <span className="group-label">上次测试</span>
                    <span className="group-value" style={{ fontSize: '11px', color: '#8E8E93' }}>
                      {new Date(selectedProvider.last_tested * 1000).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Delete confirmation */}
              {confirmDelete === selectedProvider.id && (
                <div style={{ padding: '10px', background: 'rgba(244,63,94,0.08)', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <div style={{ fontSize: '12px', marginBottom: '8px', color: '#f43f5e' }}>
                    {t('providers.delete_confirm_msg', { name: selectedProvider.name })}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="tbtn"
                      style={{ fontSize: '11px', background: 'rgba(244,63,94,0.2)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }}
                      onClick={() => handleDeleteProvider(selectedProvider.id)}
                    >
                      {t('providers.delete_confirm_btn')}
                    </button>
                    <button className="tbtn tbtn-ghost" style={{ fontSize: '11px' }} onClick={() => setConfirmDelete(null)}>
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
