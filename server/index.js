import express from 'express'
import cors from 'cors'
import { createLogger } from './logger.js'
import { createDao } from './dao.js'

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
import { createSkillRouter, registerBundleSkills } from './routes/skill.js'
import { createSettingsRouter } from './routes/settings.js'
import { createActivitiesRouter } from './routes/activities.js'

const log = createLogger('server')

// ── App Factory ────────────────────────────────────────────

export function createApp(db) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  const dao = createDao(db)

  // Health check — lets other services verify the server is up and DB is reachable
  app.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get()
      res.json({ ok: true, db: 'ok' })
    } catch (err) {
      res.status(503).json({ ok: false, error: err.message })
    }
  })

  // Mount routes with injected db and dao
  app.use('/api', createOpcRouter(db, dao))
  app.use('/api', createAgentRouter(db, dao))
  app.use('/api', createModelRouter(db, dao))
  app.use('/api', createChannelRouter(db, dao))
  app.use('/api', createBindingRouter(db, dao))
  app.use('/api', createDeploymentRouter(db, dao))
  app.use('/api', createLogRouter(db))
  app.use('/api', createSnapshotRouter(db, dao))
  app.use('/api', createAiRouter(db, dao))
  app.use('/api', createOfficeRouter(db, dao))
  app.use('/api', createProcessRouter(db, dao))
  app.use('/api', createToolRouter(db, dao))
  app.use('/api', createSkillRouter(db, dao))
  app.use('/api', createSettingsRouter(db, dao))
  app.use('/api', createActivitiesRouter())

  // Error handling middleware (must be after all routes)
  app.use((err, req, res, _next) => {
    const status = err.status || 500
    const message = err.message || 'Internal server error'
    console.error(`[${req.method}] ${req.path} - ${status}: ${message}`)
    res.status(status).json({ error: message })
  })

  return app
}

// ── Production Startup ─────────────────────────────────────

async function main() {
  // Support --db <path> CLI arg to use a custom database path
  const dbArgIdx = process.argv.indexOf('--db')
  if (dbArgIdx !== -1 && process.argv[dbArgIdx + 1]) {
    process.env.CLAWPILOT_DB_PATH = process.argv[dbArgIdx + 1]
  }

  const { default: db, DB_PATH } = await import('./db.js')
  const { accessLogger } = await import('./logger.js')

  // 注册 bundle 中的技能到数据库
  await registerBundleSkills(db)

  const app = createApp(db)
  app.use(accessLogger)

  // Verify DB is accessible before accepting traffic
  try {
    db.prepare('SELECT 1').get()
    log.info('DB connectivity check passed')
  } catch (err) {
    log.error(`DB connectivity check FAILED: ${err.message}`)
    process.exit(1)
  }

  const PORT = process.env.PORT || 16667
  app.listen(PORT, '127.0.0.1', () => {
    log.info(`listening on http://127.0.0.1:${PORT}`)
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
