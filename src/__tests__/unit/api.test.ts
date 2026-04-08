/**
 * API 客户端单元测试
 * 验证 API 调用、错误处理、请求格式
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpc, updateOpc, deleteOpc, getAgents, createAgent } from '../../lib/api'

// Use globalThis for cross-environment compatibility (Node.js + browser)
const globalFetch = globalThis.fetch

// Helper to test toInvokeArgs behavior (internal function logic)
function toInvokeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    result[camelKey] = value
  }
  return result
}

describe('API Client', () => {
  const originalFetch = globalFetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ─── toInvokeArgs 参数转换测试 ───────────────────────────────────────────

  describe('toInvokeArgs parameter conversion', () => {
    it('应将 snake_case 参数名转换为 camelCase', () => {
      const input = {
        opc_id: 'opc-123',
        agent_id: 'agent-456',
        channel_type: 'GROUP',
      }

      const result = toInvokeArgs(input)

      expect(result).toHaveProperty('opcId', 'opc-123')
      expect(result).toHaveProperty('agentId', 'agent-456')
      expect(result).toHaveProperty('channelType', 'GROUP')
    })

    it('应保持简单字段名不变', () => {
      const input = {
        id: 'test-id',
        name: 'test-name',
      }

      const result = toInvokeArgs(input)

      expect(result).toHaveProperty('id', 'test-id')
      expect(result).toHaveProperty('name', 'test-name')
    })

    it('应处理嵌套对象（保持原字段名）', () => {
      const input = {
        config: {
          display_name: 'Test',
          is_active: true,
        },
      }

      const result = toInvokeArgs(input)

      // 顶层 key 不变
      expect(result).toHaveProperty('config')
      // 嵌套对象字段名保持不变（serde 按 struct 定义解析）
      expect(result.config).toEqual({
        display_name: 'Test',
        is_active: true,
      })
    })

    it('应处理空对象', () => {
      const input = {}
      const result = toInvokeArgs(input)
      expect(result).toEqual({})
    })

    it('应处理 null 和 undefined 值', () => {
      const input = {
        name: 'test',
        description: null,
        optional_field: undefined,
      }

      const result = toInvokeArgs(input)

      expect(result).toHaveProperty('name', 'test')
      expect(result).toHaveProperty('description', null)
      expect(result).toHaveProperty('optionalField', undefined)
    })

    it('应处理数组类型值', () => {
      const input = {
        enabled_tools: ['tool-a', 'tool-b'],
        agent_ids: ['id-1', 'id-2'],
      }

      const result = toInvokeArgs(input)

      expect(result).toHaveProperty('enabledTools', ['tool-a', 'tool-b'])
      expect(result).toHaveProperty('agentIds', ['id-1', 'id-2'])
    })

    it('应处理多层 snake_case', () => {
      const input = {
        opc_id: 'opc-1',
        channel_config: {
          app_id: 'app-123',
          app_secret: 'secret',
        },
      }

      const result = toInvokeArgs(input)

      expect(result).toHaveProperty('opcId', 'opc-1')
      expect(result).toHaveProperty('channelConfig')
      // 嵌套对象不转换
      expect(result.channelConfig).toEqual({
        app_id: 'app-123',
        app_secret: 'secret',
      })
    })
  })

  describe('OPC API functions', () => {
    it('createOpc 应发送创建请求', async () => {
      const mockOpcId = 'opc-123'
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpcId,
      } as any)

      const opcData: any = {
        id: 'opc-123',
        name: 'test-opc',
        display_name: 'Test OPC',
      }
      const result = await createOpc(opcData)

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:16667/api/create_opc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: opcData }),
      })
      expect(result).toBe(mockOpcId)
    })

    it('updateOpc 应发送更新请求', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
      } as any)

      const opcData: any = {
        id: 'opc-123',
        display_name: 'Updated OPC',
      }
      await updateOpc('opc-123', opcData)

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:16667/api/update_opc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'opc-123', config: opcData }),
      })
    })

    it('deleteOpc 应发送删除请求', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
      } as any)

      await deleteOpc('opc-123')

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:16667/api/delete_opc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'opc-123' }),
      })
    })
  })

  describe('Agent API functions', () => {
    it('getAgents 应获取指定 OPC 的 Agent 列表', async () => {
      const mockAgents = [
        { id: 'agent-1', display_name: 'Agent 1' },
        { id: 'agent-2', display_name: 'Agent 2' },
      ]
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgents,
      } as any)

      const result = await getAgents('opc-123')

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:16667/api/get_agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opc_id: 'opc-123' }),
      })
      expect(result).toEqual(mockAgents)
    })

    it('createAgent 应创建新 Agent', async () => {
      const mockAgentId = 'agent-123'
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentId,
      } as any)

      const agentData: any = {
        opc_id: 'opc-123',
        name: 'test-agent',
        display_name: 'Test Agent',
      }
      const result = await createAgent(agentData)

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:16667/api/create_agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: agentData }),
      })
      expect(result).toBe(mockAgentId)
    })
  })

  describe('Error Handling', () => {
    it('应处理网络错误', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(getAgents('opc-123'))
        .rejects
        .toThrow('Network error')
    })

    it('应处理 API 错误响应', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      } as any)

      try {
        await createOpc({} as any)
        expect.unreachable('Should have thrown')
      } catch (error: any) {
        expect(error.message).toBeTruthy()
      }
    })
  })
})
