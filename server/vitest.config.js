import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['routes/**', 'db.js', 'logger.js'],
      thresholds: { lines: 85, functions: 85 }
    },
    // 每个测试文件独立 worker，避免 db 状态泄漏
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } }
  }
})
