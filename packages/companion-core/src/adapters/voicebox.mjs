import { CompanionError, abortableDelay, createUpstreamError, isAbortError } from '../errors.mjs'

function toBlob(audio, contentType) {
  if (audio instanceof Blob)
    return audio
  if (audio instanceof ArrayBuffer)
    return new Blob([audio], { type: contentType })
  if (ArrayBuffer.isView(audio))
    return new Blob([audio], { type: contentType })
  throw new CompanionError('Audio must be a Blob, ArrayBuffer, or typed array', {
    code: 'INVALID_AUDIO',
    status: 400,
  })
}

export class VoiceboxClient {
  constructor({
    baseUrl,
    profile = '',
    language = 'zh',
    engine = 'kokoro',
    transcriptionModel = 'base',
    pollIntervalMs = 1000,
    maxPollAttempts = 60,
    fetchImpl = globalThis.fetch,
  }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.profile = profile
    this.language = language
    this.engine = engine
    this.transcriptionModel = transcriptionModel
    this.pollIntervalMs = pollIntervalMs
    this.maxPollAttempts = maxPollAttempts
    this.fetch = fetchImpl
  }

  async listProfiles(signal) {
    const response = await this.fetch(`${this.baseUrl}/profiles`, { signal })
    if (!response.ok)
      throw await createUpstreamError(response, 'Voicebox')

    const profiles = await response.json()
    if (!Array.isArray(profiles))
      throw new CompanionError('Voicebox returned an invalid profile list', { code: 'INVALID_UPSTREAM_RESPONSE', status: 502 })
    return profiles
  }

  async health(signal) {
    const profiles = await this.listProfiles(signal)
    return {
      ok: true,
      profiles: profiles.length,
    }
  }

  async resolveProfile(reference = this.profile, signal, engine = this.engine) {
    const profiles = await this.listProfiles(signal)
    const profile = reference
      ? profiles.find(item =>
          item?.id === reference
          || item?.preset_voice_id === reference
          || item?.name === reference,
        )
      : profiles.find(item =>
          item?.preset_engine === engine
          || item?.default_engine === engine,
        ) || profiles[0]

    if (!profile?.id) {
      throw new CompanionError(
        reference
          ? `Voicebox profile not found: ${reference}`
          : 'Voicebox does not have an available profile',
        { code: 'VOICE_PROFILE_NOT_FOUND', status: 422 },
      )
    }
    return profile
  }

  resolveEngine(profile, requestedEngine = this.engine) {
    return profile?.preset_engine
      || profile?.default_engine
      || requestedEngine
  }

  async transcribe({
    audio,
    filename = 'input.wav',
    contentType = 'audio/wav',
    model = this.transcriptionModel,
    signal,
  }) {
    const form = new FormData()
    form.append('file', toBlob(audio, contentType), filename)
    form.append('model', model)

    let response
    try {
      response = await this.fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        body: form,
        signal,
      })
    }
    catch (error) {
      if (signal?.aborted || isAbortError(error))
        throw error
      throw new CompanionError(`Unable to reach Voicebox transcription: ${error.message}`, {
        code: 'UPSTREAM_UNAVAILABLE',
        status: 502,
        cause: error,
      })
    }

    if (!response.ok)
      throw await createUpstreamError(response, 'Voicebox transcription')

    const data = await response.json()
    const text = String(data?.text || '').trim()
    if (!text)
      throw new CompanionError('Voicebox returned an empty transcript', { code: 'EMPTY_TRANSCRIPT', status: 422 })
    return text
  }

  async speak(text, {
    profile = this.profile,
    language = this.language,
    engine = this.engine,
    signal,
  } = {}) {
    const resolvedProfile = await this.resolveProfile(profile, signal, engine)
    const resolvedEngine = this.resolveEngine(resolvedProfile, engine)
    const response = await this.fetch(`${this.baseUrl}/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        profile: resolvedProfile.id,
        language,
        engine: resolvedEngine,
      }),
      signal,
    })
    if (!response.ok)
      throw await createUpstreamError(response, 'Voicebox speech')

    const created = await response.json()
    if (!created?.id)
      throw new CompanionError('Voicebox speech response did not include a job id', { code: 'INVALID_UPSTREAM_RESPONSE', status: 502 })

    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      if (attempt > 0)
        await abortableDelay(this.pollIntervalMs, signal)

      const statusResponse = await this.fetch(
        `${this.baseUrl}/history/${encodeURIComponent(created.id)}`,
        { signal },
      )
      if (!statusResponse.ok)
        throw await createUpstreamError(statusResponse, 'Voicebox speech status')

      const status = await statusResponse.json()
      if (status?.status === 'completed') {
        return {
          id: created.id,
          status: 'completed',
          audioUrl: `${this.baseUrl}/audio/${encodeURIComponent(created.id)}`,
          profile: resolvedProfile.id,
          engine: resolvedEngine,
          details: status,
        }
      }
      if (status?.status === 'failed') {
        throw new CompanionError(status.error || 'Voicebox speech job failed', {
          code: 'VOICEBOX_SPEECH_FAILED',
          status: 502,
        })
      }
    }

    throw new CompanionError('Voicebox speech job timed out', {
      code: 'VOICEBOX_SPEECH_TIMEOUT',
      status: 504,
    })
  }

  fetchAudio(id, { range, signal } = {}) {
    return this.fetch(`${this.baseUrl}/audio/${encodeURIComponent(id)}`, {
      headers: range ? { Range: range } : {},
      signal,
    })
  }
}
