// server/known-providers.js
import { readFileSync } from 'fs'
import { resolve } from 'path'

const JSON_PATH = resolve(import.meta.dirname, '../bundle/known-providers.json')

function loadProviders() {
  const raw = readFileSync(JSON_PATH, 'utf8')
  const data = JSON.parse(raw)
  // Convert camelCase to snake_case for legacy compatibility
  return data.providers.map(p => ({
    matchUrls: p.matchUrls,
    suggestName: p.suggestName,
    api: p.api,
    models: p.models.map(m => ({
      model_id: m.modelId,
      display_name: m.displayName,
      context_window: m.contextWindow,
      max_tokens: m.maxTokens,
      input_types: JSON.stringify(m.inputTypes),
      supports_vision: m.supportsVision ? 1 : 0,
    })),
  }))
}

export const KNOWN_PROVIDERS = loadProviders()

/**
 * 根据 baseUrl 推断 provider 配置
 * @returns { suggestName, api, models } 或 null
 */
export function detectProvider(baseUrl) {
  if (!baseUrl) return null
  const lower = baseUrl.toLowerCase()
  return KNOWN_PROVIDERS.find(p => p.matchUrls.some(u => lower.includes(u))) ?? null
}