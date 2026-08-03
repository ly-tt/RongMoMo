export type AiPatient = {
  name: string
  age: number
  painTolerance: number
  vascularDifficulty: number
  personality: string
  openingDialog: string
}

export type AiTreatmentReport = {
  satisfaction: number
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
  comment: string
  patientDialog: string
  shareText: string
}

export type AiReportInput = {
  patientJson: string
  stateJson: string
  recordsJson: string
}

const API_BASE_URL = (import.meta.env.VITE_AI_API_BASE_URL ?? '').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 5000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAiPatient(value: unknown): value is AiPatient {
  if (!value || typeof value !== 'object') return false
  const patient = value as Record<string, unknown>
  return (
    typeof patient.name === 'string' &&
    patient.name.trim().length > 0 &&
    isFiniteNumber(patient.age) &&
    patient.age >= 18 &&
    patient.age <= 60 &&
    isFiniteNumber(patient.painTolerance) &&
    patient.painTolerance >= 0 &&
    patient.painTolerance <= 100 &&
    isFiniteNumber(patient.vascularDifficulty) &&
    patient.vascularDifficulty >= 0 &&
    patient.vascularDifficulty <= 100 &&
    typeof patient.personality === 'string' &&
    typeof patient.openingDialog === 'string'
  )
}

function isAiTreatmentReport(value: unknown): value is AiTreatmentReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Record<string, unknown>
  return (
    isFiniteNumber(report.satisfaction) &&
    report.satisfaction >= 0 &&
    report.satisfaction <= 100 &&
    typeof report.rating === 'string' &&
    ['S', 'A', 'B', 'C', 'D'].includes(report.rating) &&
    typeof report.comment === 'string' &&
    typeof report.patientDialog === 'string' &&
    typeof report.shareText === 'string'
  )
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const requestId = response.headers.get('x-request-id') || 'unknown'
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const serverCode =
        payload && typeof payload.error === 'string' ? payload.error : 'UNKNOWN'
      throw new Error(
        `AI request failed: path=${path} status=${response.status} code=${serverCode} requestId=${requestId}`,
      )
    }
    console.info(`[Needle Roulette AI] ${path} completed requestId=${requestId}`)
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

export async function requestAiPatient(): Promise<AiPatient> {
  const response = await postJson('/api/ai/patient', {
    query: '请随机生成一名适合本局游戏的新患者，避免与常见示例完全相同。',
  })
  if (!isAiPatient(response)) throw new Error('Invalid AI patient response')
  return response
}

export async function requestAiTreatmentReport(
  input: AiReportInput,
): Promise<AiTreatmentReport> {
  const response = await postJson('/api/ai/report', input)
  if (!isAiTreatmentReport(response)) throw new Error('Invalid AI report response')
  return response
}
