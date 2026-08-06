export type PatientChallengeKind =
  | 'PAIN_LIMIT'
  | 'BLEEDING_LIMIT'
  | 'TRUST_FLOOR'
  | 'PRECISION_COUNT'

export type PatientChallenge = {
  kind: PatientChallengeKind
  title: string
  description: string
  target: number
  accent: string
}

export type ChallengePatient = {
  name: string
  painTolerance: number
  vascularDifficulty: number
  trustSensitivity: number
  personality: string
}

export type ChallengeState = {
  pain: number
  bruise: number
  bleeding: number
  numb: number
  trust: number
  needleCount: number
}

export type ChallengeHit = {
  result: 'SUCCESS' | 'BLOOD' | 'NERVE' | 'BRUISE' | 'BONE'
}

export type ChallengeProgress = {
  completed: boolean
  currentlyPassing: boolean
  current: number
  progressText: string
  resultText: string
}

export function createPatientChallenge(
  patient: ChallengePatient,
): PatientChallenge {
  if (patient.painTolerance <= 42) {
    return {
      kind: 'PAIN_LIMIT',
      title: '轻手轻脚',
      description: '五针结束时疼痛值不超过 45',
      target: 45,
      accent: '#ff8aa5',
    }
  }

  if (patient.vascularDifficulty >= 65) {
    return {
      kind: 'BLEEDING_LIMIT',
      title: '稳住血线',
      description: '五针结束时出血值不超过 30',
      target: 30,
      accent: '#ff5f7f',
    }
  }

  if (patient.trustSensitivity >= 1.05) {
    return {
      kind: 'TRUST_FLOOR',
      title: '信任保卫战',
      description: '五针结束时信任值保持在 60 以上',
      target: 60,
      accent: '#67edb0',
    }
  }

  return {
    kind: 'PRECISION_COUNT',
    title: '三针定胜负',
    description: '五针内至少精准命中 3 次',
    target: 3,
    accent: '#77a7ff',
  }
}

export function evaluatePatientChallenge(
  challenge: PatientChallenge,
  state: ChallengeState,
  hits: ChallengeHit[],
): ChallengeProgress {
  const successCount = hits.filter((hit) => hit.result === 'SUCCESS').length
  let current = 0
  let currentlyPassing = false
  let progressText = ''

  switch (challenge.kind) {
    case 'PAIN_LIMIT':
      current = state.pain
      currentlyPassing = current <= challenge.target
      progressText = `疼痛 ${current} / 上限 ${challenge.target}`
      break
    case 'BLEEDING_LIMIT':
      current = state.bleeding
      currentlyPassing = current <= challenge.target
      progressText = `出血 ${current} / 上限 ${challenge.target}`
      break
    case 'TRUST_FLOOR':
      current = state.trust
      currentlyPassing = current >= challenge.target
      progressText = `信任 ${current} / 目标 ${challenge.target}`
      break
    case 'PRECISION_COUNT':
      current = successCount
      currentlyPassing = current >= challenge.target
      progressText = `精准 ${current} / ${challenge.target} 次`
      break
  }

  const completed = state.needleCount >= 5 && currentlyPassing
  return {
    completed,
    currentlyPassing,
    current,
    progressText,
    resultText:
      state.needleCount < 5
        ? '进行中'
        : completed
          ? '挑战完成'
          : '挑战失败',
  }
}

export function getTreatmentStress(state: ChallengeState) {
  const trustStress = Math.max(0, 48 - state.trust) / 48
  const painStress = Math.max(0, state.pain - 42) / 58
  const numbStress = Math.max(0, state.numb - 35) / 65
  return Math.min(1, trustStress * 0.55 + painStress * 0.28 + numbStress * 0.17)
}

export function getPatientReaction(
  patient: ChallengePatient,
  state: ChallengeState,
  hit: ChallengeHit,
  hits: ChallengeHit[],
) {
  const successStreak = [...hits]
    .reverse()
    .findIndex((item) => item.result !== 'SUCCESS')
  const resolvedStreak =
    successStreak === -1 ? hits.length : successStreak

  if (state.trust <= 32) {
    return '我现在对这根针，以及你，都保持合理怀疑。'
  }
  if (hit.result === 'SUCCESS' && resolvedStreak >= 2) {
    return patient.personality.includes('冷静')
      ? '连续两针都很稳，我认可这个趋势。'
      : '连续命中！我开始觉得你有点东西了。'
  }
  if (hit.result === 'SUCCESS') {
    return patient.painTolerance < 45
      ? '这针比我想象中轻，先给你加一点信任。'
      : '位置不错，这次我就不抢戏了。'
  }
  if (hit.result === 'BLOOD') {
    return patient.personality.includes('乐观')
      ? '一点红色特效而已，气氛组很努力。'
      : '这个红色特效……应该不在套餐里吧？'
  }
  if (hit.result === 'NERVE') {
    return '刚才那一下像手指突然收到了一条推送。'
  }
  if (hit.result === 'BRUISE') {
    return '很好，我的手获得了一枚限时紫色皮肤。'
  }
  return '这一下很有存在感，我建议下一针低调一点。'
}
