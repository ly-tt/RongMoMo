import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const child = spawn(process.execPath, ['server.js'], {
  cwd: import.meta.dirname,
  env: {
    ...process.env,
    PORT: '19000',
    DASHSCOPE_API_KEY: '',
    ALLOWED_ORIGIN: 'https://rongmomo.lyshowcase.com',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
})

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5_000)
    child.once('error', reject)
    child.stdout.on('data', (chunk) => {
      if (!chunk.toString().includes('listening')) return
      clearTimeout(timeout)
      resolve()
    })
  })

  const health = await fetch('http://127.0.0.1:19000/health', {
    headers: { Origin: 'https://rongmomo.lyshowcase.com' },
  })
  assert.equal(health.status, 200)
  assert.equal(
    health.headers.get('access-control-allow-origin'),
    'https://rongmomo.lyshowcase.com',
  )
  assert.deepEqual(await health.json(), { ok: true, aiConfigured: false })

  const forbidden = await fetch('http://127.0.0.1:19000/api/ai/patient', {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.com' },
  })
  assert.equal(forbidden.status, 403)

  const patient = await fetch('http://127.0.0.1:19000/api/ai/patient', {
    method: 'POST',
    headers: {
      Origin: 'https://rongmomo.lyshowcase.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '生成患者' }),
  })
  assert.equal(patient.status, 503)
  assert.equal(patient.headers.get('x-request-id')?.length > 0, true)
  const patientError = await patient.json()
  assert.equal(patientError.error, 'AI_NOT_CONFIGURED')
  assert.equal(typeof patientError.requestId, 'string')

  const session = await fetch('http://127.0.0.1:19000/api/ai/session', {
    method: 'POST',
    headers: {
      Origin: 'https://rongmomo.lyshowcase.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '{"sessionSeed":"test"}' }),
  })
  assert.equal(session.status, 503)
  const sessionError = await session.json()
  assert.equal(sessionError.error, 'AI_NOT_CONFIGURED')

  console.log('Bailian proxy tests passed')
} finally {
  child.kill()
}
