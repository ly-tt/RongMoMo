export type AiPatient = {
  name: string
  age: number
  painTolerance: number
  vascularDifficulty: number
  personality: string
  openingDialog: string
}

export type AiPatientFingerprint = Pick<
  AiPatient,
  'name' | 'age' | 'painTolerance' | 'vascularDifficulty' | 'personality'
>

export type AiSessionChallenge = {
  code: 'KEEP_TRUST' | 'LIMIT_PAIN' | 'LIMIT_BLEEDING' | 'HIT_COUNT'
  target: number
  title: string
  description: string
  successText: string
  failText: string
}

export type AiSessionDialogueBank = Record<
  'SUCCESS' | 'BLOOD' | 'NERVE' | 'BRUISE' | 'BONE',
  [string, string]
>

export type AiMidpointEvent = {
  triggerNeedle: 3
  mood: 'CALM' | 'NERVOUS' | 'IMPRESSED' | 'SUSPICIOUS'
  screenEffect: 'NONE' | 'HEARTBEAT' | 'COLD_FLASH' | 'WARM_GLOW'
  dialog: string
}

export type AiTreatmentSession = {
  patient: AiPatient
  challenge: AiSessionChallenge
  dialogueBank: AiSessionDialogueBank
  midpointEvent: AiMidpointEvent
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
const REQUEST_TIMEOUT_MS = 28_000
const SESSION_POLL_INTERVAL_MS = 5_000
const SESSION_POLL_TIMEOUT_MS = 100_000
const SESSION_CACHE_KEY = 'needle-roulette:next-ai-session:v1'
const SESSION_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000
const PATIENT_AGE_RANGES = ['18～25', '26～35', '36～45', '46～60'] as const
const PATIENT_PERSONALITY_DIRECTIONS = [
  '嘴硬但怕疼',
  '冷静理性',
  '活泼话多',
  '紧张谨慎',
  '幽默乐观',
  '沉默慢热',
  '好奇冒险',
  '温和佛系',
] as const
const OVERUSED_PATIENT_NAMES = ['阿哲', '小王'] as const

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

function isAiTreatmentSession(value: unknown): value is AiTreatmentSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Record<string, unknown>
  const challenge = session.challenge as Record<string, unknown> | undefined
  const dialogueBank = session.dialogueBank as Record<string, unknown> | undefined
  const midpointEvent = session.midpointEvent as Record<string, unknown> | undefined
  const resultKeys = ['SUCCESS', 'BLOOD', 'NERVE', 'BRUISE', 'BONE'] as const

  if (
    !isAiPatient(session.patient) ||
    !challenge ||
    !dialogueBank ||
    !midpointEvent
  ) {
    return false
  }

  return (
    Array.from((session.patient as AiPatient).personality.trim()).length === 3 &&
    (session.patient as AiPatient).personality.trim().endsWith('型') &&
    typeof challenge.code === 'string' &&
    ['KEEP_TRUST', 'LIMIT_PAIN', 'LIMIT_BLEEDING', 'HIT_COUNT'].includes(
      challenge.code,
    ) &&
    Number.isInteger(challenge.target) &&
    typeof challenge.title === 'string' &&
    typeof challenge.description === 'string' &&
    typeof challenge.successText === 'string' &&
    typeof challenge.failText === 'string' &&
    resultKeys.every((key) => {
      const lines = dialogueBank[key]
      return (
        Array.isArray(lines) &&
        lines.length === 2 &&
        lines.every((line) => typeof line === 'string' && line.trim().length > 0)
      )
    }) &&
    midpointEvent.triggerNeedle === 3 &&
    typeof midpointEvent.mood === 'string' &&
    ['CALM', 'NERVOUS', 'IMPRESSED', 'SUSPICIOUS'].includes(midpointEvent.mood) &&
    typeof midpointEvent.screenEffect === 'string' &&
    ['NONE', 'HEARTBEAT', 'COLD_FLASH', 'WARM_GLOW'].includes(
      midpointEvent.screenEffect,
    ) &&
    typeof midpointEvent.dialog === 'string' &&
    midpointEvent.dialog.trim().length > 0
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

async function requestJson(
  path: string,
  init: RequestInit,
): Promise<{ payload: unknown; status: number; requestId: string }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
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
    return {
      payload: await response.json(),
      status: response.status,
      requestId,
    }
  } finally {
    window.clearTimeout(timer)
  }
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.info(
    `[Needle Roulette AI] ${path} completed requestId=${response.requestId}`,
  )
  return response.payload
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

export function readCachedAiTreatmentSession(): AiTreatmentSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { createdAt?: unknown; session?: unknown }
    if (
      !isFiniteNumber(cached.createdAt) ||
      Date.now() - cached.createdAt > SESSION_CACHE_MAX_AGE_MS ||
      !isAiTreatmentSession(cached.session)
    ) {
      clearCachedAiTreatmentSession()
      return null
    }
    return cached.session
  } catch {
    clearCachedAiTreatmentSession()
    return null
  }
}

