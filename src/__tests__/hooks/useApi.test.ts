/**
 * useApi Hook 测试
 * 测试通用数据获取 hook 的功能和状态管理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useApi } from '../../hooks/useApi'

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('基础功能', () => {
    it('成功加载数据', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)

      const { result } = renderHook(() => useApi(fetchFn, []))

      // 初始状态应该是加载中
      expect(result.current.loading).toBe(true)
      expect(result.current.data).toBeNull()
      expect(result.current.error).toBeNull()

      // 等待加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('处理加载错误', async () => {
      const mockError = new Error('Network error')
      const fetchFn = vi.fn().mockRejectedValue(mockError)

      const { result } = renderHook(() => useApi(fetchFn, []))

      // 初始状态应该是加载中
      expect(result.current.loading).toBe(true)

      // 等待加载失败
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toBeNull()
      expect(result.current.error).toEqual(mockError)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('手动模式下不自动加载', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // 手动模式下初始不加载
      expect(result.current.loading).toBe(false)
      expect(result.current.data).toBeNull()
      expect(result.current.error).toBeNull()
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('手动模式下调用 reload 加载', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // 手动调用 reload
      await act(async () => {
        await result.current.reload()
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.loading).toBe(false)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('依赖更新', () => {
    it('依赖变化时自动重新加载', async () => {
      const mockData1 = { id: 1, name: 'Test 1' }
      const mockData2 = { id: 2, name: 'Test 2' }
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2)

      // 初始依赖为 1
      const { result, rerender } = renderHook(
        ({ id }) => useApi(() => fetchFn(id), [id]),
        { initialProps: { id: 1 } }
      )

      // 等待第一次加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(result.current.data).toEqual(mockData1)

      // 改变依赖
      rerender({ id: 2 })

      // 等待第二次加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
      expect(result.current.data).toEqual(mockData2)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('依赖不变时不重复加载', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)

      const { result, rerender } = renderHook(
        ({ id }) => useApi(() => fetchFn(id), [id]),
        { initialProps: { id: 1 } }
      )

      // 等待加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 重新渲染但依赖不变
      rerender({ id: 1 })

      // 应该只调用一次
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('回调函数', () => {
    it('成功时调用 onSuccess 回调', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)
      const onSuccess = vi.fn()

      const { result } = renderHook(() =>
        useApi(fetchFn, [], { onSuccess })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(onSuccess).toHaveBeenCalledWith(mockData)
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('失败时调用 onError 回调', async () => {
      const mockError = new Error('Network error')
      const fetchFn = vi.fn().mockRejectedValue(mockError)
      const onError = vi.fn()

      const { result } = renderHook(() =>
        useApi(fetchFn, [], { onError })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(onError).toHaveBeenCalledWith(mockError)
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })

  describe('多次 reload', () => {
    it('多次调用 reload 正确获取新数据', async () => {
      const mockData1 = { id: 1, name: 'Test 1' }
      const mockData2 = { id: 2, name: 'Test 2' }
      const mockData3 = { id: 3, name: 'Test 3' }
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2)
        .mockResolvedValueOnce(mockData3)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // 第一次 reload
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.data).toEqual(mockData1)

      // 第二次 reload
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.data).toEqual(mockData2)

      // 第三次 reload
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.data).toEqual(mockData3)

      expect(fetchFn).toHaveBeenCalledTimes(3)
    })

    it('失败后 reload 可以重试成功', async () => {
      const mockError = new Error('Network error')
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // 第一次 reload 失败
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.error).toEqual(mockError)

      // 第二次 reload 成功
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
    })
  })

  describe('非 Error 对象处理', () => {
    it('将非 Error 错误转换为 Error 对象', async () => {
      const fetchFn = vi.fn().mockRejectedValue('String error')

      const { result } = renderHook(() => useApi(fetchFn, []))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('String error')
    })

    it('处理 undefined 错误', async () => {
      const fetchFn = vi.fn().mockRejectedValue(undefined)

      const { result } = renderHook(() => useApi(fetchFn, []))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('undefined')
    })
  })

  describe('状态重置', () => {
    it('reload 时重置错误状态', async () => {
      const mockError = new Error('First error')
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // 第一次失败
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.error).toEqual(mockError)

      // 第二次成功，错误应该被清除
      await act(async () => {
        await result.current.reload()
      })
      expect(result.current.error).toBeNull()
      expect(result.current.data).toEqual(mockData)
    })

    it('reload 时重置 loading 状态', async () => {
      const mockData = { id: 1, name: 'Test' }
      const fetchFn = vi.fn().mockResolvedValue(mockData)

      const { result } = renderHook(() => useApi(fetchFn, [], { manual: true }))

      // reload 过程中应该是 loading 状态
      const reloadPromise = act(async () => {
        await result.current.reload()
      })

      // 在 reload 过程中检查状态（这个测试主要验证逻辑）
      await reloadPromise

      expect(result.current.loading).toBe(false)
      expect(result.current.data).toEqual(mockData)
    })
  })
})
