import { useEffect, useState } from 'react'
import { getProviders, updateProvider, getModels, testProvider } from '../lib/api'
import { toast } from '../components/Toast'
import type { ProviderConfig, ModelInfo, ProviderType, TestProviderResult } from '../lib/types'

// ── BAILIAN Coding Plan 说明 ──────────────────────────────
// Coding Plan:   baseUrl 含 "coding", apiKey 格式 sk-sp-xxxxx
//   OpenAI  → https://coding.dashscope.aliyuncs.com/v1
//   Anthropic → https://coding.dashscope.aliyuncs.com/apps/anthropic
// 按量计费:     baseUrl 不含 "coding", apiKey 格式 sk-xxxxx
//   OpenAI  → https://dashscope.aliyuncs.com/compatible-mode/v1
//   Anthropic → https://dashscope.aliyuncs.com/anthropic

function maskKey(key?: string): string {
  if (!key) return '未设置'
  if (key.length <= 8) return '****'
  return key.slice(0, 6) + '****' + key.slice(-4)
}

function validateBailian(apiKey: string, baseUrl: string): { keyOk: boolean; urlOk: boolean; mismatch: boolean } {
  const isCodingUrl = baseUrl.includes('coding')
  const isCodingKey = apiKey.startsWith('sk-sp-')
  const isPayKey = apiKey.startsWith('sk-') && !apiKey.startsWith('sk-sp-')
  const keyOk = isCodingKey || isPayKey
  const urlOk = baseUrl.length === 0 || baseUrl.startsWith('http')
  const mismatch = apiKey.length > 0 && baseUrl.length > 0 && (
    (isCodingUrl && !isCodingKey) || (!isCodingUrl && isCodingKey)
  )
  return { keyOk, urlOk, mismatch }
}

