/**
 * API 客户端测试
 * 验证 API 调用、错误处理、请求格式
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createOpc,
  updateOpc,
  deleteOpc,
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getOpc,
  getAllOpcs,
  setCurrentOpc,
  getOpcStats,
} from '../../lib/api'

// Use globalThis for cross-environment compatibility (Node.js + browser)
const globalFetch = globalThis.fetch

describe('API Client', () => {
  const originalFetch = globalFetch
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch as any
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('OPC API', () => {
    describe('getAllOpcs', () => {
      it('获取 OPC 列表', async () => {
        const mockOpcs = [
          { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1' },
          { id: 'opc-2', name: 'opc-2', display_name: 'OPC 2' },
        ]
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockOpcs,
        } as any)

        const result = await getAllOpcs()

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/get_all_opcs',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        )
        expect(result).toEqual(mockOpcs)
      })

      it('空列表时返回空数组', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as any)

        const result = await getAllOpcs()
        expect(result).toEqual([])
      })
    })

    describe('getOpc', () => {
      it('获取单个 OPC 详情', async () => {
        const mockOpc = {
          id: 'opc-123',
          name: 'test-opc',
          display_name: 'Test OPC',
          description: 'Test description',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockOpc,
        } as any)

        const result = await getOpc('opc-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/get_opc',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'opc-123' }),
          }
        )
        expect(result).toEqual(mockOpc)
      })
    })

    describe('createOpc', () => {
      it('创建新 OPC', async () => {
        const mockOpcId = 'opc-new-123'
        const opcData = {
          id: 'opc-new-123',
          name: 'new-opc',
          display_name: 'New OPC',
          description: 'A new team',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockOpcId,
        } as any)

        const result = await createOpc(opcData as any)

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/create_opc',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: opcData }),
          }
        )
        expect(result).toBe(mockOpcId)
      })

      it('处理创建失败', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () => 'OPC name already exists',
        } as any)

        await expect(
          createOpc({ id: 'dup', name: 'dup', display_name: 'Dup' } as any)
        ).rejects.toThrow('OPC name already exists')
      })
    })

    describe('updateOpc', () => {
      it('更新 OPC 信息', async () => {
        const updatedData = {
          id: 'opc-123',
          name: 'updated-opc',
          display_name: 'Updated OPC',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => undefined,
        } as any)

        await updateOpc('opc-123', updatedData as any)

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/update_opc',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'opc-123', config: updatedData }),
          }
        )
      })
    })

    describe('deleteOpc', () => {
      it('删除 OPC', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => undefined,
        } as any)

        await deleteOpc('opc-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/delete_opc',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'opc-123' }),
          }
        )
      })
    })

    describe('setCurrentOpc', () => {
      it('设置当前 OPC', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => undefined,
        } as any)

        await setCurrentOpc('opc-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/set_current_opc',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'opc-123' }),
          }
        )
      })
    })

    describe('getOpcStats', () => {
      it('获取 OPC 统计数据', async () => {
        const mockStats = {
          agent_count: 5,
          channel_count: 2,
          message_count_today: 100,
          message_growth: 0.15,
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockStats,
        } as any)

        const result = await getOpcStats('opc-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/get_opc_stats',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opc_id: 'opc-123' }),
          }
        )
        expect(result).toEqual(mockStats)
      })
    })
  })

  describe('Agent API', () => {
    describe('getAgents', () => {
      it('获取指定 OPC 的 Agent 列表', async () => {
        const mockAgents = [
          { id: 'agent-1', display_name: 'Agent 1', name: 'agent-1' },
          { id: 'agent-2', display_name: 'Agent 2', name: 'agent-2' },
        ]
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockAgents,
        } as any)

        const result = await getAgents('opc-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/get_agents',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opc_id: 'opc-123' }),
          }
        )
        expect(result).toEqual(mockAgents)
      })

      it('空列表时返回空数组', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as any)

        const result = await getAgents('opc-123')
        expect(result).toEqual([])
      })
    })

    describe('createAgent', () => {
      it('创建新 Agent', async () => {
        const mockAgentId = 'agent-456'
        const agentData = {
          opc_id: 'opc-123',
          name: 'new-agent',
          display_name: 'New Agent',
          job_title: 'Developer',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => mockAgentId,
        } as any)

        const result = await createAgent(agentData as any)

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/create_agent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: agentData }),
          }
        )
        expect(result).toBe(mockAgentId)
      })
    })

    describe('updateAgent', () => {
      it('更新 Agent 信息', async () => {
        const updatedData = {
          id: 'agent-123',
          display_name: 'Updated Agent',
          job_title: 'Senior Developer',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => undefined,
        } as any)

        await updateAgent('agent-123', updatedData as any)

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/update_agent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'agent-123', config: updatedData }),
          }
        )
      })
    })

    describe('deleteAgent', () => {
      it('删除 Agent', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => undefined,
        } as any)

        await deleteAgent('agent-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'http://127.0.0.1:16667/api/delete_agent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'agent-123' }),
          }
        )
      })
    })
  })

  describe('Error Handling', () => {
    it('处理网络错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))

      await expect(getAllOpcs()).rejects.toThrow('Failed to fetch')
    })

    it('处理 HTTP 错误响应 (4xx)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid OPC data',
      } as any)

      await expect(
        createOpc({ id: 'bad', name: 'bad', display_name: 'Bad' } as any)
      ).rejects.toThrow('Invalid OPC data')
    })

    it('处理 HTTP 错误响应 (5xx)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Database connection failed',
      } as any)

      await expect(getAllOpcs()).rejects.toThrow('Database connection failed')
    })

    it('处理非 JSON 错误响应', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Plain text error',
      } as any)

      await expect(getAllOpcs()).rejects.toThrow('Plain text error')
    })

    it('处理 JSON 解析错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'not valid json',
      } as any)

      // 应该回退到 text
      await expect(getAllOpcs()).rejects.toThrow('not valid json')
    })
  })

  describe('Request Format', () => {
    it('所有请求使用正确的 Content-Type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any)

      await getAllOpcs()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('所有请求使用 POST 方法', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any)

      await getAllOpcs()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })
})
