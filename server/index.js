import express from 'express'
import cors from 'cors'
import { DB_PATH } from './db.js'

import opcRouter from './routes/opc.js'
import agentRouter from './routes/agent.js'
import modelRouter from './routes/model.js'
import channelRouter from './routes/channel.js'
import bindingRouter from './routes/binding.js'
import deploymentRouter from './routes/deployment.js'
import logRouter from './routes/log.js'
import snapshotRouter from './routes/snapshot.js'

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api', opcRouter)
app.use('/api', agentRouter)
app.use('/api', modelRouter)
app.use('/api', channelRouter)
app.use('/api', bindingRouter)
app.use('/api', deploymentRouter)
app.use('/api', logRouter)
app.use('/api', snapshotRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[dev-backend] listening on http://localhost:${PORT}`)
  console.log(`[dev-backend] DB: ${DB_PATH}`)
})
