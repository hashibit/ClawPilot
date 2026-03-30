import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

// localStorage mock（jsdom 在 --localstorage-file 路径无效时接口不完整）
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
})()

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
})

// Node.js 25+ 原生 localStorage 在 --localstorage-file 无效时 getItem 不可用，使用内存实现覆盖
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  const _storage: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => _storage[key] ?? null,
      setItem: (key: string, value: string) => { _storage[key] = value },
      removeItem: (key: string) => { delete _storage[key] },
      clear: () => { Object.keys(_storage).forEach(k => delete _storage[k]) },
      get length() { return Object.keys(_storage).length },
      key: (i: number) => Object.keys(_storage)[i] ?? null,
    },
    writable: true,
    configurable: true,
  })
}

// 每个测试后清理
afterEach(() => {
  cleanup()
  localStorageMock.clear()
})
