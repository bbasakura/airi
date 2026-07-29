export class CompanionError extends Error {
  constructor(message, { code = 'COMPANION_ERROR', status = 500, cause } = {}) {
    super(message, { cause })
    this.name = 'CompanionError'
    this.code = code
    this.status = status
  }
}

export async function createUpstreamError(response, service) {
  let detail = ''
  try {
    detail = (await response.text()).trim().slice(0, 1000)
  }
  catch {
    detail = ''
  }

  const suffix = detail ? `: ${detail}` : ''
  return new CompanionError(
    `${service} returned HTTP ${response.status}${suffix}`,
    {
      code: 'UPSTREAM_ERROR',
      status: 502,
    },
  )
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR'
    || /aborted|aborterror/i.test(error?.message || '')
}

export function abortableDelay(milliseconds, signal) {
  if (signal?.aborted)
    return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'))

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)

    function onAbort() {
      clearTimeout(timeout)
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function toErrorPayload(error) {
  return {
    code: error?.code || 'INTERNAL_ERROR',
    message: error?.message || 'Unknown error',
  }
}
