import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getModels,
  setModels as apiSetModels,
  suggestProvider,
  getKnownProviders,
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

// ── Provider Edit Form ─────────────────────────────────────

interface ProviderFormProps {
  existing?: ProviderConfig
  onSave: (provider: ProviderConfig, models: Partial<ModelInfo>[]) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ProviderForm({ existing, onSave, onCancel, saving }: ProviderFormProps) {
  const [name, setName] = useState(existing?.name ?? '')
  const [api, setApi] = useState<ProviderApi>(existing?.api ?? 'openai-completions')
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? '')
  const [apiKey, setApiKey] = useState(existing?.api_key ?? '')
  const [pendingModels, setPendingModels] = useState<Partial<ModelInfo>[]>([])
  const [nameTouched, setNameTouched] = useState(!!existing)
  const [suggesting, setSuggesting] = useState(false)

  // Auto-suggest on baseUrl change (debounced)
  useEffect(() => {
    if (!baseUrl.trim()) return
    const timer = setTimeout(async () => {
      setSuggesting(true)
      try {
        const result = await suggestProvider(baseUrl)
        if (result) {
          if (!nameTouched) setName(result.name)
          setApi(result.api)
          setPendingModels(result.models)
        }
      } catch {
        // ignore suggest errors
      } finally {
        setSuggesting(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [baseUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const n = Math.floor(Date.now() / 1000)
    const provider: ProviderConfig = {
      ...(existing ?? { id: '', created_at: n }),
      name,
      api,
      base_url: baseUrl,
      api_key: apiKey,
      is_enabled: existing?.is_enabled ?? true,
      is_available: existing?.is_available ?? false,
      updated_at: n,
    }
    onSave(provider, pendingModels)
  }

  const canSave = name.trim() && api && baseUrl.trim() && !suggesting

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="group-row" style={{ gap: '8px' }}>
        <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>Base URL</span>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
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
          value={name}
          onChange={e => { setName(e.target.value); setNameTouched(true) }}
          placeholder="my-provider"
          className="field-input"
          style={{ flex: 1, fontSize: '12px' }}
        />
      </div>

      <div className="group-row" style={{ gap: '8px' }}>
        <span className="group-label" style={{ flexShrink: 0, width: '72px' }}>Protocol</span>
        <select
          value={api}
          onChange={e => setApi(e.target.value as ProviderApi)}
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
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="field-input"
          style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
        />
      </div>

      {pendingModels.length > 0 && (
        <div style={{ fontSize: '11px', color: '#8E8E93', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '5px' }}>
          Auto-detected {pendingModels.length} models from known provider registry
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          className="tbtn tbtn-accent"
          style={{ flex: 1 }}
          onClick={handleSave}
          disabled={saving || !canSave}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="tbtn tbtn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Model Table ────────────────────────────────────────────

function ModelTable({ models, providerName, knownProviders, onReset }: {
  models: ModelInfo[]
  providerName: string
  knownProviders: KnownProvider[]
  onReset: () => void
}) {
  const { t } = useTranslation()
  const known = knownProviders.find(p => p.suggestName === providerName)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#8E8E93' }}>
          {t('providers.available_models')} ({models.length})
        </span>
        {known && (
          <button className="tbtn tbtn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }} onClick={onReset}>
            Reset to defaults
          </button>
        )}
      </div>
      {models.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#8E8E93', padding: '12px 0', textAlign: 'center' }}>
          No models configured
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
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{m.model_id}</td>
                  <td style={{ fontSize: '12px' }}>{m.display_name}</td>
                  <td>{m.context_window >= 1000000 ? `${(m.context_window / 1000000).toFixed(0)}M` : m.context_window >= 1000 ? `${Math.round(m.context_window / 1000)}K` : m.context_window}</td>
                  <td style={{ fontSize: '11px', color: '#8E8E93', fontFamily: 'monospace' }}>{m.input_types}</td>
                  <td>
                    {m.supports_vision
                      ? <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{t('providers.cap_vision')}</span>
                      : <span style={{ color: '#555' }}>-</span>}
                  </td>
                </tr>
              ))}
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

  const loadProviders = async () => {
    try {
      const [provs, known] = await Promise.all([getProviders(), getKnownProviders()])
      setProviders(provs)
      setKnownProviders(known)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const loadModels = async (providerName: string) => {
    try {
      const mods = await getModels(providerName)
      setModels(mods)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  useEffect(() => { loadProviders() }, [])

  const selectedProvider = providers.find(p => p.id === selectedId) ?? null

  useEffect(() => {
    if (selectedProvider) {
      loadModels(selectedProvider.name)
    } else {
      setModels([])
    }
  }, [selectedId, selectedProvider?.name])

  const handleSelectProvider = (id: string) => {
    setSelectedId(id)
    setEditMode('none')
  }

  const handleAddProvider = () => {
    setSelectedId(null)
    setEditMode('create')
  }

  const handleEditProvider = () => {
    setEditMode('edit')
  }

  const handleSaveProvider = async (provider: ProviderConfig, pendingModels: Partial<ModelInfo>[]) => {
    setSaving(true)
    try {
      let saved: ProviderConfig
      if (editMode === 'create') {
        saved = await createProvider({
          name: provider.name,
          api: provider.api,
          base_url: provider.base_url,
          api_key: provider.api_key,
          is_enabled: provider.is_enabled,
        })
      } else {
        saved = await updateProvider({
          id: provider.id,
          name: provider.name,
          api: provider.api,
          base_url: provider.base_url,
          api_key: provider.api_key,
          is_enabled: provider.is_enabled,
        })
      }
      // Write model list if we have pending models
      if (pendingModels.length > 0) {
        await apiSetModels(saved.name, pendingModels)
      }
      await loadProviders()
      setSelectedId(saved.id)
      setEditMode('none')
      toast('Provider saved', 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProvider = async (id: string) => {
    try {
      await deleteProvider(id)
      await loadProviders()
      if (selectedId === id) {
        setSelectedId(null)
        setEditMode('none')
      }
      setConfirmDelete(null)
      toast('Provider deleted', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const handleResetModels = async () => {
    if (!selectedProvider) return
    const known = knownProviders.find(p => p.suggestName === selectedProvider.name)
    if (!known) return
    try {
      await apiSetModels(selectedProvider.name, known.models)
      await loadModels(selectedProvider.name)
      toast('Models reset to defaults', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar">
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{t('providers.section_title')}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ── Left: Provider List ─────────────────── */}
        <div style={{
          width: '220px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 10px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Providers ({providers.length})
            </span>
            <button
              className="tbtn tbtn-ghost"
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={handleAddProvider}
            >
              + Add
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {providers.length === 0 && (
              <div style={{ padding: '12px', fontSize: '12px', color: '#8E8E93', textAlign: 'center' }}>
                No providers yet
              </div>
            )}
            {providers.map(p => (
              <div
                key={p.id}
                onClick={() => handleSelectProvider(p.id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: selectedId === p.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                  display: 'flex', flexDirection: 'column', gap: '3px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#EBEBF5' }}>{p.name}</span>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                    background: p.is_available ? '#34c759' : (p.is_enabled ? '#f59e0b' : '#555'),
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ApiBadge api={p.api} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Detail / Form ────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {editMode === 'create' && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: '#EBEBF5' }}>
                Add Provider
              </div>
              <ProviderForm
                onSave={handleSaveProvider}
                onCancel={() => setEditMode('none')}
                saving={saving}
              />
            </div>
          )}

          {editMode === 'edit' && selectedProvider && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: '#EBEBF5' }}>
                Edit Provider
              </div>
              <ProviderForm
                existing={selectedProvider}
                onSave={handleSaveProvider}
                onCancel={() => setEditMode('none')}
                saving={saving}
              />
            </div>
          )}

          {editMode === 'none' && !selectedProvider && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
              <div style={{ fontSize: '13px', color: '#8E8E93', textAlign: 'center' }}>
                Select a provider or click "+ Add"
              </div>
            </div>
          )}

          {editMode === 'none' && selectedProvider && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Provider detail */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#EBEBF5' }}>{selectedProvider.name}</span>
                    <ApiBadge api={selectedProvider.api} />
                    <span style={{
                      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                      background: selectedProvider.is_available ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
                      color: selectedProvider.is_available ? '#34c759' : '#8E8E93',
                    }}>
                      {selectedProvider.is_available ? t('common.status_connected') : t('common.status_configured')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="tbtn tbtn-ghost" style={{ fontSize: '11px' }} onClick={handleEditProvider}>
                      Edit
                    </button>
                    <button
                      className="tbtn tbtn-ghost"
                      style={{ fontSize: '11px', color: '#f43f5e' }}
                      onClick={() => setConfirmDelete(selectedProvider.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="group" style={{ marginBottom: '4px' }}>
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
                </div>
              </div>

              {/* Delete confirmation */}
              {confirmDelete === selectedProvider.id && (
                <div style={{ padding: '10px', background: 'rgba(244,63,94,0.08)', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)' }}>
                  <div style={{ fontSize: '12px', marginBottom: '8px', color: '#f43f5e' }}>
                    Delete provider "{selectedProvider.name}"? This will also delete all associated models.
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="tbtn"
                      style={{ fontSize: '11px', background: 'rgba(244,63,94,0.2)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }}
                      onClick={() => handleDeleteProvider(selectedProvider.id)}
                    >
                      Confirm Delete
                    </button>
                    <button className="tbtn tbtn-ghost" style={{ fontSize: '11px' }} onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Model list */}
              <ModelTable
                models={models}
                providerName={selectedProvider.name}
                knownProviders={knownProviders}
                onReset={handleResetModels}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