export function cacheAiTreatmentSession(session: AiTreatmentSession) {
  try {
    window.localStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ createdAt: Date.now(), session }),
    )
  } catch {
    // The in-memory cache remains available when storage is blocked or full.
  }
}

export function clearCachedAiTreatmentSession() {
  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

function createPatientDiversityPrompt(
  recentPatients: AiPatientFingerprint[],
  attempt: number,
) {
  const seed =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  const ageRange =
    PATIENT_AGE_RANGES[Math.floor(Math.random() * PATIENT_AGE_RANGES.length)]
  const personality =
    PATIENT_PERSONALITY_DIRECTIONS[
      Math.floor(Math.random() * PATIENT_PERSONALITY_DIRECTIONS.length)
    ]
  const previous = recentPatients[0]
  const excludedNames = [
    ...new Set([
      ...recentPatients.slice(0, 5).map((patient) => patient.name.trim()),
      ...OVERUSED_PATIENT_NAMES,
    ]),
  ].join('、')

  return [
    `生成全新患者，随机令牌${seed}，这是第${attempt}次候选。`,
    `禁用姓名：${excludedNames}；新姓名不得重复。`,
    previous ? `年龄不得为${previous.age}岁，` : '',
    `年龄限定${ageRange}岁，性格方向“${personality}”。`,
    '耐痛和血管难度也要与上一位明显不同，严格返回约定JSON。',
  ]
    .join('')
    .slice(0, 195)
}

function isRepeatedPatient(
  candidate: AiPatient,
  recentPatients: AiPatientFingerprint[],
) {
  const previous = recentPatients[0]
  if (!previous) return false

  const normalizedName = candidate.name.trim().toLocaleLowerCase()
  const repeatedName = recentPatients.some(
    (patient) => patient.name.trim().toLocaleLowerCase() === normalizedName,
  )
  const overusedName = OVERUSED_PATIENT_NAMES.some(
    (name) => name.toLocaleLowerCase() === normalizedName,
  )
  const repeatedAge = candidate.age === previous.age
  const closePain =
    Math.abs(candidate.painTolerance - previous.painTolerance) <= 5
  const closeVascular =
    Math.abs(candidate.vascularDifficulty - previous.vascularDifficulty) <= 5
  const repeatedPersonality =
    candidate.personality.trim() === previous.personality.trim()

  return (
    repeatedName ||
    overusedName ||
    repeatedAge ||
    (closePain && closeVascular) ||
    (repeatedPersonality && (closePain || closeVascular))
  )
}

function hasOverusedPatientName(candidate: AiPatient) {
  const normalizedName = candidate.name.trim().toLocaleLowerCase()
  return OVERUSED_PATIENT_NAMES.some(
    (name) => name.toLocaleLowerCase() === normalizedName,
  )
}

async function requestAiPatientCandidate(
  recentPatients: AiPatientFingerprint[],
  attempt: number,
) {
  const response = await postJson('/api/ai/patient', {
    query: createPatientDiversityPrompt(recentPatients, attempt),
  })
  if (!isAiPatient(response)) throw new Error('Invalid AI patient response')
  return response
}

async function requestAiSessionCandidate(
  recentPatients: AiPatientFingerprint[],
  attempt: number,
) {
  const sessionSeed =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  const submitted = await postJson('/api/ai/session', {
    query: JSON.stringify({
      sessionSeed,
      gameMode: 'SIMPLE_OR_CHALLENGE',
      attempt,
      recentPatients: recentPatients.slice(0, 5),
    }),
  })
  if (
    !submitted ||
    typeof submitted !== 'object' ||
    typeof (submitted as Record<string, unknown>).taskId !== 'string'
  ) {
    throw new Error('Invalid AI session task response')
  }

  const taskId = (submitted as { taskId: string }).taskId
  const deadline = Date.now() + SESSION_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await wait(SESSION_POLL_INTERVAL_MS)
    const polled = await requestJson(
      `/api/ai/session/${encodeURIComponent(taskId)}`,
      { method: 'GET' },
    )
    if (polled.status === 200 && isAiTreatmentSession(polled.payload)) {
      console.info(
        `[Needle Roulette AI] async session completed requestId=${polled.requestId}`,
      )
      return polled.payload
    }
    const taskStatus =
      polled.payload && typeof polled.payload === 'object'
        ? (polled.payload as Record<string, unknown>).status
        : null
    if (
      polled.status !== 202 ||
      typeof taskStatus !== 'string' ||
      !['queued', 'in_progress', 'running'].includes(taskStatus)
    ) {
      throw new Error('Invalid AI treatment session response')
    }
  }
  throw new Error('AI treatment session polling timed out')
}

