import express from 'express'
import cors from 'cors'
import { DB_PATH } from './db.js'
import { accessLogger, createLogger } from './logger.js'

import opcRouter from './routes/opc.js'
import agentRouter from './routes/agent.js'
import modelRouter from './routes/model.js'
import channelRouter from './routes/channel.js'
import bindingRouter from './routes/binding.js'
import deploymentRouter from './routes/deployment.js'
import logRouter from './routes/log.js'
import snapshotRouter from './routes/snapshot.js'
import aiRouter from './routes/ai.js'
import officeRouter from './routes/office.js'
import processRouter from './routes/process.js'
import toolRouter from './routes/tool.js'
import skillRouter from './routes/skill.js'

const log = createLogger('server')

const app = express()
app.use(cors())
app.use(express.json())
app.use(accessLogger)

app.use('/api', opcRouter)
app.use('/api', agentRouter)
app.use('/api', modelRouter)
app.use('/api', channelRouter)
app.use('/api', bindingRouter)
app.use('/api', deploymentRouter)
app.use('/api', logRouter)
app.use('/api', snapshotRouter)
app.use('/api', aiRouter)
app.use('/api', officeRouter)
app.use('/api', processRouter)
app.use('/api', toolRouter)
app.use('/api', skillRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  log.info(`listening on http://localhost:${PORT}`)
  log.info(`DB: ${DB_PATH}`)
})
