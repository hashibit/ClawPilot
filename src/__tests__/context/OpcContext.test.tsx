/**
 * OpcContext 测试
 * 测试 OPC 状态管理的正确性
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { OpcProvider, useOpc } from '../../contexts/OpcContext'
import * as api from '../../lib/api'

// Mock API 模块
vi.mock('../../lib/api', () => ({
  getAllOpcs: vi.fn(),
  setCurrentOpc: vi.fn(),
}))

// 测试用组件
function TestConsumer() {
  const { opcs, currentOpc, loading, reload, selectOpc } = useOpc()

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="opc-count">{opcs.length}</div>
      <div data-testid="current-opc">{currentOpc?.name || 'none'}</div>
      <button onClick={() => reload()} data-testid="reload-btn">Reload</button>
      <button
        onClick={() => selectOpc({ id: 'opc-2', name: 'opc-2', display_name: 'OPC 2' } as any)}
        data-testid="select-opc-btn"
      >
        Select OPC
      </button>
    </div>
  )
}

function renderWithContext() {
  return render(
    <OpcProvider>
      <TestConsumer />
    </OpcProvider>
  )
}

describe('OpcContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('OpcProvider', () => {
    it('初始化时加载 OPC 列表', async () => {
      vi.mocked(api.getAllOpcs).mockResolvedValue([
        { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1' },
        { id: 'opc-2', name: 'opc-2', display_name: 'OPC 2' },
      ] as any)

      renderWithContext()

      // 初始状态应该是 loading
      expect(screen.getByTestId('loading')).toHaveTextContent('loading')

      // 等待加载完成
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      // 验证 OPC 列表加载
      expect(screen.getByTestId('opc-count')).toHaveTextContent('2')
    })

    it('加载失败时不崩溃', async () => {
      vi.mocked(api.getAllOpcs).mockRejectedValue(new Error('Network error'))

      renderWithContext()

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      // 失败时应该是空列表
      expect(screen.getByTestId('opc-count')).toHaveTextContent('0')
    })

    it('空列表时 currentOpc 为 null', async () => {
      vi.mocked(api.getAllOpcs).mockResolvedValue([])

      renderWithContext()

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      expect(screen.getByTestId('current-opc')).toHaveTextContent('none')
    })

    it('自动选择第一个 OPC 作为当前 OPC', async () => {
      vi.mocked(api.getAllOpcs).mockResolvedValue([
        { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1' },
        { id: 'opc-2', name: 'opc-2', display_name: 'OPC 2' },
      ] as any)

      renderWithContext()

      await waitFor(() => {
        expect(screen.getByTestId('current-opc')).toHaveTextContent('opc-1')
      })
    })

    it('自动选择 is_active 的 OPC 作为当前 OPC', async () => {
      vi.mocked(api.getAllOpcs).mockResolvedValue([
        { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1', is_active: false },
        { id: 'opc-2', name: 'opc-2', display_name: 'OPC 2', is_active: true },
      ] as any)

      renderWithContext()

      await waitFor(() => {
        expect(screen.getByTestId('current-opc')).toHaveTextContent('opc-2')
      })
    })
  })

  describe('selectOpc', () => {
    it('切换当前 OPC', async () => {
      vi.mocked(api.getAllOpcs).mockResolvedValue([
        { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1' },
        { id: 'opc-2', name: 'opc-2', display_name: 'OPC 2' },
      ] as any)
      vi.mocked(api.setCurrentOpc).mockResolvedValue(undefined)

      renderWithContext()

      await waitFor(() => {
        expect(screen.getByTestId('current-opc')).toHaveTextContent('opc-1')
      })

      // 点击切换按钮
      screen.getByTestId('select-opc-btn').click()

      // 验证 API 调用
      expect(api.setCurrentOpc).toHaveBeenCalledWith('opc-2')

      // 验证状态更新
      await waitFor(() => {
        expect(screen.getByTestId('current-opc')).toHaveTextContent('opc-2')
      })
    })
  })

  describe('reload', () => {
    it('手动重新加载 OPC 列表', async () => {
      // 第一次返回空列表
      vi.mocked(api.getAllOpcs).mockResolvedValueOnce([])
      // 第二次返回有数据
      vi.mocked(api.getAllOpcs).mockResolvedValueOnce([
        { id: 'opc-1', name: 'opc-1', display_name: 'OPC 1' },
      ] as any)

      renderWithContext()

      // 初始为空
      await waitFor(() => {
        expect(screen.getByTestId('opc-count')).toHaveTextContent('0')
      })

      // 点击重新加载
      screen.getByTestId('reload-btn').click()

      // 验证重新加载
      await waitFor(() => {
        expect(screen.getByTestId('opc-count')).toHaveTextContent('1')
      })

      // 验证 API 被调用两次
      expect(api.getAllOpcs).toHaveBeenCalledTimes(2)
    })
  })

  describe('useOpc hook', () => {
    it('在 Provider 外部使用抛出错误', () => {
      // 抑制控制台错误输出
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      function BrokenComponent() {
        useOpc()
        return null
      }

      expect(() => {
        render(<BrokenComponent />)
      }).toThrow('useOpc must be used within OpcProvider')

      consoleSpy.mockRestore()
    })
  })
})
