const DEFAULT_PATIENT_APP_ID = '78d7b6cfd1c3480a950bb9a1f38e3afc'
const DEFAULT_SESSION_APP_ID = '6784c6239a3048208ecd4f9ab1d79ebe'
const DEFAULT_REPORT_APP_ID = '5335c37d57f94cae8324356af5117176'
const MAX_BODY_BYTES = 24_000
const requestBuckets = new Map()

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function allowRequest(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const now = Date.now()
  const recent = (requestBuckets.get(ip) || []).filter((time) => now - time < 60_000)
  if (recent.length >= 30) return false
  recent.push(now)
  requestBuckets.set(ip, recent)
  return true
}

function bailianHeaders(env) {
  if (!env.DASHSCOPE_API_KEY) throw new Error('AI_NOT_CONFIGURED')
  const headers = {
    Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
    'Content-Type': 'application/json',
  }
  if (env.DASHSCOPE_WORKSPACE_ID) {
    headers['X-DashScope-WorkSpace'] = env.DASHSCOPE_WORKSPACE_ID
  }
  return headers
}

function asyncSessionUrl(appId, taskId = '') {
  const base = `https://dashscope.aliyuncs.com/api/v2/apps/agent/${appId}/compatible-mode/v1/responses`
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base
}

async function callAsyncSession(env, appId, taskId, input) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(asyncSessionUrl(appId, taskId), {
      method: taskId ? 'GET' : 'POST',
      headers: bailianHeaders(env),
      ...(taskId
        ? {}
        : { body: JSON.stringify({ input, background: true }) }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`BAILIAN_${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

function extractAsyncOutput(payload) {
  const text = payload?.output
    ?.flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
  if (!text) throw new Error('INVALID_BAILIAN_RESPONSE')
  return parseModelJson(text)
}

function parseModelJson(text) {
  const normalized = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return JSON.parse(normalized)
}

async function callBailian(env, appId, prompt, bizParams) {
  if (!env.DASHSCOPE_API_KEY) {
    throw new Error('AI_NOT_CONFIGURED')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch(
      `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            ...(bizParams ? { biz_params: bizParams } : {}),
          },
          parameters: {},
          debug: {},
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) throw new Error(`BAILIAN_${response.status}`)
    const payload = await response.json()
    if (typeof payload?.output?.text !== 'string') throw new Error('INVALID_BAILIAN_RESPONSE')
    return parseModelJson(payload.output.text)
  } finally {
    clearTimeout(timer)
  }
}

async function handleAiRequest(request, env, pathname) {
  const sessionTaskMatch = pathname.match(/^\/api\/ai\/session\/([^/]+)$/)
  const isSessionStatusRequest = Boolean(sessionTaskMatch && request.method === 'GET')
  if (request.method !== 'POST' && !isSessionStatusRequest) {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  }
  if (!allowRequest(request)) return jsonResponse({ error: 'RATE_LIMITED' }, 429)

  let body = null
  if (request.method === 'POST') {
    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_BYTES) return jsonResponse({ error: 'PAYLOAD_TOO_LARGE' }, 413)
    try {
      body = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ error: 'INVALID_JSON' }, 400)
    }
  }

  try {
    if (pathname === '/api/ai/patient') {
      const appId = env.BAILIAN_PATIENT_APP_ID || DEFAULT_PATIENT_APP_ID
      const result = await callBailian(
        env,
        appId,
        typeof body.query === 'string' ? body.query : '请随机生成一名新患者',
      )
      return jsonResponse(result)
    }

    if (pathname === '/api/ai/session') {
      if (typeof body.query !== 'string' || body.query.length > 8_000) {
        return jsonResponse({ error: 'INVALID_SESSION_INPUT' }, 400)
      }
      const appId = env.BAILIAN_SESSION_APP_ID || DEFAULT_SESSION_APP_ID
      const result = await callAsyncSession(env, appId, '', body.query)
      if (typeof result?.id !== 'string' || typeof result?.status !== 'string') {
        throw new Error('INVALID_BAILIAN_RESPONSE')
      }
      return jsonResponse({ taskId: result.id, status: result.status }, 202)
    }

    if (sessionTaskMatch) {
      const taskId = sessionTaskMatch[1]
      if (!/^[A-Za-z0-9_-]{10,128}$/.test(taskId)) {
        return jsonResponse({ error: 'INVALID_SESSION_TASK_ID' }, 400)
      }
      const appId = env.BAILIAN_SESSION_APP_ID || DEFAULT_SESSION_APP_ID
      const result = await callAsyncSession(env, appId, taskId)
      if (['queued', 'in_progress', 'running'].includes(result?.status)) {
        return jsonResponse({ taskId, status: result.status }, 202)
      }
      if (result?.status !== 'completed') throw new Error('AI_SESSION_TASK_FAILED')
      return jsonResponse(extractAsyncOutput(result))
    }

    const required = ['patientJson', 'stateJson', 'recordsJson']
    if (!required.every((key) => typeof body[key] === 'string')) {
      return jsonResponse({ error: 'INVALID_REPORT_INPUT' }, 400)
    }
    const appId = env.BAILIAN_REPORT_APP_ID || DEFAULT_REPORT_APP_ID
    const result = await callBailian(env, appId, '请根据本次五针记录生成疗程报告。', {
      patient_json: body.patientJson,
      state_json: body.stateJson,
      records_json: body.recordsJson,
    })
    return jsonResponse(result)
  } catch (error) {
    const status = error instanceof Error && error.message === 'AI_NOT_CONFIGURED' ? 503 : 502
    return jsonResponse({ error: status === 503 ? 'AI_NOT_CONFIGURED' : 'AI_UPSTREAM_FAILED' }, status)
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (
      pathname === '/api/ai/patient' ||
      pathname === '/api/ai/session' ||
      pathname.startsWith('/api/ai/session/') ||
      pathname === '/api/ai/report'
    ) {
      return handleAiRequest(request, env, pathname)
    }
    return env.ASSETS.fetch(request)
  },
}
