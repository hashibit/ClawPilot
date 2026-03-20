import { createWriteStream, mkdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'logs')
mkdirSync(ROOT, { recursive: true })

// ── Stream pool ────────────────────────────────────────────
const streams = {}

function getStream(name) {
  if (!streams[name]) {
    streams[name] = createWriteStream(join(ROOT, `${name}.log`), { flags: 'a' })
  }
  return streams[name]
}

// ── Core write ─────────────────────────────────────────────
function write(module, level, msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}] ${msg}\n`

  // always write to combined
  getStream('combined').write(line)

  // write to module file
  getStream(module).write(line)

  // errors also go to error.log
  if (level === 'error') getStream('error').write(line)

  // console output
  const short = `[${ts.slice(11, 19)}] [${level.toUpperCase().padEnd(5)}] [${module}] ${msg}`
  if (level === 'error') console.error(short)
  else console.log(short)
}

// ── Per-module logger factory ───────────────────────────────
export function createLogger(module) {
  return {
    info:  (msg) => write(module, 'info',  msg),
    warn:  (msg) => write(module, 'warn',  msg),
    error: (msg) => write(module, 'error', msg),
    debug: (msg) => write(module, 'debug', msg),
  }
}

// ── Access log middleware ───────────────────────────────────
const accessStream = getStream('access')

export function accessLogger(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const line = `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms\n`
    accessStream.write(line)
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
  })
  next()
}