interface BailianEditProps {
  existing?: ProviderConfig
  onSave: (config: ProviderConfig) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function BailianEditForm({ existing, onSave, onCancel, saving }: BailianEditProps) {
  const [apiKey, setApiKey] = useState(existing?.api_key ?? '')
  const [baseUrl, setBaseUrl] = useState(
    existing?.base_url ?? (existing?.is_coding_plan ? 'https://coding.dashscope.aliyuncs.com/v1' : '')
  )

  const { keyOk, urlOk, mismatch } = validateBailian(apiKey, baseUrl)
  const isCodingPlan = baseUrl.includes('coding') && apiKey.startsWith('sk-sp-')

  const handleSave = () => {
    const n = Math.floor(Date.now() / 1000)
    const config: ProviderConfig = {
      ...(existing ?? { id: crypto.randomUUID(), created_at: n }),
      provider_type: 'BAILIAN',
      api_key: apiKey,
      base_url: baseUrl,
      is_coding_plan: isCodingPlan,
      is_enabled: true,
      is_available: false,
      updated_at: n,
    }
    onSave(config)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
      {/* 快速填入 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
        <button
          className="tbtn tbtn-ghost"
          style={{ fontSize: '10px', padding: '2px 6px' }}
          onClick={() => setBaseUrl('https://coding.dashscope.aliyuncs.com/v1')}
        >
          Coding Plan
        </button>
        <button
          className="tbtn tbtn-ghost"
          style={{ fontSize: '10px', padding: '2px 6px' }}
          onClick={() => setBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')}
        >
          按量计费
        </button>
      </div>

      <div className="group-row" style={{ gap: '8px' }}>
        <span className="group-label" style={{ flexShrink: 0 }}>Base URL</span>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://coding.dashscope.aliyuncs.com/v1"
          className="field-input"
          style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
        />
      </div>

      <div className="group-row" style={{ gap: '8px' }}>
        <span className="group-label" style={{ flexShrink: 0 }}>API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={baseUrl.includes('coding') ? 'sk-sp-...' : 'sk-...'}
          className="field-input"
          style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
        />
      </div>

      {/* 校验提示 */}
      {mismatch && (
        <div style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: '5px' }}>
          ⚠ {baseUrl.includes('coding') ? 'Coding Plan URL 需搭配 sk-sp-xxx 格式密钥' : '按量计费 URL 需搭配 sk-xxx 格式密钥（非 sk-sp-）'}
        </div>
      )}
      {baseUrl.length > 0 && (
        <div style={{ fontSize: '11px', color: '#a78bfa', padding: '4px 8px', background: 'rgba(139,92,246,0.1)', borderRadius: '5px' }}>
          将测试 {baseUrl.includes('anthropic') ? 'Anthropic' : 'OpenAI'} 格式
          {isCodingPlan ? '（Coding Plan）' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          className="tbtn tbtn-accent"
          style={{ flex: 1 }}
          onClick={handleSave}
          disabled={saving || !apiKey || !baseUrl || !keyOk || !urlOk || mismatch}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button className="tbtn tbtn-ghost" style={{ flex: 1 }} onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

function TestBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
      background: ok ? 'rgba(52,199,89,0.15)' : 'rgba(244,63,94,0.15)',
      color: ok ? '#34c759' : '#f43f5e',
      display: 'inline-flex', alignItems: 'center', gap: '3px',
    }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [models, setModels] = useState<ModelInfo[]>([])
  const [editingBailian, setEditingBailian] = useState(false)
  const [savingBailian, setSavingBailian] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestProviderResult | null>(null)

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

  const bailian = providers.find(p => p.provider_type === 'BAILIAN')
  const configured = !!(bailian?.api_key) && !!(bailian?.base_url)

  const handleSaveBailian = async (config: ProviderConfig) => {
    setSavingBailian(true)
    try {
      await updateProvider(config)
      await load()
      setEditingBailian(false)
      setTestResult(null)
      toast('配置已保存', 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setSavingBailian(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testProvider('BAILIAN')
      setTestResult(result)
      const isAnthropicUrl = (bailian?.base_url ?? '').includes('anthropic')
      const ok = isAnthropicUrl ? result.anthropic_ok : result.openai_ok
      const fmt = isAnthropicUrl ? 'Anthropic' : 'OpenAI'
      toast(ok ? `${fmt} 连接成功` : `${fmt} 连接失败`, ok ? 'success' : 'error')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      setTesting(false)
    }
  }

  const bailianModels = models.filter(m => m.provider_type === 'BAILIAN')

  return (
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="toolbar">
        <span style={{ fontSize: '15px', fontWeight: 600 }}>模型管理</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ── 百炼配置卡片 ───────────────────────────── */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>Provider 配置</div>
          <div className="provider-card" style={{ padding: '14px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg,#f97316,#ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: 'white' }}>
                  阿
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#EBEBF5' }}>阿里云百炼</div>
                  <div style={{ fontSize: '11px', color: '#8E8E93' }}>DashScope · OpenAI & Anthropic 兼容</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {bailian?.is_coding_plan && (
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.18)', color: '#a78bfa' }}>
                    Coding Plan
                  </span>
                )}
                {configured ? (
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: bailian?.is_available ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)', color: bailian?.is_available ? '#34c759' : '#8E8E93' }}>
                    {bailian?.is_available ? '已连接' : '已配置'}
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#8E8E93' }}>未配置</span>
                )}
              </div>
            </div>

            {editingBailian ? (
              <BailianEditForm
                existing={bailian}
                onSave={handleSaveBailian}
                onCancel={() => setEditingBailian(false)}
                saving={savingBailian}
              />
            ) : (
              <>
                <div className="group" style={{ marginBottom: '10px' }}>
                  <div className="group-row">
                    <span className="group-label">Base URL</span>
                    <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px', color: !configured ? '#8E8E93' : undefined }}>
                      {bailian?.base_url || '未设置'}
                    </span>
                  </div>
                  <div className="group-row">
                    <span className="group-label">API Key</span>
                    <span className="group-value" style={{ fontFamily: 'monospace', fontSize: '11px', color: !configured ? '#8E8E93' : undefined }}>
                      {maskKey(bailian?.api_key)}
                    </span>
                  </div>
                  <div className="group-row">
                    <span className="group-label">可用模型</span>
                    <span className="group-value">{bailianModels.length} 个</span>
                  </div>
                </div>

                {/* 测试结果 — 只显示实际测过的格式 */}
                {testResult && (() => {
                  const isAnthropicUrl = (bailian?.base_url ?? '').includes('anthropic')
                  const ok = isAnthropicUrl ? testResult.anthropic_ok : testResult.openai_ok
                  const err = isAnthropicUrl ? testResult.anthropic_error : testResult.openai_error
                  const label = isAnthropicUrl ? 'Anthropic 格式' : 'OpenAI 格式'
                  return (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <TestBadge ok={ok} label={label} />
                      {!ok && err && (
                        <span style={{ fontSize: '10px', color: '#8E8E93' }}>{err}</span>
                      )}
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="tbtn tbtn-accent"
                    style={{ flex: 1 }}
                    disabled={!configured || testing}
                    onClick={handleTest}
                  >
                    {testing ? '测试中...' : '测试连接'}
                  </button>
                  <button
                    className="tbtn tbtn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => { setEditingBailian(true); setTestResult(null) }}
                  >
                    编辑配置
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── 模型列表 ────────────────────────────────── */}
        <section>
          <div className="section-label" style={{ padding: '0 0 7px' }}>可用模型（百炼 Coding Plan）</div>
          <div className="group">
            <table>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>上下文</th>
                  <th>输入</th>
                  <th>能力</th>
                </tr>
              </thead>
              <tbody>
                {bailianModels.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: '#8E8E93', padding: '12px' }}>加载中...</td></tr>
                ) : (
                  bailianModels.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(249,115,22,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#f97316', flexShrink: 0 }}>
                            {m.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '12px' }}>{m.name}</span>
                        </div>
                      </td>
                      <td>{m.context_window >= 1000000 ? `${(m.context_window / 1000000).toFixed(0)}M` : m.context_window >= 1000 ? `${Math.round(m.context_window / 1000)}K` : m.context_window}</td>
                      <td style={{ color: '#8E8E93', fontSize: '11px' }}>
                        text{m.supports_vision ? ' + image' : ''}
                      </td>
                      <td>
                        {m.supports_vision && <span className="tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', marginRight: '4px' }}>视觉</span>}
                        {m.supports_streaming && <span className="tag" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>流式</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  )
}
