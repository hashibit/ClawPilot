/**
 * API 客户端单元测试
 * 验证 API 调用、错误处理、请求格式
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOpc, updateOpc, deleteOpc, getAgents, createAgent } from '../../lib/api'

describe('API Client', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('OPC API functions', () => {
    it('createOpc 应发送创建请求', async () => {
      const mockOpcId = 'opc-123'
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOpcId,
      } as any)

      const opcData: any = {
        id: 'opc-123',
        name: 'test-opc',
        display_name: 'Test OPC',
      }
      const result = await createOpc(opcData)

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/create_opc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: opcData }),
      })
      expect(result).toBe(mockOpcId)
    })

    it('updateOpc 应发送更新请求', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
      } as any)

      const opcData: any = {
        id: 'opc-123',
        display_name: 'Updated OPC',
      }
      await updateOpc('opc-123', opcData)

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/update_opc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'opc-123', config: opcData }),
      })
    })

    it('deleteOpc 应发送删除请求', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
      } as any)

      await deleteOpc('opc-123')

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/delete_opc', {
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
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgents,
      } as any)

      const result = await getAgents('opc-123')

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/get_agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opc_id: 'opc-123' }),
      })
      expect(result).toEqual(mockAgents)
    })

    it('createAgent 应创建新 Agent', async () => {
      const mockAgentId = 'agent-123'
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgentId,
      } as any)

      const agentData: any = {
        opc_id: 'opc-123',
        name: 'test-agent',
        display_name: 'Test Agent',
      }
      const result = await createAgent(agentData)

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/api/create_agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: agentData }),
      })
      expect(result).toBe(mockAgentId)
    })
  })

  describe('Error Handling', () => {
    it('应处理网络错误', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(getAgents('opc-123'))
        .rejects
        .toThrow('Network error')
    })

    it('应处理 API 错误响应', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
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
