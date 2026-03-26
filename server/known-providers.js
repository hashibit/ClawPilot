// server/known-providers.js
export const KNOWN_PROVIDERS = [
  {
    matchUrls: ['dashscope.aliyuncs.com', 'coding.dashscope.aliyuncs.com', 'coding-intl.dashscope.aliyuncs.com'],
    suggestName: 'bailian',
    api: 'openai-completions',
    models: [
      { model_id: 'qwen3.5-plus',          display_name: 'Qwen3.5 Plus',        context_window: 1000000, max_tokens: 65536,  input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'qwen3-max-2026-01-23',   display_name: 'Qwen3 Max',           context_window: 262144,  max_tokens: 65536,  input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'qwen3-coder-plus',       display_name: 'Qwen3 Coder Plus',    context_window: 1000000, max_tokens: 65536,  input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'qwen3-coder-next',       display_name: 'Qwen3 Coder Next',    context_window: 262144,  max_tokens: 65536,  input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'kimi-k2.5',             display_name: 'Kimi K2.5',           context_window: 262144,  max_tokens: 32768,  input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'glm-5',                  display_name: 'GLM-5',               context_window: 202752,  max_tokens: 16384,  input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'glm-4.7',               display_name: 'GLM-4.7',             context_window: 202752,  max_tokens: 16384,  input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'MiniMax-M2.5',          display_name: 'MiniMax M2.5',        context_window: 1000000, max_tokens: 131072, input_types: '["text"]',        supports_vision: 0 },
    ],
  },
  {
    matchUrls: ['ark.cn-beijing.volces.com'],
    suggestName: 'volcengine',
    api: 'openai-completions',
    models: [
      { model_id: 'doubao-seed-code-preview-251028', display_name: 'Doubao Seed Code Preview', context_window: 262144, max_tokens: 32768, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'doubao-seed-1-8-251228',          display_name: 'Doubao Seed 1.8',          context_window: 262144, max_tokens: 32768, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'kimi-k2-5-260127',                display_name: 'Kimi K2.5',                context_window: 262144, max_tokens: 32768, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'glm-4-7-251222',                  display_name: 'GLM-4.7',                  context_window: 200000, max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'deepseek-v3-2-251201',            display_name: 'DeepSeek V3.2',            context_window: 131072, max_tokens: 16384, input_types: '["text"]',        supports_vision: 0 },
    ],
  },
  {
    matchUrls: ['open.bigmodel.cn', 'bigmodel.cn'],
    suggestName: 'zai',
    api: 'openai-completions',
    models: [
      { model_id: 'glm-5',       display_name: 'GLM-5',        context_window: 198656, max_tokens: 32768, input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'glm-4.7',    display_name: 'GLM-4.7',      context_window: 198656, max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'glm-4.6v',   display_name: 'GLM-4.6V',     context_window: 198656, max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'glm-4.6',    display_name: 'GLM-4.6',      context_window: 198656, max_tokens: 16384, input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'glm-4.7-flash', display_name: 'GLM-4.7 Flash', context_window: 131072, max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
    ],
  },
  {
    matchUrls: ['api.minimax.io', 'api.minimaxi.com'],
    suggestName: 'minimax',
    api: 'anthropic-messages',
    models: [
      { model_id: 'MiniMax-M2.5',            display_name: 'MiniMax M2.5',            context_window: 200000, max_tokens: 8192, input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'MiniMax-M2.5-highspeed',  display_name: 'MiniMax M2.5 Highspeed',  context_window: 200000, max_tokens: 8192, input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'MiniMax-M2.7',            display_name: 'MiniMax M2.7',            context_window: 200000, max_tokens: 8192, input_types: '["text"]',        supports_vision: 0 },
      { model_id: 'MiniMax-VL-01',           display_name: 'MiniMax VL-01',           context_window: 200000, max_tokens: 8192, input_types: '["text","image"]', supports_vision: 1 },
    ],
  },
  {
    matchUrls: ['api.openai.com'],
    suggestName: 'openai',
    api: 'openai-completions',
    models: [
      { model_id: 'gpt-4o',       display_name: 'GPT-4o',       context_window: 128000,  max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'gpt-4o-mini',  display_name: 'GPT-4o Mini',  context_window: 128000,  max_tokens: 16384, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'gpt-4.1',      display_name: 'GPT-4.1',      context_window: 1047576, max_tokens: 32768, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', context_window: 1047576, max_tokens: 32768, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'o3',           display_name: 'o3',            context_window: 200000,  max_tokens: 100000, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'o4-mini',      display_name: 'o4 Mini',       context_window: 200000,  max_tokens: 100000, input_types: '["text","image"]', supports_vision: 1 },
    ],
  },
  {
    matchUrls: ['api.anthropic.com'],
    suggestName: 'anthropic',
    api: 'anthropic-messages',
    models: [
      { model_id: 'claude-opus-4-6',   display_name: 'Claude Opus 4.6',   context_window: 200000, max_tokens: 32000, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', context_window: 200000, max_tokens: 64000, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'claude-haiku-4-5',  display_name: 'Claude Haiku 4.5',  context_window: 200000, max_tokens: 16000, input_types: '["text","image"]', supports_vision: 1 },
    ],
  },
  {
    matchUrls: ['generativelanguage.googleapis.com', 'googleapis.com'],
    suggestName: 'gemini',
    api: 'gemini',
    models: [
      { model_id: 'gemini-2.5-pro',   display_name: 'Gemini 2.5 Pro',   context_window: 1048576, max_tokens: 65536, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', context_window: 1048576, max_tokens: 65536, input_types: '["text","image"]', supports_vision: 1 },
      { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', context_window: 1048576, max_tokens: 8192,  input_types: '["text","image"]', supports_vision: 1 },
    ],
  },
]

/**
 * 根据 baseUrl 推断 provider 配置
 * @returns { suggestName, api, models } 或 null
 */
export function detectProvider(baseUrl) {
  if (!baseUrl) return null
  const lower = baseUrl.toLowerCase()
  return KNOWN_PROVIDERS.find(p => p.matchUrls.some(u => lower.includes(u))) ?? null
}
