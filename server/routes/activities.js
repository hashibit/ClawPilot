/**
 * Activities route - SSE endpoint for real-time agent activity streaming
 *
 * Connects to daemon WebSocket and forwards events to frontend via Server-Sent Events.
 */

import { Router } from 'express'
import WebSocket from 'ws'
import { createLogger } from '../logger.js'

const log = createLogger('activities')
const router = Router()

// Daemon WebSocket URL
const DAEMON_WS_URL = process.env.DAEMON_WS_URL || 'ws://127.0.0.1:16668/ws/activities'

// Connected SSE clients
const sseClients = new Set()

// Daemon WebSocket connection
let daemonWs = null
let reconnectTimer = null
let lastErrorTime = 0  // Throttle error logs

/**
 * Connect to daemon WebSocket
 */
function connectToDaemon() {
  if (daemonWs && daemonWs.readyState === WebSocket.OPEN) {
    return
  }

  // Don't log every connection attempt
  const now = Date.now()
  if (now - lastErrorTime > 60000) {  // Only log once per minute
    log.info(`Connecting to daemon WebSocket: ${DAEMON_WS_URL}`)
  }

  try {
    daemonWs = new WebSocket(DAEMON_WS_URL)

    daemonWs.on('open', () => {
      log.info('Connected to daemon WebSocket')
      lastErrorTime = 0  // Reset error throttle on success
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    })

    daemonWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString())
        broadcastToSSE(event)
      } catch (e) {
        log.error('Failed to parse daemon message:', e.message)
      }
    })

    daemonWs.on('close', () => {
      // Only log if we had connected successfully
      if (lastErrorTime === 0) {
        log.info('Daemon WebSocket connection closed')
      }
      daemonWs = null
      scheduleReconnect()
    })

    daemonWs.on('error', (err) => {
      daemonWs = null
      // Throttle error logs - only log once per minute
      if (now - lastErrorTime > 60000) {
        log.warn('Daemon WebSocket not available:', err.message)
        lastErrorTime = now
      }
      scheduleReconnect()
    })
  } catch (e) {
    if (now - lastErrorTime > 60000) {
      log.warn('Failed to connect to daemon:', e.message)
      lastErrorTime = now
    }
    scheduleReconnect()
  }
}

/**
 * Schedule reconnection to daemon
 */
function scheduleReconnect() {
  if (reconnectTimer) return
  // Only reconnect if there are SSE clients
  if (sseClients.size === 0) {
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    // Check again before reconnecting
    if (sseClients.size > 0) {
      connectToDaemon()
    }
  }, 5000)
}

/**
 * Broadcast event to all connected SSE clients
 */
function broadcastToSSE(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(data)
    } catch (e) {
      // Client might be disconnected
      sseClients.delete(client)
    }
  }
}

/**
 * GET /api/activities/stream - SSE endpoint for activity events
 */
router.get('/activities/stream', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

  // Send initial connection message
  res.write(': connected\n\n')

  // Add client to set
  sseClients.add(res)
  log.info(`SSE client connected, total clients: ${sseClients.size}`)

  // Ensure daemon connection
  connectToDaemon()

  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(res)
    log.info(`SSE client disconnected, total clients: ${sseClients.size}`)
  })
})

/**
 * GET /api/activities/status - Get current connection status
 */
router.get('/activities/status', (req, res) => {
  res.json({
    daemon_connected: daemonWs && daemonWs.readyState === WebSocket.OPEN,
    sse_clients: sseClients.size
  })
})

// Don't auto-connect on module load - only connect when needed (when SSE client connects)

export function createActivitiesRouter() {
  return router
}