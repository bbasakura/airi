const DEFAULT_COMPANION_BASE_URL = 'http://127.0.0.1:17321'
const AVATAR_EVENT_TYPES = ['state', 'audio-level', 'animation', 'audio-play'] as const

interface EventSourceLike {
  addEventListener: (type: string, listener: EventListener) => void
  close: () => void
}

interface ConnectLocalCompanionEventsOptions {
  baseUrl?: string
  eventSourceFactory?: (url: string) => EventSourceLike
  retryDelayMs?: number
  setTimeoutImpl?: typeof setTimeout
  clearTimeoutImpl?: typeof clearTimeout
  onConnectionChange: (connected: boolean) => void
  onEvent: (event: unknown) => void
}

export function connectLocalCompanionEvents({
  baseUrl = DEFAULT_COMPANION_BASE_URL,
  eventSourceFactory = url => new EventSource(url),
  retryDelayMs = 1000,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onConnectionChange,
  onEvent,
}: ConnectLocalCompanionEventsOptions) {
  const eventsUrl = `${baseUrl.replace(/\/+$/, '')}/v1/avatar/events`
  let activeSource: EventSourceLike | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let activeAudio: HTMLAudioElement | undefined

  function scheduleReconnect() {
    if (disposed || retryTimer)
      return

    retryTimer = setTimeoutImpl(() => {
      retryTimer = undefined
      connect()
    }, retryDelayMs)
  }

  function connect() {
    if (disposed)
      return

    let source: EventSourceLike
    try {
      source = eventSourceFactory(eventsUrl)
    }
    catch {
      onConnectionChange(false)
      scheduleReconnect()
      return
    }

    activeSource = source
    source.addEventListener('open', () => {
      if (activeSource === source)
        onConnectionChange(true)
    })
    source.addEventListener('error', () => {
      if (activeSource !== source)
        return

      activeSource = undefined
      source.close()
      onConnectionChange(false)
      scheduleReconnect()
    })
    for (const type of AVATAR_EVENT_TYPES) {
      source.addEventListener(type, ((event: MessageEvent<string>) => {
        if (activeSource !== source)
          return

        try {
          const parsed = JSON.parse(event.data)
          if (parsed?.type === 'audio-play' && typeof parsed.audioPath === 'string') {
            activeAudio?.pause()
            const audio = new Audio(`${baseUrl.replace(/\/+$/, '')}${parsed.audioPath}`)
            activeAudio = audio
            audio.play().catch((error) => {
              console.warn('[CompanionAvatar] Audio play failed:', error)
            })
          }
          onEvent(parsed)
        }
        catch {
          // Ignore malformed local events and keep the stream alive.
        }
      }) as EventListener)
    }
  }

  onConnectionChange(false)
  connect()

  return () => {
    disposed = true
    if (retryTimer) {
      clearTimeoutImpl(retryTimer)
      retryTimer = undefined
    }
    activeSource?.close()
    activeSource = undefined
    onConnectionChange(false)
  }
}
