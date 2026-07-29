export function createCompanionEvent(type, context, payload = {}, now = () => new Date()) {
  return {
    ...context,
    ...payload,
    type,
    at: now().toISOString(),
  }
}

export function serializeSse(event) {
  const eventId = [event.turnId, event.sequence]
    .filter(value => value != null)
    .join(':')
    .replace(/[\r\n]/g, '')

  const idLine = eventId ? `id: ${eventId}\n` : ''
  return `${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
