import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.FC_SERVER_PORT || process.env.PORT || 9000)
const PATIENT_APP_ID =
  process.env.BAILIAN_PATIENT_APP_ID || '78d7b6cfd1c3480a950bb9a1f38e3afc'
const SESSION_APP_ID =
  process.env.BAILIAN_SESSION_APP_ID || '6784c6239a3048208ecd4f9ab1d79ebe'
const REPORT_APP_ID =
  process.env.BAILIAN_REPORT_APP_ID || '5335c37d57f94cae8324356af5117176'
const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || 'https://rongmomo.lyshowcase.com'
const MAX_BODY_BYTES = 24_000
const REQUEST_TIMEOUT_MS = 25_000
const REQUESTS_PER_MINUTE = 30
const DEBUG_AI_OUTPUT = process.env.DEBUG_AI_OUTPUT === 'true'
const requestBuckets = new Map()

function logEvent(level, event, details = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  })
  const writer = level === 'error' ? console.error : console.log
  writer(payload)
}

function setCorsHeaders(response, origin) {
  if (origin === ALLOWED_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(response, status, data, origin, requestId) {
  setCorsHeaders(response, origin)
  if (requestId) response.setHeader('X-Request-Id', requestId)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(data))
}

function getClientAddress(request) {
  return (
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    request.socket.remoteAddress ||
    'unknown'
  )
}

function allowRequest(request) {
  const address = getClientAddress(request)
  const now = Date.now()
  const recent = (requestBuckets.get(address) || []).filter(
    (timestamp) => now - timestamp < 60_000,
  )
  if (recent.length >= REQUESTS_PER_MINUTE) return false
  recent.push(now)
  requestBuckets.set(address, recent)
  return true
}

async function readJsonBody(request) {
  const chunks = []
  let receivedBytes = 0

  for await (const chunk of request) {
    receivedBytes += chunk.length
    if (receivedBytes > MAX_BODY_BYTES) {
      const error = new Error('PAYLOAD_TOO_LARGE')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('INVALID_JSON')
    error.status = 400
    throw error
  }
}

function parseModelJson(text) {
  const normalized = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return JSON.parse(normalized)
}

function validatePatient(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    Number.isInteger(value.age) &&
    value.age >= 18 &&
    value.age <= 60 &&
    Number.isFinite(value.painTolerance) &&
    value.painTolerance >= 0 &&
    value.painTolerance <= 100 &&
    Number.isFinite(value.vascularDifficulty) &&
    value.vascularDifficulty >= 0 &&
    value.vascularDifficulty <= 100 &&
    typeof value.personality === 'string' &&
    typeof value.openingDialog === 'string'
  )
}

function validateReport(value) {
  return (
    value &&
    typeof value === 'object' &&
    Number.isFinite(value.satisfaction) &&
    value.satisfaction >= 0 &&
    value.satisfaction <= 100 &&
    ['S', 'A', 'B', 'C', 'D'].includes(value.rating) &&
    typeof value.comment === 'string' &&
    typeof value.patientDialog === 'string' &&
    typeof value.shareText === 'string'
  )
}

function validateSession(value) {
  const challengeCodes = ['KEEP_TRUST', 'LIMIT_PAIN', 'LIMIT_BLEEDING', 'HIT_COUNT']
  const moods = ['CALM', 'NERVOUS', 'IMPRESSED', 'SUSPICIOUS']
  const screenEffects = ['NONE', 'HEARTBEAT', 'COLD_FLASH', 'WARM_GLOW']
  const resultKeys = ['SUCCESS', 'BLOOD', 'NERVE', 'BRUISE', 'BONE']
  const challenge = value?.challenge
  const dialogueBank = value?.dialogueBank
  const midpointEvent = value?.midpointEvent

  return (
    value &&
    typeof value === 'object' &&
    validatePatient(value.patient) &&
    Array.from(value.patient.personality.trim()).length === 3 &&
    value.patient.personality.trim().endsWith('型') &&
    challenge &&
    challengeCodes.includes(challenge.code) &&
    Number.isInteger(challenge.target) &&
    typeof challenge.title === 'string' &&
    typeof challenge.description === 'string' &&
    typeof challenge.successText === 'string' &&
    typeof challenge.failText === 'string' &&
    dialogueBank &&
    resultKeys.every(
      (key) =>
        Array.isArray(dialogueBank[key]) &&
        dialogueBank[key].length === 2 &&
        dialogueBank[key].every(
          (line) => typeof line === 'string' && line.trim().length > 0,
        ),
    ) &&
    midpointEvent?.triggerNeedle === 3 &&
    moods.includes(midpointEvent.mood) &&
    screenEffects.includes(midpointEvent.screenEffect) &&
    typeof midpointEvent.dialog === 'string'
  )
}

async function callBailian(appId, prompt, bizParams, context) {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) {
    const error = new Error('AI_NOT_CONFIGURED')
    error.status = 503
    throw error
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (process.env.DASHSCOPE_WORKSPACE_ID) {
    headers['X-DashScope-WorkSpace'] = process.env.DASHSCOPE_WORKSPACE_ID
  }

  const startedAt = Date.now()
  let response
  try {
    response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: {
            prompt,
            ...(bizParams ? { biz_params: bizParams } : {}),
          },
          parameters: {},
          debug: {},
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
  } catch (cause) {
    if (cause?.name === 'TimeoutError' || cause?.name === 'AbortError') {
      logEvent('error', 'ai_upstream_timeout', {
        ...context,
        durationMs: Date.now() - startedAt,
      })
      const error = new Error('AI_UPSTREAM_TIMEOUT')
      error.status = 504
      throw error
    }
    throw cause
  }

  if (!response.ok) {
    logEvent('error', 'ai_upstream_failed', {
      ...context,
      upstreamStatus: response.status,
      durationMs: Date.now() - startedAt,
    })
    const error = new Error('AI_UPSTREAM_FAILED')
    error.status = 502
    throw error
  }

  const payload = await response.json()
  const upstreamRequestId =
    payload?.request_id || response.headers.get('x-request-id') || null
  if (typeof payload?.output?.text !== 'string') {
    logEvent('error', 'ai_response_invalid', {
      ...context,
      upstreamRequestId,
      durationMs: Date.now() - startedAt,
      reason: 'missing_output_text',
    })
    const error = new Error('INVALID_AI_RESPONSE')
    error.status = 502
    throw error
  }

  try {
    const result = parseModelJson(payload.output.text)
    logEvent('info', 'ai_completed', {
      ...context,
      upstreamRequestId,
      durationMs: Date.now() - startedAt,
      usage: payload?.usage || null,
    })
    if (DEBUG_AI_OUTPUT) {
      logEvent('info', 'ai_debug_output', {
        ...context,
        upstreamRequestId,
        output: result,
      })
    }
    return result
  } catch {
    logEvent('error', 'ai_response_invalid', {
      ...context,
      upstreamRequestId,
      durationMs: Date.now() - startedAt,
      reason: 'invalid_json',
      ...(DEBUG_AI_OUTPUT
        ? { rawOutput: payload.output.text.slice(0, 4_000) }
        : {}),
    })
    const error = new Error('INVALID_AI_JSON')
    error.status = 502
    throw error
  }
}

function getBailianHeaders() {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) {
    const error = new Error('AI_NOT_CONFIGURED')
    error.status = 503
    throw error
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (process.env.DASHSCOPE_WORKSPACE_ID) {
    headers['X-DashScope-WorkSpace'] = process.env.DASHSCOPE_WORKSPACE_ID
  }
  return headers
}

function getAsyncSessionUrl(taskId = '') {
  const base = `https://dashscope.aliyuncs.com/api/v2/apps/agent/${SESSION_APP_ID}/compatible-mode/v1/responses`
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base
}

async function fetchAsyncSession(url, options, context) {
  const startedAt = Date.now()
  let response
  try {
    response = await fetch(url, {
      ...options,
      headers: getBailianHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    if (cause?.name === 'TimeoutError' || cause?.name === 'AbortError') {
      logEvent('error', 'ai_async_upstream_timeout', {
        ...context,
        durationMs: Date.now() - startedAt,
      })
      const error = new Error('AI_UPSTREAM_TIMEOUT')
      error.status = 504
      throw error
    }
    throw cause
  }

  if (!response.ok) {
    logEvent('error', 'ai_async_upstream_failed', {
      ...context,
      upstreamStatus: response.status,
      durationMs: Date.now() - startedAt,
    })
    const error = new Error('AI_UPSTREAM_FAILED')
    error.status = 502
    throw error
  }

  return response.json()
}

async function createAsyncSessionTask(query, context) {
  const payload = await fetchAsyncSession(
    getAsyncSessionUrl(),
    {
      method: 'POST',
      body: JSON.stringify({ input: query, background: true }),
    },
    context,
  )
  if (typeof payload?.id !== 'string' || typeof payload?.status !== 'string') {
    const error = new Error('INVALID_AI_RESPONSE')
    error.status = 502
    throw error
  }
  return { taskId: payload.id, status: payload.status }
}

function extractAsyncSessionResult(payload) {
  const text = payload?.output
    ?.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')

  if (!text) {
    const error = new Error('INVALID_AI_RESPONSE')
    error.status = 502
    throw error
  }

  try {
    return parseModelJson(text)
  } catch {
    const error = new Error('INVALID_AI_JSON')
    error.status = 502
    throw error
  }
}

async function handlePatient(request, requestId) {
  const body = await readJsonBody(request)
  const patientRequest =
    typeof body.query === 'string'
      ? body.query.slice(0, 200)
      : '请随机生成一名适合本局游戏的新患者。'
  const patient = await callBailian(
    PATIENT_APP_ID,
    `${patientRequest}\n姓名、性格和开场对白只使用简体中文。`,
    undefined,
    { requestId, workflow: 'patient' },
  )

  if (!validatePatient(patient)) {
    const error = new Error('INVALID_PATIENT_RESULT')
    error.status = 502
    throw error
  }
  return patient
}

async function handleSessionSubmit(request, requestId) {
  const body = await readJsonBody(request)
  if (typeof body.query !== 'string' || body.query.length > 8_000) {
    const error = new Error('INVALID_SESSION_INPUT')
    error.status = 400
    throw error
  }

  return createAsyncSessionTask(body.query, {
    requestId,
    workflow: 'session',
    operation: 'create',
  })
}

async function handleSessionStatus(taskId, requestId) {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(taskId)) {
    const error = new Error('INVALID_SESSION_TASK_ID')
    error.status = 400
    throw error
  }

  const payload = await fetchAsyncSession(
    getAsyncSessionUrl(taskId),
    { method: 'GET' },
    { requestId, workflow: 'session', operation: 'retrieve', taskId },
  )
  const status = typeof payload?.status === 'string' ? payload.status : ''
  if (['queued', 'in_progress', 'running'].includes(status)) {
    return { pending: true, taskId, status }
  }
  if (status === 'failed' || status === 'cancelled') {
    const error = new Error('AI_SESSION_TASK_FAILED')
    error.status = 502
    throw error
  }
  if (status !== 'completed') {
    const error = new Error('INVALID_AI_RESPONSE')
    error.status = 502
    throw error
  }

  const session = extractAsyncSessionResult(payload)
  if (!validateSession(session)) {
    const error = new Error('INVALID_SESSION_RESULT')
    error.status = 502
    throw error
  }
  return { pending: false, session }
}

async function handleReport(request, requestId) {
  const body = await readJsonBody(request)
  const required = ['patientJson', 'stateJson', 'recordsJson']
  if (
    !required.every(
      (key) => typeof body[key] === 'string' && body[key].length <= 8_000,
    )
  ) {
    const error = new Error('INVALID_REPORT_INPUT')
    error.status = 400
    throw error
  }

  const report = await callBailian(
    REPORT_APP_ID,
    '请根据本次五针记录生成简短有趣的疗程报告。所有自然语言字段只使用简体中文，不要直接输出 BLOOD、BRUISE、NERVE、BONE 等英文事件名。',
    {
      patient_json: body.patientJson,
      state_json: body.stateJson,
      records_json: body.recordsJson,
    },
    { requestId, workflow: 'report' },
  )

  if (!validateReport(report)) {
    const error = new Error('INVALID_REPORT_RESULT')
    error.status = 502
    throw error
  }
  return report
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID()
  const startedAt = Date.now()
  const origin = request.headers.origin || ''
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  const sessionTaskMatch = pathname.match(/^\/api\/ai\/session\/([^/]+)$/)

  if (request.method === 'OPTIONS') {
    if (origin && origin !== ALLOWED_ORIGIN) {
      return sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' }, origin, requestId)
    }
    setCorsHeaders(response, origin)
    response.writeHead(204)
    return response.end()
  }

  if (pathname === '/health' && request.method === 'GET') {
    return sendJson(
      response,
      200,
      {
        ok: true,
        aiConfigured: Boolean(process.env.DASHSCOPE_API_KEY),
      },
      origin,
      requestId,
    )
  }

  if (origin && origin !== ALLOWED_ORIGIN) {
    return sendJson(response, 403, { error: 'ORIGIN_NOT_ALLOWED' }, origin, requestId)
  }
  const isSessionStatusRequest = Boolean(sessionTaskMatch && request.method === 'GET')
  if (request.method !== 'POST' && !isSessionStatusRequest) {
    return sendJson(response, 405, { error: 'METHOD_NOT_ALLOWED' }, origin, requestId)
  }
  if (!allowRequest(request)) {
    return sendJson(response, 429, { error: 'RATE_LIMITED' }, origin, requestId)
  }

  logEvent('info', 'request_started', {
    requestId,
    method: request.method,
    path: pathname,
  })

  try {
    if (pathname === '/api/ai/patient') {
      const result = await handlePatient(request, requestId)
      logEvent('info', 'request_completed', {
        requestId,
        path: pathname,
        status: 200,
        durationMs: Date.now() - startedAt,
      })
      return sendJson(response, 200, result, origin, requestId)
    }
    if (pathname === '/api/ai/session') {
      const result = await handleSessionSubmit(request, requestId)
      logEvent('info', 'request_completed', {
        requestId,
        path: pathname,
        status: 202,
        durationMs: Date.now() - startedAt,
      })
      return sendJson(response, 202, result, origin, requestId)
    }
    if (sessionTaskMatch) {
      const result = await handleSessionStatus(sessionTaskMatch[1], requestId)
      const status = result.pending ? 202 : 200
      logEvent('info', 'request_completed', {
        requestId,
        path: pathname,
        status,
        taskStatus: result.pending ? result.status : 'completed',
        durationMs: Date.now() - startedAt,
      })
      return sendJson(
        response,
        status,
        result.pending
          ? { taskId: result.taskId, status: result.status }
          : result.session,
        origin,
        requestId,
      )
    }
    if (pathname === '/api/ai/report') {
      const result = await handleReport(request, requestId)
      logEvent('info', 'request_completed', {
        requestId,
        path: pathname,
        status: 200,
        durationMs: Date.now() - startedAt,
      })
      return sendJson(response, 200, result, origin, requestId)
    }
    return sendJson(response, 404, { error: 'NOT_FOUND' }, origin, requestId)
  } catch (error) {
    const status = Number(error?.status) || 500
    const safeErrors = new Set([
      'PAYLOAD_TOO_LARGE',
      'INVALID_JSON',
      'INVALID_REPORT_INPUT',
      'INVALID_SESSION_INPUT',
      'INVALID_SESSION_TASK_ID',
      'AI_NOT_CONFIGURED',
      'AI_UPSTREAM_FAILED',
      'AI_UPSTREAM_TIMEOUT',
      'AI_SESSION_TASK_FAILED',
      'INVALID_AI_RESPONSE',
      'INVALID_AI_JSON',
      'INVALID_PATIENT_RESULT',
      'INVALID_SESSION_RESULT',
      'INVALID_REPORT_RESULT',
    ])
    const code = safeErrors.has(error?.message) ? error.message : 'INTERNAL_ERROR'
    logEvent('error', 'request_failed', {
      requestId,
      path: pathname,
      status,
      code,
      durationMs: Date.now() - startedAt,
    })
    return sendJson(response, status, { error: code, requestId }, origin, requestId)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  logEvent('info', 'server_started', {
    message: `Bailian proxy listening on port ${PORT}`,
    port: PORT,
    debugAiOutput: DEBUG_AI_OUTPUT,
  })
})
