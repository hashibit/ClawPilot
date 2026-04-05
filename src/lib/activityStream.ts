/**
 * Activity Stream - SSE client for real-time agent activities
 */

export interface ActivityEvent {
  agent_id: string
  run_id: string
  stream: 'lifecycle' | 'tool' | 'assistant' | 'error'
  ts: number
  data: Record<string, unknown>
}

export type ActivityCallback = (event: ActivityEvent) => void

let eventSource: EventSource | null = null
const callbacks = new Set<ActivityCallback>()

/**
 * Connect to the activity SSE stream
 */
export function connectActivityStream(): void {
  if (eventSource) return

  eventSource = new EventSource('/api/activities/stream')

  eventSource.onopen = () => {
    console.log('[ActivityStream] Connected')
  }

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as ActivityEvent
      callbacks.forEach(cb => cb(event))
    } catch (err) {
      console.error('[ActivityStream] Parse error:', err)
    }
  }

  eventSource.onerror = () => {
    console.log('[ActivityStream] Connection lost, reconnecting...')
    // EventSource will auto-reconnect, but we can also manually handle it
    if (eventSource?.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        disconnectActivityStream()
        connectActivityStream()
      }, 3000)
    }
  }
}

/**
 * Disconnect from the activity stream
 */
export function disconnectActivityStream(): void {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

/**
 * Subscribe to activity events
 */
export function subscribeToActivities(callback: ActivityCallback): () => void {
  callbacks.add(callback)

  // Auto-connect on first subscriber
  if (callbacks.size === 1) {
    connectActivityStream()
  }

  // Return unsubscribe function
  return () => {
    callbacks.delete(callback)
    // Auto-disconnect when no subscribers
    if (callbacks.size === 0) {
      disconnectActivityStream()
    }
  }
}

/**
 * Get connection status
 */
export function getActivityStreamStatus(): 'connected' | 'connecting' | 'disconnected' {
  if (!eventSource) return 'disconnected'
  switch (eventSource.readyState) {
    case EventSource.OPEN: return 'connected'
    case EventSource.CONNECTING: return 'connecting'
    default: return 'disconnected'
  }
}