export async function requestAiTreatmentSession(
  recentPatients: AiPatientFingerprint[] = [],
): Promise<AiTreatmentSession> {
  const firstSession = await requestAiSessionCandidate(recentPatients, 1)
  const firstRepeated = isRepeatedPatient(firstSession.patient, recentPatients)
  console.info('[Needle Roulette AI] session candidate', {
    attempt: 1,
    name: firstSession.patient.name,
    age: firstSession.patient.age,
    repeated: firstRepeated,
  })
  // Session generation runs in the background. Do not silently queue a second
  // minute-long workflow here; the next prefetch will get another random seed.
  return firstSession
}

export async function requestAiPatient(
  recentPatients: AiPatientFingerprint[] = [],
): Promise<AiPatient> {
  const firstCandidate = await requestAiPatientCandidate(recentPatients, 1)
  const firstRepeated = isRepeatedPatient(firstCandidate, recentPatients)
  console.info('[Needle Roulette AI] patient candidate', {
    attempt: 1,
    name: firstCandidate.name,
    age: firstCandidate.age,
    repeated: firstRepeated,
  })
  if (!firstRepeated) return firstCandidate
  if (hasOverusedPatientName(firstCandidate)) {
    throw new Error('AI patient workflow returned an overused fixed template')
  }

  const retryHistory = [firstCandidate, ...recentPatients].slice(0, 6)
  const secondCandidate = await requestAiPatientCandidate(retryHistory, 2)
  const secondRepeated = isRepeatedPatient(secondCandidate, retryHistory)
  console.info('[Needle Roulette AI] patient candidate', {
    attempt: 2,
    name: secondCandidate.name,
    age: secondCandidate.age,
    repeated: secondRepeated,
  })
  if (secondRepeated) {
    throw new Error('Repeated AI patient response after retry')
  }
  return secondCandidate
}

export async function requestAiTreatmentReport(
  input: AiReportInput,
): Promise<AiTreatmentReport> {
  const response = await postJson('/api/ai/report', input)
  if (!isAiTreatmentReport(response)) throw new Error('Invalid AI report response')
  return response
}
