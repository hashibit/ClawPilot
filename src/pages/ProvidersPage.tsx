import { useEffect, useState } from 'react'
import { getProviders, updateProvider, getModels, testProvider } from '../lib/api'
import { toast } from '../components/Toast'
import type { ProviderConfig, ModelInfo, ProviderType } from '../lib/types'

interface ProviderMeta {
  type: ProviderType
  icon: string
  gradient: string
  name: string
  sub: string
}

const PROVIDER_META: ProviderMeta[] = [
  { type: 'BAILIAN',    icon: '阿', gradient: '#f97316,#ef4444', name: '阿里云百炼',  sub: 'Aliyun Bailian' },
  { type: 'VOLCENGINE', icon: '火', gradient: '#3b82f6,#06b6d4', name: '火山方舟',    sub: 'Volcano Engine' },
  { type: 'MINIMAX',    icon: 'M',  gradient: '#8b5cf6,#ec4899', name: 'MiniMax',     sub: 'MiniMax AI' },
]

function maskKey(key?: string): string {
  if (!key) return '未设置'
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [editingType, setEditingType] = useState<ProviderType | null>(null)
  const [editKey, setEditKey] = useState('')
  const [testing, setTesting] = useState<ProviderType | null>(null)

  const load = async () => {
    try {
      const [provs, mods] = await Promise.all([getProviders(), getModels()])
      setProviders(provs)
      setModels(mods)
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  useEffect(() => { load() }, [])

  const getProvider = (type: ProviderType): ProviderConfig | undefined =>
    providers.find(p => p.provider_type === type)

  const handleTest = async (type: ProviderType) => {
    setTesting(type)
    try {
      const ok = await testProvider(type)
      toast(ok ? '连接成功' : '连接失败', ok ? 'success' : 'error')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setTesting(null)
    }
  }

  const handleOpenEdit = (type: ProviderType) => {
    const p = getProvider(type)
    setEditKey(p?.api_key ?? '')
    setEditingType(type)
  }

  const handleSaveEdit = async () => {
    if (!editingType) return
    const existing = getProvider(editingType)
    const now = Date.now()
    const config: ProviderConfig = existing
      ? { ...existing, api_key: editKey, updated_at: now }
      : {
          id: crypto.randomUUID(),
          provider_type: editingType,
          api_key: editKey,
          is_enabled: true,
          is_available: false,
          created_at: now,
          updated_at: now,
        }
    try {
      await updateProvider(config)
      await load()
      setEditingType(null)
      toast('配置已保存', 'success')
    } catch (e) {
      toast(String(e), 'error')
    }
  }

  const providerModelCount = (type: ProviderType) =>
    models.filter(m => m.provider_type === type).length

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>模型管理</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Provider 配置 */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>Provider 配置</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
            {PROVIDER_META.map(meta => {
              const p = getProvider(meta.type)
              const configured = !!(p?.api_key)
              const available = p?.is_available ?? false
              const modelCount = providerModelCount(meta.type)

              return (
                <div key={meta.type} className="provider-card" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `linear-gradient(135deg,${meta.gradient})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {meta.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#EBEBF5' }}>{meta.name}</div>
                        <div style={{ fontSize: '11px', color: '#636366' }}>{meta.sub}</div>
                      </div>
                    </div>
                    {configured ? (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: available ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)', color: available ? '#34c759' : '#636366' }}>
                        {available ? '已连接' : '已配置'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#636366' }}>未配置</span>
                    )}
                  </div>

                  {/* Edit form (inline) */}
                  {editingType === meta.type ? (
                    <div style={{ marginBottom: '8px' }}>
                      <div className="group-row" style={{ gap: '8px', marginBottom: '6px' }}>
                        <span className="group-label">API Key</span>
                        <input
                          type="password"
                          value={editKey}
                          onChange={e => setEditKey(e.target.value)}
                          placeholder="sk-..."
                          className="field-input"
                          style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="tbtn tbtn-accent" style={{ flex: 1 }} onClick={handleSaveEdit}>保存</button>
                        <button className="tbtn tbtn-ghost" style={{ flex: 1 }} onClick={() => setEditingType(null)}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="group" style={{ marginBottom: '8px' }}>
                      <div className="group-row">
                        <span className="group-label">可用模型</span>
                        <span className="group-value" style={!configured ? { color: '#636366' } : undefined}>
                          {configured ? `${modelCount} 个` : '—'}
                        </span>
                      </div>
                      <div className="group-row">
                        <span className="group-label">API Key</span>
                        <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px', color: !configured ? '#636366' : undefined }}>
                          {maskKey(p?.api_key)}
                        </span>
                      </div>
                    </div>
                  )}

                  {editingType !== meta.type && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="tbtn tbtn-accent"
                        style={{ flex: 1, textAlign: 'center' }}
                        disabled={!configured || testing === meta.type}
                        onClick={() => handleTest(meta.type)}
                      >
                        {testing === meta.type ? '测试中...' : '测试连接'}
                      </button>
                      <button
                        className="tbtn tbtn-ghost"
                        style={{ flex: 1, textAlign: 'center' }}
                        onClick={() => handleOpenEdit(meta.type)}
                      >
                        编辑配置
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* 模型对比 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }}>
            <span className="section-label" style={{ padding: 0 }}>模型对比</span>
          </div>
          <div className="group">
            <table>
              <thead>
                <tr>
                  <th>模型名称</th>
                  <th>提供商</th>
                  <th>上下文</th>
                  <th>输入价格</th>
                  <th>输出价格</th>
                  <th>能力</th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#636366', padding: '12px' }}>暂无模型数据，请先配置 Provider</td></tr>
                ) : (
                  models.map(m => {
                    const meta = PROVIDER_META.find(pm => pm.type === m.provider_type)
                    const initial = m.display_name.slice(0, 1).toUpperCase()
                    const colorMap: Record<ProviderType, string> = {
                      BAILIAN: 'rgba(139,92,246,0.2)',
                      VOLCENGINE: 'rgba(6,182,212,0.2)',
                      MINIMAX: 'rgba(139,92,246,0.2)',
                    }
                    const textColorMap: Record<ProviderType, string> = {
                      BAILIAN: '#a78bfa',
                      VOLCENGINE: '#06b6d4',
                      MINIMAX: '#a78bfa',
                    }
                    return (
                      <tr key={m.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: colorMap[m.provider_type], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: textColorMap[m.provider_type], flexShrink: 0 }}>
                              {initial}
                            </div>
                            <span style={{ fontWeight: 500 }}>{m.name}</span>
                          </div>
                        </td>
                        <td style={{ color: '#636366' }}>{meta?.name ?? m.provider_type}</td>
                        <td>{m.context_window >= 1000 ? `${Math.round(m.context_window / 1000)}K` : m.context_window}</td>
                        <td>¥{m.input_price}/1K</td>
                        <td>¥{m.output_price}/1K</td>
                        <td>
                          {m.supports_function_calling && <span className="tag" style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759', marginRight: '4px' }}>推理</span>}
                          {m.supports_vision && <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', marginRight: '4px' }}>视觉</span>}
                          {m.supports_streaming && <span className="tag" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>流式</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  )
}
