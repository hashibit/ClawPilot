import express from 'express'
import cors from 'cors'
import { createLogger } from './logger.js'

// Route factory imports
import { createOpcRouter } from './routes/opc.js'
import { createAgentRouter } from './routes/agent.js'
import { createModelRouter } from './routes/model.js'
import { createChannelRouter } from './routes/channel.js'
import { createBindingRouter } from './routes/binding.js'
import { createDeploymentRouter } from './routes/deployment.js'
import { createLogRouter } from './routes/log.js'
import { createSnapshotRouter } from './routes/snapshot.js'
import { createAiRouter } from './routes/ai.js'
import { createOfficeRouter } from './routes/office.js'
import { createProcessRouter } from './routes/process.js'
import { createToolRouter } from './routes/tool.js'
import { createSkillRouter } from './routes/skill.js'

const log = createLogger('server')

// ── App Factory ────────────────────────────────────────────

export function createApp(db) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Mount routes with injected db
  app.use('/api', createOpcRouter(db))
  app.use('/api', createAgentRouter(db))
  app.use('/api', createModelRouter(db))
  app.use('/api', createChannelRouter(db))
  app.use('/api', createBindingRouter(db))
  app.use('/api', createDeploymentRouter(db))
  app.use('/api', createLogRouter(db))
  app.use('/api', createSnapshotRouter(db))
  app.use('/api', createAiRouter(db))
  app.use('/api', createOfficeRouter(db))
  app.use('/api', createProcessRouter(db))
  app.use('/api', createToolRouter(db))
  app.use('/api', createSkillRouter(db))

  return app
}

// ── Production Startup ─────────────────────────────────────

async function main() {
  const { default: db, DB_PATH } = await import('./db.js')
  const { accessLogger } = await import('./logger.js')

  const app = createApp(db)
  app.use(accessLogger)

  const PORT = process.env.PORT || 16667
  app.listen(PORT, '0.0.0.0', () => {
    log.info(`listening on http://0.0.0.0:${PORT}`)
    log.info(`DB: ${DB_PATH}`)
  })
}

// 只在直接运行时启动服务器（不是被导入时）
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main().catch(err => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
