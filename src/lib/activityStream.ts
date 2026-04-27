/**
 * Activity Stream - SSE (browser dev mode) or WebSocket (Tauri mode) client
 * for real-time agent activities.
 */

export interface ActivityEvent {
  agent_id: string
  run_id: string
  stream: 'lifecycle' | 'tool' | 'assistant' | 'error'
  ts: number
  data: Record<string, unknown>
}

export type ActivityCallback = (event: ActivityEvent) => void

const IS_TAURI = '__TAURI_INTERNALS__' in window
const DAEMON_WS_URL = 'ws://127.0.0.1:16668/ws/activities'

let eventSource: EventSource | null = null
let ws: WebSocket | null = null
const callbacks = new Set<ActivityCallback>()

/**
 * Fetch the daemon bearer token from the local server. The browser WebSocket
 * API has no way to set an Authorization header (W3C limitation), so the
 * daemon's /ws/activities accepts the token via `?token=` query string and
 * validates it in constant time. The server proxies the token because it can
 * read `~/.clawpilot/daemon.key` and the frontend cannot.
 */
async function fetchDaemonToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/daemon_token')
    if (!res.ok) return null
    const data = await res.json() as { token?: string }
    return data.token ?? null
  } catch {
    return null
  }
}

function dispatchEvent(event: ActivityEvent) {
  callbacks.forEach(cb => cb(event))
}

// ── SSE (dev mode) ────────────────────────────────────────────────────────────

function connectSSE(): void {
  if (eventSource) return

  eventSource = new EventSource('/api/activities/stream')

  eventSource.onopen = () => {
    console.log('[ActivityStream] SSE connected')
  }

  eventSource.onmessage = (e) => {
    try {
      dispatchEvent(JSON.parse(e.data) as ActivityEvent)
    } catch (err) {
      console.error('[ActivityStream] Parse error:', err)
    }
  }

  eventSource.onerror = () => {
    if (eventSource?.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        disconnectSSE()
        if (callbacks.size > 0) connectSSE()
      }, 3000)
    }
  }
}

function disconnectSSE(): void {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

// ── WebSocket (Tauri mode) ────────────────────────────────────────────────────

async function connectWS(): Promise<void> {
  if (ws && ws.readyState !== WebSocket.CLOSED) return

  const token = await fetchDaemonToken()
  if (!token) {
    console.warn('[ActivityStream] daemon token unavailable, retrying in 3s')
    if (callbacks.size > 0) setTimeout(() => { void connectWS() }, 3000)
    return
  }

  ws = new WebSocket(`${DAEMON_WS_URL}?token=${encodeURIComponent(token)}`)

  ws.onopen = () => {
    console.log('[ActivityStream] WebSocket connected to daemon')
  }

  ws.onmessage = (e) => {
    try {
      dispatchEvent(JSON.parse(e.data) as ActivityEvent)
    } catch (err) {
      console.error('[ActivityStream] Parse error:', err)
    }
  }

  ws.onclose = () => {
    ws = null
    if (callbacks.size > 0) {
      setTimeout(() => { void connectWS() }, 3000)
    }
  }

  ws.onerror = () => {
    // onclose will fire after onerror; reconnect handled there
  }
}

function disconnectWS(): void {
  if (ws) {
    ws.close()
    ws = null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function connectActivityStream(): void {
  if (IS_TAURI) {
    void connectWS()
  } else {
    connectSSE()
  }
}

export function disconnectActivityStream(): void {
  if (IS_TAURI) {
    disconnectWS()
  } else {
    disconnectSSE()
  }
}

export function subscribeToActivities(callback: ActivityCallback): () => void {
  callbacks.add(callback)

  if (callbacks.size === 1) {
    connectActivityStream()
  }

  return () => {
    callbacks.delete(callback)
    if (callbacks.size === 0) {
      disconnectActivityStream()
    }
  }
}

export function getActivityStreamStatus(): 'connected' | 'connecting' | 'disconnected' {
  if (IS_TAURI) {
    if (!ws) return 'disconnected'
    switch (ws.readyState) {
      case WebSocket.OPEN: return 'connected'
      case WebSocket.CONNECTING: return 'connecting'
      default: return 'disconnected'
    }
  } else {
    if (!eventSource) return 'disconnected'
    switch (eventSource.readyState) {
      case EventSource.OPEN: return 'connected'
      case EventSource.CONNECTING: return 'connecting'
      default: return 'disconnected'
    }
  }
}
