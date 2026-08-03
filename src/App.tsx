import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  requestAiPatient,
  requestAiTreatmentReport,
  type AiPatient,
} from './services/aiService'

type NeedleResult = 'SUCCESS' | 'BLOOD' | 'NERVE' | 'BRUISE' | 'BONE'
type EventZone = 'ACUPOINT' | 'CAPILLARY' | 'NERVE_PATH' | 'SOFT_TISSUE' | 'HARD_TISSUE'

type Hit = {
  point: THREE.Vector3
  localPoint: THREE.Vector3
  localNormal: THREE.Vector3
  label: string
  rotation: THREE.Quaternion
  distance: number
  correctSurface: boolean
  surfaceIssue: string | null
  result: NeedleResult
  eventZone: EventZone
  needleNumber: number
}

type NeedleTarget = {
  code: string
  name: string
  surface: 'PALM' | 'BACK'
  meridian: string
  location: string
  quickLocation: string
  traditionalUse: string
  point: THREE.Vector3
  normal: THREE.Vector3
}

export type TreatmentPlanRequest = {
  needleCount?: number
  difficulty?: number
  patientProfile?: unknown
}

type PointerStart = {
  pointerId: number
  x: number
  y: number
}

export type PatientState = {
  pain: number
  bruise: number
  bleeding: number
  numb: number
  trust: number
  needleCount: number
}

export type PatientProfile = {
  id: string
  name: string
  age: number
  painTolerance: number
  vascularDifficulty: number
  personality: string
  openingLine: string
  trustSensitivity: number
}

type StateDelta = Omit<PatientState, 'needleCount'>

type TreatmentSummary = {
  satisfaction: number
  rating: number
  title: string
  review: string
  dialog: string
  source: 'ai' | 'local'
  shareText?: string
}

const PALM_PIVOT = new THREE.Vector3(-5.3, 11.5, 1.3)
const MAX_NEEDLES = 5
const INITIAL_PATIENT_STATE: PatientState = {
  pain: 8,
  bruise: 0,
  bleeding: 0,
  numb: 0,
  trust: 72,
  needleCount: 0,
}

const PATIENT_ARCHETYPES = [
  {
    name: '小王',
    personality: '嘴硬型',
    openingLine: '“我一点都不怕疼，真的。你先把针拿远一点。”',
    trustSensitivity: 1.15,
  },
  {
    name: '林知夏',
    personality: '冷静观察型',
    openingLine: '“我会认真记住每一针的位置，请开始吧。”',
    trustSensitivity: 0.82,
  },
  {
    name: '陈叔',
    personality: '话痨型',
    openingLine: '“别紧张，我不紧张。对了，你这是第几次扎？”',
    trustSensitivity: 1.02,
  },
  {
    name: '阿柚',
    personality: '好奇型',
    openingLine: '“扎准了会发光吗？扎偏了……也会发光吗？”',
    trustSensitivity: 0.92,
  },
  {
    name: '周末',
    personality: '戏精型',
    openingLine: '“请给我一个体面、安静、最好零痛感的疗程。”',
    trustSensitivity: 1.28,
  },
  {
    name: '唐圆圆',
    personality: '乐观型',
    openingLine: '“放心扎吧，我今天的运气一向不错。”',
    trustSensitivity: 0.72,
  },
]

const RESULT_IMPACT: Record<NeedleResult, StateDelta> = {
  SUCCESS: { pain: 2, bruise: 0, bleeding: 0, numb: 7, trust: 8 },
  BLOOD: { pain: 9, bruise: 4, bleeding: 28, numb: 0, trust: -9 },
  NERVE: { pain: 24, bruise: 0, bleeding: 0, numb: 34, trust: -18 },
  BRUISE: { pain: 10, bruise: 26, bleeding: 2, numb: 0, trust: -8 },
  BONE: { pain: 28, bruise: 5, bleeding: 0, numb: 3, trust: -22 },
}

const ACUPOINTS: NeedleTarget[] = [
  {
    code: 'LI4',
    name: '合谷',
    surface: 'BACK',
    meridian: '手阳明大肠经',
    location: '手背，第 2 掌骨桡侧的中点处。',
    quickLocation: '拇指、食指并拢时，虎口肌肉最高处附近；展开后对照第 2 掌骨中点桡侧。',
    traditionalUse: '传统常用于头面部、牙齿及头部不适。',
    point: new THREE.Vector3(-3.2, 12.2, 1.66),
    normal: new THREE.Vector3(0.38, 0.36, -0.85).normalize(),
  },
  {
    code: 'PC8',
    name: '劳宫',
    surface: 'PALM',
    meridian: '手厥阴心包经',
    location: '手掌，第 2、3 掌骨之间，掌指关节近端凹陷中。',
    quickLocation: '自然握拳，中指尖落在掌心的位置附近。',
    traditionalUse: '传统常用于手心发热、紧张烦躁等。',
    point: new THREE.Vector3(-4.9, 13, 2.93),
    normal: new THREE.Vector3(-0.03, 0.69, 0.72).normalize(),
  },
  {
    code: 'HT8',
    name: '少府',
    surface: 'PALM',
    meridian: '手少阴心经',
    location: '手掌，第 4、5 掌骨之间，第 5 掌指关节近端凹陷中。',
    quickLocation: '自然握拳，小指尖落在掌心的位置附近。',
    traditionalUse: '传统常用于心烦、手掌发热等。',
    point: new THREE.Vector3(-9.4, 13, 3.06),
    normal: new THREE.Vector3(0.26, 0.33, 0.91).normalize(),
  },
  {
    code: 'LU10',
    name: '鱼际',
    surface: 'PALM',
    meridian: '手太阴肺经',
    location: '手掌，第 1 掌骨中点桡侧，赤白肉际处。',
    quickLocation: '沿拇指根部的鱼腹状肌肉隆起，找到第 1 掌骨中点、掌背皮肤交界处。',
    traditionalUse: '传统常用于咽喉、咳嗽等相关不适。',
    point: new THREE.Vector3(-2.4, 11.5, 3.54),
    normal: new THREE.Vector3(0.58, -0.08, 0.81).normalize(),
  },
  {
    code: 'SI3',
    name: '后溪',
    surface: 'BACK',
    meridian: '手太阳小肠经',
    location: '手背，第 5 掌指关节尺侧，第 5 掌骨头近端凹陷中，赤白肉际处。',
    quickLocation: '轻握拳，在小指掌指关节后方、掌横纹靠小指侧的末端附近找凹陷。',
    traditionalUse: '传统常用于颈肩、后脑及腰背不适。',
    point: new THREE.Vector3(-11.2, 14.5, 1.18),
    normal: new THREE.Vector3(-0.69, 0.18, -0.7).normalize(),
  },
  {
    code: 'TE3',
    name: '中渚',
    surface: 'BACK',
    meridian: '手少阳三焦经',
    location: '手背，第 4、5 掌骨之间，第 4 掌指关节近端凹陷中。',
    quickLocation: '从无名指与小指的指缝向手腕方向滑，在两掌骨之间先摸到的凹陷处。',
    traditionalUse: '传统常用于耳部、头部及手指不适。',
    point: new THREE.Vector3(-10, 14.2, 0.45),
    normal: new THREE.Vector3(-0.48, 0.03, -0.87).normalize(),
  },
  {
    code: 'TE4',
    name: '阳池',
    surface: 'BACK',
    meridian: '手少阳三焦经',
    location: '腕背侧横纹上，指总伸肌腱尺侧缘凹陷中。',
    quickLocation: '手背朝上，在腕背横纹中央略偏小指侧、伸肌腱旁寻找凹陷。',
    traditionalUse: '传统常用于手腕不适。',
    point: new THREE.Vector3(-8.3, 6.8, -0.31),
    normal: new THREE.Vector3(-0.01, 0.26, -0.97).normalize(),
  },
  {
    code: 'HT7',
    name: '神门',
    surface: 'PALM',
    meridian: '手少阴心经',
    location: '腕前内侧，腕掌侧横纹上，尺侧腕屈肌腱桡侧缘。',
    quickLocation: '掌心朝上，在腕横纹小指侧摸到明显肌腱，取它靠拇指一侧的凹陷。',
    traditionalUse: '传统常用于失眠、紧张及心神不宁。',
    point: new THREE.Vector3(-9.5, 6.8, 3.7),
    normal: new THREE.Vector3(-0.2, -0.42, 0.88).normalize(),
  },
  {
    code: 'PC7',
    name: '大陵',
    surface: 'PALM',
    meridian: '手厥阴心包经',
    location: '腕掌侧横纹上，掌长肌腱与桡侧腕屈肌腱之间。',
    quickLocation: '握拳并稍屈腕，在腕横纹中央两条明显肌腱之间找点。',
    traditionalUse: '传统常用于手腕不适、紧张等。',
    point: new THREE.Vector3(-7.5, 6.8, 4.07),
    normal: new THREE.Vector3(-0.04, -0.46, 0.89).normalize(),
  },
  {
    code: 'LU9',
    name: '太渊',
    surface: 'PALM',
    meridian: '手太阴肺经',
    location: '腕前外侧，桡骨茎突与舟骨之间，拇长展肌腱尺侧凹陷中。',
    quickLocation: '掌心朝上，在腕横纹拇指侧、能摸到桡动脉搏动附近的凹陷处辨认。',
    traditionalUse: '传统常用于呼吸系统相关不适。',
    point: new THREE.Vector3(-5.8, 7, 3.56),
    normal: new THREE.Vector3(0.45, -0.52, 0.73).normalize(),
  },
]

function shuffled<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

// AI integration seam: Coze/Bailian can later choose acupoint codes or adjust
// difficulty through this request without owning real-time hit detection.
export function createTreatmentPlan(request: TreatmentPlanRequest = {}) {
  const count = THREE.MathUtils.clamp(request.needleCount ?? MAX_NEEDLES, 1, MAX_NEEDLES)
  const palmTargets = shuffled(ACUPOINTS.filter((target) => target.surface === 'PALM')).slice(0, 3)
  const backTargets = shuffled(ACUPOINTS.filter((target) => target.surface === 'BACK')).slice(0, 2)
  return shuffled([...palmTargets, ...backTargets]).slice(0, count)
}

function clampState(value: number) {
  return Math.round(THREE.MathUtils.clamp(value, 0, 100))
}

export function createLocalPatient(): PatientProfile {
  const archetype = PATIENT_ARCHETYPES[Math.floor(Math.random() * PATIENT_ARCHETYPES.length)]
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...archetype,
    age: Math.floor(20 + Math.random() * 35),
    painTolerance: Math.floor(28 + Math.random() * 62),
    vascularDifficulty: Math.floor(25 + Math.random() * 66),
  }
}

function createPatientFromAi(patient: AiPatient): PatientProfile {
  const openingLine = patient.openingDialog.trim().replace(/^["“”]+|["“”]+$/g, '')
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: patient.name.trim().slice(0, 12),
    age: clampState(patient.age),
    painTolerance: clampState(patient.painTolerance),
    vascularDifficulty: clampState(patient.vascularDifficulty),
    personality: patient.personality.trim().slice(0, 24),
    openingLine: `“${openingLine.slice(0, 48)}”`,
    trustSensitivity: THREE.MathUtils.clamp(
      0.78 + (100 - patient.painTolerance) * 0.0045,
      0.78,
      1.23,
    ),
  }
}

function createInitialPatientState(patient: PatientProfile): PatientState {
  return {
    ...INITIAL_PATIENT_STATE,
    pain: clampState(5 + (100 - patient.painTolerance) * 0.04),
    trust: clampState(76 - (patient.trustSensitivity - 0.7) * 15),
  }
}

function getPatientImpact(result: NeedleResult, patient: PatientProfile): StateDelta {
  const delta = RESULT_IMPACT[result]
  const painMultiplier = 0.72 + (100 - patient.painTolerance) * 0.008
  const bleedingMultiplier = 0.7 + patient.vascularDifficulty * 0.007
  return {
    pain: Math.round(delta.pain * painMultiplier),
    bruise: delta.bruise,
    bleeding: Math.round(delta.bleeding * bleedingMultiplier),
    numb: delta.numb,
    trust: Math.round(delta.trust * patient.trustSensitivity),
  }
}

function applyNeedleResult(
  state: PatientState,
  result: NeedleResult,
  patient: PatientProfile,
): PatientState {
  const delta = getPatientImpact(result, patient)
  return {
    pain: clampState(state.pain + delta.pain),
    bruise: clampState(state.bruise + delta.bruise),
    bleeding: clampState(state.bleeding + delta.bleeding),
    numb: clampState(state.numb + delta.numb),
    trust: clampState(state.trust + delta.trust),
    needleCount: state.needleCount + 1,
  }
}

export function createLocalTreatmentSummary(
  patientState: PatientState,
  hits: Hit[],
  patient: PatientProfile,
): TreatmentSummary {
  const resultCount = (result: NeedleResult) =>
    hits.filter((hit) => hit.result === result).length
  const successCount = resultCount('SUCCESS')
  const nerveCount = resultCount('NERVE')
  const bloodCount = resultCount('BLOOD')
  const boneCount = resultCount('BONE')
  const satisfaction = clampState(
    patientState.trust * 0.55 +
      (100 - patientState.pain) * 0.2 +
      (100 - patientState.bruise) * 0.1 +
      (100 - patientState.bleeding) * 0.08 +
      (100 - patientState.numb) * 0.07,
  )

  if (satisfaction >= 85) {
    return {
      satisfaction,
      rating: 5,
      title: '稳准轻，患者很买账',
      review: `${successCount} 针命中穴位，整段疗程节奏稳定，几乎没有让患者产生警惕。`,
      dialog: `${patient.name}：“原来针灸也可以这么轻松，下次还找你。”`,
      source: 'local',
    }
  }
  if (satisfaction >= 70) {
    return {
      satisfaction,
      rating: 4,
      title: '有惊无险，顺利收针',
      review: bloodCount
        ? `出现了 ${bloodCount} 次出血事件，但整体状态尚可，患者决定先观察你的后续表现。`
        : '偶有偏差，好在反应及时，患者的信任还没有掉出安全线。',
      dialog: `${patient.name}：“还行，不过下一针能不能再轻一点？”`,
      source: 'local',
    }
  }
  if (satisfaction >= 50) {
    return {
      satisfaction,
      rating: 3,
      title: '疗程完成，气氛有点微妙',
      review: nerveCount
        ? `神经刺激出现 ${nerveCount} 次，麻木和疼痛累积明显，精准度仍需提升。`
        : '偏针事件较多，患者全程盯着你的手，信任值勉强保住。',
      dialog: `${patient.name}：“我相信你……但我的手好像有自己的意见。”`,
      source: 'local',
    }
  }
  return {
    satisfaction,
    rating: Math.max(1, Math.round(satisfaction / 20)),
    title: '针收了，患者也想走了',
    review:
      boneCount > 0
        ? `硬组织刺激出现 ${boneCount} 次，疼痛和信任损失成为本次疗程的主要问题。`
        : '多项状态已经进入高压区，这一局的首要任务不是追求得气，而是重新找准位置。',
    dialog: `${patient.name}：“下次见面……我们还是先握个手吧。”`,
    source: 'local',
  }
}

const RESULT_COPY: Record<
  NeedleResult,
  {
    icon: string
    title: string
    message: string
    accent: string
    zone: string
    safety: string
  }
> = {
  SUCCESS: {
    icon: '◎',
    title: '精准命中',
    message: '局部出现酸、胀、沉、重或麻的“得气感”。',
    accent: '#67edb0',
    zone: '目标穴位',
    safety: '得气感可以出现，但并不等同于针尖触碰神经。',
  },
  BLOOD: {
    icon: '●',
    title: '扎到血管',
    message: '血液迅速涌出，画面进入夸张的“一针见血”时刻。',
    accent: '#ff365f',
    zone: '浅表血管区',
    safety: '现实中的少量出血或瘀青可以发生；若出血不止，应持续加压并寻求医疗帮助。',
  },
  NERVE: {
    icon: 'ϟ',
    title: '神经刺激',
    message: '瞬间电击感向手指放射，和普通得气感明显不同。',
    accent: '#77a7ff',
    zone: '神经敏感区',
    safety: '现实中若持续麻木、电击痛、感觉减退或无力，应及时寻求医疗帮助。',
  },
  BRUISE: {
    icon: '◌',
    title: '出现青紫',
    message: '皮下血管受损，青紫区域正在明显扩散。',
    accent: '#a878ff',
    zone: '软组织区',
    safety: '轻微瘀青可以发生；若面积持续扩大或伴随明显肿痛，应寻求医疗建议。',
  },
  BONE: {
    icon: '◆',
    title: '碰到硬组织',
    message: '针尖“叮”地回弹，伴随尖锐的撞击感。',
    accent: '#f4dfb5',
    zone: '硬组织区',
    safety: '现实中出现锐利或割裂样疼痛时，不应为了追求得气而强行继续刺激。',
  },
}

function classifyNeedleEvent({
  distance,
  dx,
  dy,
  correctSurface,
  surfaceIssue,
  sourcePoint,
  vascularDifficulty,
}: {
  distance: number
  dx: number
  dy: number
  correctSurface: boolean
  surfaceIssue: string | null
  sourcePoint: THREE.Vector3
  vascularDifficulty: number
}): { result: NeedleResult; eventZone: EventZone } {
  if (correctSurface && distance <= 0.82) {
    return { result: 'SUCCESS', eventZone: 'ACUPOINT' }
  }
  if (correctSurface && distance <= 1.45) {
    return { result: 'BRUISE', eventZone: 'SOFT_TISSUE' }
  }

  const spatialNoise =
    Math.abs(
      Math.sin(
        sourcePoint.x * 12.9898 +
          sourcePoint.y * 78.233 +
          sourcePoint.z * 37.719 +
          Math.atan2(dy, dx) * 9.17,
      ) * 43758.5453,
    ) % 1
  const bloodBias = THREE.MathUtils.clamp((vascularDifficulty - 50) / 250, -0.1, 0.18)

  if (!correctSurface) {
    if (surfaceIssue?.includes('侧面')) {
      return spatialNoise < 0.28
        ? { result: 'NERVE', eventZone: 'NERVE_PATH' }
        : { result: 'BRUISE', eventZone: 'SOFT_TISSUE' }
    }
    const bloodThreshold = 0.38 + bloodBias
    if (spatialNoise < bloodThreshold) return { result: 'BLOOD', eventZone: 'CAPILLARY' }
    if (spatialNoise < bloodThreshold + 0.24) return { result: 'NERVE', eventZone: 'NERVE_PATH' }
    if (spatialNoise < 0.94) return { result: 'BRUISE', eventZone: 'SOFT_TISSUE' }
    return { result: 'BONE', eventZone: 'HARD_TISSUE' }
  }

  const bloodThreshold = 0.42 + bloodBias
  if (spatialNoise < bloodThreshold) return { result: 'BLOOD', eventZone: 'CAPILLARY' }
  if (spatialNoise < bloodThreshold + 0.28) {
    return { result: 'NERVE', eventZone: 'NERVE_PATH' }
  }
  if (spatialNoise < 0.93) return { result: 'BRUISE', eventZone: 'SOFT_TISSUE' }
  return { result: 'BONE', eventZone: 'HARD_TISSUE' }
}

function playNeedleSound(result: NeedleResult) {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return

  const context = new AudioContextClass()
  const master = context.createGain()
  master.gain.setValueAtTime(0.0001, context.currentTime)
  master.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.015)
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.72)
  master.connect(context.destination)

  const tones: Record<NeedleResult, Array<[number, number, OscillatorType]>> = {
    SUCCESS: [[440, 660, 'sine']],
    BLOOD: [[150, 85, 'sine'], [220, 120, 'triangle']],
    NERVE: [[920, 1680, 'square'], [1380, 720, 'sawtooth']],
    BRUISE: [[180, 110, 'sine']],
    BONE: [[1450, 620, 'triangle'], [2100, 1100, 'sine']],
  }

  tones[result].forEach(([startFrequency, endFrequency, type], index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime + index * 0.035
    oscillator.type = type
    oscillator.frequency.setValueAtTime(startFrequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + 0.38)
    gain.gain.setValueAtTime(index === 0 ? 0.7 : 0.32, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48)
    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(start)
    oscillator.stop(start + 0.5)
  })

  window.setTimeout(() => void context.close(), 900)
}

function keepLeftHand(mesh: THREE.Mesh) {
  const source = mesh.geometry
  const index = source.index
  const position = source.attributes.position
  if (!index || !position) return

  const keptIndices: number[] = []
  const vertex = new THREE.Vector3()

  for (let i = 0; i < index.count; i += 3) {
    let worldX = 0

    for (let corner = 0; corner < 3; corner += 1) {
      vertex.fromBufferAttribute(position, index.getX(i + corner)).applyMatrix4(mesh.matrixWorld)
      worldX += vertex.x / 3
    }

    if (worldX < 2) {
      keptIndices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    }
  }

  const cropped = source.clone()
  cropped.setIndex(keptIndices)
  cropped.computeBoundingBox()
  cropped.computeBoundingSphere()
  mesh.geometry = cropped
}

function classifyHandRegion(point: THREE.Vector3) {
  const { x, y } = point

  if (y < 7.7) return '手腕'
  if (x > -1.4 && y < 17) {
    if (y > 13.2) return '拇指 · 指尖'
    if (y > 10) return '拇指 · 指节'
    return '拇指根部'
  }
  if (y < 15) {
    if (x < -9.4) return '掌部 · 小指侧'
    if (x < -4.1) return '掌部 · 中央'
    return '掌部 · 拇指侧'
  }

  const fingers = [
    { maxX: -10, name: '小指', tipY: 21.2 },
    { maxX: -7.4, name: '无名指', tipY: 23.4 },
    { maxX: -4.8, name: '中指', tipY: 24.7 },
    { maxX: Number.POSITIVE_INFINITY, name: '食指', tipY: 23.2 },
  ]
  const finger = fingers.find((candidate) => x < candidate.maxX) ?? fingers[3]
  const progress = THREE.MathUtils.clamp((y - 14.5) / (finger.tipY - 14.5), 0, 1)

  if (progress > 0.72) return `${finger.name} · 指尖`
  if (progress > 0.38) return `${finger.name} · 中节`
  return `${finger.name} · 近节`
}

function TargetMarker({ target }: { target: NeedleTarget }) {
  const pulse = useRef<THREE.Group>(null)
  const markerPosition = useMemo(
    () => target.point.clone().addScaledVector(target.normal, 0.42).sub(PALM_PIVOT),
    [target],
  )
  const markerRotation = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        target.normal,
      ),
    [target],
  )

  useFrame(({ clock }) => {
    if (!pulse.current) return
    const scale = 1 + Math.sin(clock.elapsedTime * 3.4) * 0.12
    pulse.current.scale.setScalar(scale)
  })

  return (
    <group position={markerPosition} quaternion={markerRotation}>
      <group ref={pulse}>
        <mesh>
          <ringGeometry args={[0.48, 0.72, 48]} />
          <meshBasicMaterial
            color="#74f1bc"
            transparent
            opacity={0.8}
            depthTest
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <circleGeometry args={[0.18, 32]} />
          <meshBasicMaterial
            color="#d9ffef"
            transparent
            opacity={0.95}
            depthTest
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

function SkinMarkMaterial({
  color,
  opacity,
}: {
  color: string
  opacity: number
}) {
  return (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={opacity}
      depthTest
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-5}
      polygonOffsetUnits={-5}
      blending={THREE.MultiplyBlending}
      premultipliedAlpha
      side={THREE.DoubleSide}
    />
  )
}

function PersistentMark({ hit }: { hit: Hit }) {
  const position = useMemo(
    () =>
      hit.localPoint
        .clone()
        .sub(PALM_PIVOT)
        .addScaledVector(hit.localNormal, 0.075),
    [hit],
  )
  const rotation = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        hit.localNormal,
      ),
    [hit],
  )

  return (
    <group position={position} quaternion={rotation}>
      {hit.result === 'BLOOD' && (
        <>
          <mesh>
            <circleGeometry args={[0.38, 40]} />
            <SkinMarkMaterial color="#8f0627" opacity={0.76} />
          </mesh>
          <mesh position={[0.37, -0.18, 0.006]}>
            <circleGeometry args={[0.16, 28]} />
            <SkinMarkMaterial color="#bd1238" opacity={0.7} />
          </mesh>
          <mesh position={[-0.31, 0.23, 0.008]}>
            <circleGeometry args={[0.12, 24]} />
            <SkinMarkMaterial color="#d31842" opacity={0.64} />
          </mesh>
        </>
      )}
      {hit.result === 'BRUISE' && (
        <>
          <mesh scale={[1.45, 0.92, 1]}>
            <circleGeometry args={[0.62, 56]} />
            <SkinMarkMaterial color="#6d3d8f" opacity={0.38} />
          </mesh>
          <mesh position={[0.18, -0.08, 0.007]} scale={[0.92, 1.25, 1]}>
            <circleGeometry args={[0.43, 48]} />
            <SkinMarkMaterial color="#394a91" opacity={0.3} />
          </mesh>
          <mesh position={[-0.27, 0.15, 0.009]}>
            <circleGeometry args={[0.27, 36]} />
            <SkinMarkMaterial color="#8b3b75" opacity={0.28} />
          </mesh>
        </>
      )}
      {hit.result === 'NERVE' && (
        <mesh>
          <ringGeometry args={[0.12, 0.18, 32]} />
          <meshBasicMaterial
            color="#679dff"
            transparent
            opacity={0.45}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {hit.result === 'BONE' && (
        <mesh>
          <ringGeometry args={[0.1, 0.15, 6]} />
          <meshBasicMaterial color="#d9c9aa" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}
      {hit.result === 'SUCCESS' && (
        <mesh>
          <ringGeometry args={[0.08, 0.12, 32]} />
          <meshBasicMaterial color="#55d99b" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function Needle({ hit }: { hit: Hit }) {
  const needle = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const coil = useMemo(() => {
    const points: THREE.Vector3[] = []
    for (let index = 0; index <= 70; index += 1) {
      const progress = index / 70
      const angle = progress * Math.PI * 18
      points.push(
        new THREE.Vector3(
          Math.cos(angle) * 0.03,
          Math.sin(angle) * 0.03,
          0.78 + progress * 0.32,
        ),
      )
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: '#d88f55' })
    return new THREE.Line(geometry, material)
  }, [])

  useFrame((_, delta) => {
    if (!needle.current) return
    elapsed.current += delta
    const insertionTarget =
      hit.result === 'BONE' && elapsed.current > 0.42
        ? 0.34 + Math.sin(elapsed.current * 28) * 0.035
        : 0.055
    needle.current.position.z = THREE.MathUtils.damp(
      needle.current.position.z,
      insertionTarget,
      hit.result === 'BONE' ? 13 : 9,
      delta,
    )
    needle.current.rotation.x =
      hit.result === 'NERVE' && elapsed.current > 0.3
        ? Math.sin(elapsed.current * 58) * 0.025
        : hit.result === 'BONE' && elapsed.current > 0.42
          ? -0.12
          : 0
  })

  return (
    <group position={hit.point} quaternion={hit.rotation}>
      <group ref={needle} position={[0, 0, 1.25]}>
        <mesh position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.009, 0.014, 0.82, 12]} />
          <meshStandardMaterial color="#d9e4ec" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, -0.015]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.015, 0.12, 12]} />
          <meshStandardMaterial color="#f4f8fa" metalness={0.92} roughness={0.12} />
        </mesh>
        <mesh position={[0, 0, 0.94]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.36, 16]} />
          <meshStandardMaterial color="#8d4b32" roughness={0.36} metalness={0.42} />
        </mesh>
        <primitive object={coil} />
        <mesh position={[0, 0, 1.16]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.043, 0.033, 0.06, 16]} />
          <meshStandardMaterial color="#ff4d73" roughness={0.38} />
        </mesh>
      </group>
      <mesh>
        <ringGeometry args={[0.12, 0.155, 32]} />
        <meshBasicMaterial
          color={RESULT_COPY[hit.result].accent}
          transparent
          opacity={0.9}
          depthTest={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight color={RESULT_COPY[hit.result].accent} intensity={2.2} distance={1.8} />
    </group>
  )
}

function SuccessEffect() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const cycle = (clock.elapsedTime * 1.6) % 1
    group.current.scale.setScalar(0.75 + cycle * 1.6)
    group.current.rotation.z += 0.012
  })
  return (
    <group ref={group}>
      <mesh>
        <ringGeometry args={[0.18, 0.225, 40]} />
        <meshBasicMaterial color="#67edb0" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.32, Math.sin(angle) * 0.32, 0.045]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshBasicMaterial color="#c9ffe6" toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function BloodDroplet({ index }: { index: number }) {
  const droplet = useRef<THREE.Mesh>(null)
  const startedAt = useRef<number | null>(null)
  const flight = useMemo(() => {
    const angle = (index / 18) * Math.PI * 2 + (index % 4) * 0.19
    return {
      angle,
      speed: 0.34 + (index % 5) * 0.055,
      lift: 0.62 + (index % 4) * 0.11,
      delay: (index % 3) * 0.025,
      size: 0.024 + (index % 4) * 0.006,
    }
  }, [index])

  useFrame(({ clock }) => {
    if (!droplet.current) return
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const elapsed = Math.max(clock.elapsedTime - startedAt.current - flight.delay, 0)
    const active = elapsed <= 1.15
    droplet.current.visible = active
    if (!active) return

    const distance = 0.035 + flight.speed * elapsed
    droplet.current.position.set(
      Math.cos(flight.angle) * distance,
      Math.sin(flight.angle) * distance,
      Math.max(0.025, 0.06 + flight.lift * elapsed - 0.72 * elapsed * elapsed),
    )
    const stretch = 1 + Math.min(elapsed * 1.8, 0.9)
    droplet.current.scale.set(0.72, 0.72, stretch)
  })

  return (
    <mesh ref={droplet}>
      <sphereGeometry args={[flight.size, 10, 10]} />
      <meshPhysicalMaterial
        color={index % 4 === 0 ? '#ff3158' : '#a9062d'}
        emissive="#5d001a"
        emissiveIntensity={0.28}
        roughness={0.22}
        clearcoat={0.65}
      />
    </mesh>
  )
}

function BloodEffect() {
  const splash = useRef<THREE.Group>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const startedAt = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (!splash.current) return
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const elapsed = clock.elapsedTime - startedAt.current
    const bloom = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(elapsed / 0.72, 0, 1),
      0,
      1,
    )
    splash.current.scale.set(0.16 + bloom * 0.96, 0.12 + bloom * 0.82, 1)
    splash.current.rotation.z = 0.18 + bloom * 0.1
    if (ringMaterial.current) {
      ringMaterial.current.opacity = Math.max(0, 0.7 - elapsed * 0.62)
    }
  })

  return (
    <group position={[0, 0, 0.045]}>
      <group ref={splash}>
        <mesh>
          <circleGeometry args={[0.36, 48]} />
          <meshBasicMaterial
            color="#790522"
            transparent
            opacity={0.82}
            depthWrite={false}
            blending={THREE.MultiplyBlending}
            premultipliedAlpha
          />
        </mesh>
        {Array.from({ length: 9 }, (_, index) => {
          const angle = (index / 9) * Math.PI * 2 + (index % 2) * 0.21
          const distance = 0.31 + (index % 3) * 0.065
          const radius = 0.065 + (index % 4) * 0.018
          return (
            <mesh
              key={index}
              position={[Math.cos(angle) * distance, Math.sin(angle) * distance, 0.006]}
              scale={[1.45, 0.72, 1]}
              rotation={[0, 0, angle]}
            >
              <circleGeometry args={[radius, 24]} />
              <meshBasicMaterial
                color={index % 3 === 0 ? '#bc0a35' : '#8f0529'}
                transparent
                opacity={0.76}
                depthWrite={false}
                blending={THREE.MultiplyBlending}
                premultipliedAlpha
              />
            </mesh>
          )
        })}
      </group>
      <mesh position={[0, 0, 0.018]}>
        <ringGeometry args={[0.34, 0.39, 48]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color="#ff4167"
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {Array.from({ length: 18 }, (_, index) => (
        <BloodDroplet key={index} index={index} />
      ))}
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2 + 0.25
        return (
          <mesh
            key={`ray-${index}`}
            position={[
              Math.cos(angle) * 0.43,
              Math.sin(angle) * 0.43,
              0.012,
            ]}
            rotation={[0, 0, angle]}
          >
            <planeGeometry args={[0.24, 0.018]} />
            <meshBasicMaterial
              color="#d61643"
              transparent
              opacity={0.6}
              depthWrite={false}
            />
          </mesh>
        )
      })}
      <pointLight color="#ff365f" intensity={3.2} distance={1.8} />
    </group>
  )
}

function NerveEffect() {
  const lightning = useMemo(() => {
    const positions: number[] = []
    for (let branch = 0; branch < 5; branch += 1) {
      const angle = (branch / 5) * Math.PI * 2
      let previous = new THREE.Vector3(0, 0, 0.07)
      for (let step = 1; step <= 6; step += 1) {
        const radius = step * 0.11
        const next = new THREE.Vector3(
          Math.cos(angle) * radius + Math.sin(step * 3.1 + branch) * 0.035,
          Math.sin(angle) * radius + Math.cos(step * 2.7 + branch) * 0.035,
          0.075 + (step % 2) * 0.02,
        )
        positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z)
        previous = next
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color: '#9fc2ff',
      transparent: true,
      opacity: 0.9,
    })
    return new THREE.LineSegments(geometry, material)
  }, [])
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const flicker = 0.82 + Math.sin(clock.elapsedTime * 52) * 0.18
    group.current.scale.setScalar(flicker)
    group.current.rotation.z += 0.018
  })
  return (
    <group ref={group}>
      <primitive object={lightning} />
      <pointLight color="#70a3ff" intensity={5.5} distance={2.2} />
    </group>
  )
}

function BruiseEffect() {
  const bruise = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const startedAt = useRef<number | null>(null)
  useFrame(({ clock }) => {
    if (startedAt.current === null) startedAt.current = clock.elapsedTime
    const elapsed = clock.elapsedTime - startedAt.current
    const progress = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(elapsed / 2.1, 0, 1),
      0,
      1,
    )
    bruise.current?.scale.set(0.35 + progress * 1.7, 0.3 + progress * 1.15, 1)
    if (material.current) material.current.opacity = 0.25 + progress * 0.24
  })
  return (
    <mesh ref={bruise} position={[0, 0, 0.035]}>
      <circleGeometry args={[0.4, 56]} />
      <meshBasicMaterial
        ref={material}
        color="#5d367f"
        transparent
        opacity={0.25}
        depthWrite={false}
        blending={THREE.MultiplyBlending}
        premultipliedAlpha
      />
    </mesh>
  )
}

function BoneEffect() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const pulse = 0.65 + ((clock.elapsedTime * 2.8) % 1) * 1.8
    group.current.scale.setScalar(pulse)
    group.current.rotation.z -= 0.015
  })
  return (
    <group ref={group}>
      <mesh>
        <ringGeometry args={[0.16, 0.205, 6]} />
        <meshBasicMaterial color="#fff2cf" transparent opacity={0.82} depthWrite={false} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => {
        const angle = (index / 6) * Math.PI * 2
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * 0.34, Math.sin(angle) * 0.34, 0.08]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.1, 0.018, 0.018]} />
            <meshBasicMaterial color="#fff7df" toneMapped={false} />
          </mesh>
        )
      })}
      <pointLight color="#ffe8b4" intensity={4} distance={1.6} />
    </group>
  )
}

function HitEffect({ hit }: { hit: Hit }) {
  return (
    <group position={hit.point} quaternion={hit.rotation}>
      {hit.result === 'SUCCESS' && <SuccessEffect />}
      {hit.result === 'BLOOD' && <BloodEffect />}
      {hit.result === 'NERVE' && <NerveEffect />}
      {hit.result === 'BRUISE' && <BruiseEffect />}
      {hit.result === 'BONE' && <BoneEffect />}
    </group>
  )
}

function RealisticHand({
  onHit,
  disabled,
  target,
  activeResult,
  treatmentHits,
  vascularDifficulty,
}: {
  onHit: (hit: Omit<Hit, 'needleNumber'>) => void
  disabled: boolean
  target: NeedleTarget
  activeResult: NeedleResult | null
  treatmentHits: Hit[]
  vascularDifficulty: number
}) {
  const { scene } = useGLTF('/models/hand.glb', false)
  const pointerStart = useRef<PointerStart | null>(null)
  const handGroup = useRef<THREE.Group>(null)
  const { hand } = useMemo(() => {
    const preparedHand = scene.clone(true)
    const skinMaterial = new THREE.MeshPhysicalMaterial({
      color: '#f2aa8f',
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.76,
      sheen: 0.26,
      sheenColor: new THREE.Color('#ffb0a5'),
      emissive: new THREE.Color('#421418'),
      emissiveIntensity: 0.02,
    })

    preparedHand.updateMatrixWorld(true)
    preparedHand.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      keepLeftHand(object)
      object.visible = true
      object.castShadow = true
      object.receiveShadow = true
      object.material = skinMaterial
    })

    preparedHand.updateMatrixWorld(true)
    preparedHand.position.sub(PALM_PIVOT)
    preparedHand.updateMatrixWorld(true)

    return { hand: preparedHand }
  }, [scene])

  useFrame(({ clock }) => {
    if (!handGroup.current) return
    if (activeResult === 'NERVE') {
      handGroup.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 48) * 0.035
      handGroup.current.rotation.z = -0.08 + Math.cos(clock.elapsedTime * 55) * 0.028
    } else if (activeResult === 'BONE') {
      handGroup.current.rotation.x = -0.12 + Math.sin(clock.elapsedTime * 22) * 0.012
      handGroup.current.rotation.z = -0.08
    } else {
      handGroup.current.rotation.x = -0.12
      handGroup.current.rotation.z = -0.08
    }
  })

  const rememberPointer = (event: ThreeEvent<PointerEvent>) => {
    pointerStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const registerHit = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const start = pointerStart.current
    pointerStart.current = null
    if (
      disabled ||
      !start ||
      start.pointerId !== event.pointerId ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9
    ) {
      return
    }

    const sourcePoint = hand.worldToLocal(event.point.clone())
    const normal = event.face
      ? event.face.normal
          .clone()
          .applyMatrix3(new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld))
          .normalize()
      : new THREE.Vector3(0, 0, 1)
    const palmAxis = new THREE.Vector3(0, 0, 1).transformDirection(hand.matrixWorld)
    const palmFacing = normal.dot(palmAxis)
    const clickedSurface = palmFacing > 0.45 ? 'PALM' : palmFacing < -0.45 ? 'BACK' : 'SIDE'
    const side = clickedSurface === 'PALM' ? '手心' : clickedSurface === 'BACK' ? '手背' : '手掌侧面'
    const region = classifyHandRegion(sourcePoint)
    const targetNormal = target.normal.clone().transformDirection(hand.matrixWorld)
    const surfaceAlignment = normal.dot(targetNormal)
    const surfaceIssue =
      clickedSurface === 'SIDE'
        ? '手掌侧面（侧扎）'
        : clickedSurface !== target.surface
          ? `目标位于${target.surface === 'PALM' ? '手心' : '手背'}`
          : surfaceAlignment < 0.55
            ? '入针角度过斜'
            : null
    const correctSurface = surfaceIssue === null
    const distance = Math.hypot(
      sourcePoint.x - target.point.x,
      sourcePoint.y - target.point.y,
    )
    const { result, eventZone } = classifyNeedleEvent({
      distance,
      dx: sourcePoint.x - target.point.x,
      dy: sourcePoint.y - target.point.y,
      correctSurface,
      surfaceIssue,
      sourcePoint,
      vascularDifficulty,
    })
    const markerPoint = event.point.clone().addScaledVector(normal, 0.025)
    const markerRotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    )
    const localNormal = normal
      .clone()
      .transformDirection(hand.matrixWorld.clone().invert())
      .normalize()

    onHit({
      point: markerPoint,
      localPoint: sourcePoint.clone(),
      localNormal,
      label: `${side} · ${region}`,
      rotation: markerRotation,
      distance,
      correctSurface,
      surfaceIssue,
      result,
      eventZone,
    })
  }

  return (
    <group
      ref={handGroup}
      rotation={[-0.12, 0.08, -0.08]}
      scale={0.135}
      onPointerDown={rememberPointer}
      onPointerUp={registerHit}
      onPointerCancel={() => {
        pointerStart.current = null
      }}
    >
      <primitive object={hand} />
      <TargetMarker target={target} />
      {treatmentHits.map((pastHit) => (
        <PersistentMark
          key={`${pastHit.needleNumber}-${pastHit.localPoint.toArray().join('-')}`}
          hit={pastHit}
        />
      ))}
    </group>
  )
}

function Scene({
  onHit,
  hit,
  disabled,
  target,
  treatmentHits,
  vascularDifficulty,
}: {
  onHit: (hit: Omit<Hit, 'needleNumber'>) => void
  hit: Hit | null
  disabled: boolean
  target: NeedleTarget
  treatmentHits: Hit[]
  vascularDifficulty: number
}) {
  return (
    <>
      <color attach="background" args={['#080a12']} />
      <fog attach="fog" args={['#080a12', 7, 13]} />
      <ambientLight intensity={0.42} />
      <hemisphereLight
        color="#fff2e8"
        groundColor="#292b4a"
        intensity={1.35}
      />
      <directionalLight
        position={[3.5, 5, 4.5]}
        intensity={2.8}
        color="#fff1df"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.035}
      />
      <directionalLight
        position={[-3.5, 3.2, -4.8]}
        intensity={2.45}
        color="#ffd6c7"
      />
      <directionalLight
        position={[3, -2.4, -3.8]}
        intensity={1.45}
        color="#8ba5ff"
      />
      <pointLight position={[-4, 1, 2]} color="#7181ff" intensity={12} distance={8} />
      <pointLight position={[3.2, -0.6, 2.6]} color="#ff8aa5" intensity={10} distance={7} />
      <Suspense fallback={null}>
        <RealisticHand
          onHit={onHit}
          disabled={disabled}
          target={target}
          activeResult={hit?.result ?? null}
          treatmentHits={treatmentHits}
          vascularDifficulty={vascularDifficulty}
        />
      </Suspense>
      {hit && (
        <>
          <Needle hit={hit} />
          <HitEffect hit={hit} />
        </>
      )}
      <ContactShadows position={[0, -2.05, 0]} opacity={0.42} scale={7} blur={2.8} far={5} />
      <OrbitControls
        makeDefault
        enabled={!disabled}
        target={[0, 0, 0]}
        enablePan={false}
        minDistance={4}
        maxDistance={8}
        minPolarAngle={0.45}
        maxPolarAngle={2.25}
        rotateSpeed={0.65}
        zoomSpeed={0.75}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
    </>
  )
}

function HomePage({
  patient,
  patientSource,
  patientLoading,
  onRegenerate,
  onStart,
}: {
  patient: PatientProfile
  patientSource: 'ai' | 'local'
  patientLoading: boolean
  onRegenerate: () => void
  onStart: () => void
}) {
  return (
    <main className="home-shell">
      <div className="home-orb home-orb-one" aria-hidden="true" />
      <div className="home-orb home-orb-two" aria-hidden="true" />

      <header className="home-header">
        <p className="eyebrow">NEEDLE ROULETTE · AI PATIENT</p>
        <span className="home-tag">移动端 3D 互动小游戏</span>
        <h1>一针<br />见血？</h1>
        <p>旋转手部寻找穴位，在五针之内赢得这位患者的信任。</p>
      </header>

      <section className="patient-card" aria-label="本轮虚拟患者">
        <div className="patient-card-top">
          <div className="patient-avatar" aria-hidden="true">
            {patient.name.slice(0, 1)}
          </div>
          <div>
            <p>本轮患者</p>
            <h2>{patient.name} <small>{patient.age} 岁</small></h2>
            <span>{patient.personality}</span>
          </div>
          <button type="button" onClick={onRegenerate} disabled={patientLoading}>
            {patientLoading ? 'AI 生成中' : '换一位'}
          </button>
        </div>

        <blockquote>{patient.openingLine}</blockquote>

        <div className="patient-traits">
          <div>
            <span>怕疼程度</span>
            <strong>{100 - patient.painTolerance}</strong>
            <i><b style={{ width: `${100 - patient.painTolerance}%` }} /></i>
          </div>
          <div>
            <span>血管难度</span>
            <strong>{patient.vascularDifficulty}</strong>
            <i><b style={{ width: `${patient.vascularDifficulty}%` }} /></i>
          </div>
        </div>
      </section>

      <button className="start-treatment" type="button" onClick={onStart}>
        <span>开始疗程</span>
        <small>共 5 针 · 约 2 分钟</small>
      </button>

      <p className="home-disclaimer">
        {patientSource === 'ai' ? '患者由阿里云百炼生成。' : '当前使用本地患者，百炼不可用时游戏仍可继续。'}
        本作品不是医学训练软件。
      </p>
    </main>
  )
}

function PatientStatus({ state }: { state: PatientState }) {
  const items = [
    { key: 'pain', label: '疼痛', value: state.pain, color: '#ff6d87' },
    { key: 'bruise', label: '青紫', value: state.bruise, color: '#a878ff' },
    { key: 'bleeding', label: '出血', value: state.bleeding, color: '#ff365f' },
    { key: 'numb', label: '麻木', value: state.numb, color: '#77a7ff' },
    { key: 'trust', label: '信任', value: state.trust, color: '#67edb0' },
  ]

  return (
    <section className="patient-status" aria-label="患者当前疗程状态">
      {items.map((item) => (
        <div
          key={item.key}
          className="status-item"
          style={{ '--status-color': item.color } as React.CSSProperties}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <i>
            <b style={{ width: `${item.value}%` }} />
          </i>
        </div>
      ))}
    </section>
  )
}

function TreatmentSummaryPage({
  patient,
  patientState,
  hits,
  targets,
  onRestart,
}: {
  patient: PatientProfile
  patientState: PatientState
  hits: Hit[]
  targets: NeedleTarget[]
  onRestart: () => void
}) {
  const localSummary = useMemo(
    () => createLocalTreatmentSummary(patientState, hits, patient),
    [patientState, hits, patient],
  )
  const [summary, setSummary] = useState<TreatmentSummary>(localSummary)
  const [isAiLoading, setIsAiLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const records = hits.map((item, index) => ({
      index: item.needleNumber,
      acupoint: targets[index] ? `${targets[index].code} ${targets[index].name}` : item.label,
      result: item.result,
      distance: Number(item.distance.toFixed(1)),
      correctSurface: item.correctSurface,
    }))

    requestAiTreatmentReport({
      patientJson: JSON.stringify({
        name: patient.name,
        age: patient.age,
        painTolerance: patient.painTolerance,
        vascularDifficulty: patient.vascularDifficulty,
        personality: patient.personality,
      }),
      stateJson: JSON.stringify(patientState),
      recordsJson: JSON.stringify(records),
    })
      .then((aiReport) => {
        if (cancelled) return
        const patientDialog = aiReport.patientDialog
          .trim()
          .replace(/^["“”]+|["“”]+$/g, '')
        setSummary({
          ...localSummary,
          review: aiReport.comment,
          dialog: `${patient.name}：“${patientDialog}”`,
          shareText: aiReport.shareText,
          source: 'ai',
        })
      })
      .catch((error) => {
        console.warn('[Needle Roulette AI] report fallback', error)
        if (!cancelled) setSummary(localSummary)
      })
      .finally(() => {
        if (!cancelled) setIsAiLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hits, localSummary, patient, patientState, targets])

  return (
    <main className="summary-shell">
      <header className="summary-header">
        <p className="eyebrow">NEEDLE ROULETTE · SESSION REPORT</p>
        <span>{patient.name} · 疗程完成</span>
        <h1>本次表现<br />有点东西</h1>
        <p>{summary.title}</p>
      </header>

      <section className="score-card">
        <div className="score-ring" style={{ '--score': summary.satisfaction } as React.CSSProperties}>
          <strong>{summary.satisfaction}</strong>
          <span>满意度</span>
        </div>
        <div className="score-copy">
          <p>趣味评分</p>
          <div className="rating-stars" aria-label={`${summary.rating} 星`}>
            {Array.from({ length: 5 }, (_, index) => (
              <span key={index} className={index < summary.rating ? 'active' : ''}>★</span>
            ))}
          </div>
          <small>
            {isAiLoading ? '百炼正在生成评价…' : summary.source === 'ai' ? '阿里云百炼生成评价' : '本地引擎生成 · AI 降级'}
          </small>
        </div>
      </section>

      <PatientStatus state={patientState} />

      <section className="ai-review">
        <p>疗程评价</p>
        <h2>{summary.review}</h2>
        <blockquote>{summary.dialog}</blockquote>
      </section>

      <section className="needle-history">
        <div className="section-heading">
          <span>五针记录</span>
          <small>{hits.filter((item) => item.result === 'SUCCESS').length} 次精准命中</small>
        </div>
        {hits.map((item, index) => {
          const target = targets[index]
          const copy = RESULT_COPY[item.result]
          return (
            <article key={item.needleNumber}>
              <span
                className="history-icon"
                style={{ '--history-color': copy.accent } as React.CSSProperties}
              >
                {copy.icon}
              </span>
              <div>
                <strong>第 {item.needleNumber} 针 · {target.code} {target.name}</strong>
                <small>{copy.title} · {item.correctSurface ? `误差 ${item.distance.toFixed(1)}` : item.surfaceIssue}</small>
              </div>
            </article>
          )
        })}
      </section>

      <button className="restart-button" type="button" onClick={onRestart}>
        接诊下一位患者
      </button>
      <p className="summary-disclaimer">
        {summary.source === 'ai' ? '本次趣味对白由阿里云百炼生成。' : 'AI 暂不可用，已自动切换到本地总结。'}
        内容仅作游戏科普，不构成医学建议。
      </p>
    </main>
  )
}

export default function App() {
  const [patient, setPatient] = useState<PatientProfile>(() => createLocalPatient())
  const [patientSource, setPatientSource] = useState<'ai' | 'local'>('local')
  const [patientLoading, setPatientLoading] = useState(true)
  const [started, setStarted] = useState(false)
  const [hit, setHit] = useState<Hit | null>(null)
  const [treatmentHits, setTreatmentHits] = useState<Hit[]>([])
  const [needleCount, setNeedleCount] = useState(0)
  const [patientState, setPatientState] = useState<PatientState>(() =>
    createInitialPatientState(patient),
  )
  const [showFeedback, setShowFeedback] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [sessionTargets, setSessionTargets] = useState<NeedleTarget[]>(() =>
    createTreatmentPlan(),
  )
  const patientRequestId = useRef(0)
  const startedRef = useRef(false)

  const handleHit = (nextHit: Omit<Hit, 'needleNumber'>) => {
    if (hit || needleCount >= MAX_NEEDLES) return
    const nextCount = needleCount + 1
    const recordedHit = { ...nextHit, needleNumber: nextCount }
    setNeedleCount(nextCount)
    setHit(recordedHit)
    setTreatmentHits((current) => [...current, recordedHit])
    setPatientState((current) => applyNeedleResult(current, nextHit.result, patient))
    setShowFeedback(false)
    playNeedleSound(nextHit.result)
    if ('vibrate' in navigator) {
      const vibrationPatterns: Record<NeedleResult, number | number[]> = {
        SUCCESS: 35,
        BLOOD: [45, 35, 65],
        NERVE: [20, 25, 20, 25, 65],
        BRUISE: [55, 35, 35],
        BONE: [90, 30, 45],
      }
      navigator.vibrate(vibrationPatterns[nextHit.result])
    }
  }

  useEffect(() => {
    if (!hit || showFeedback) return
    const timer = window.setTimeout(() => setShowFeedback(true), 2400)
    return () => window.clearTimeout(timer)
  }, [hit, showFeedback])

  const continueGame = () => {
    if (needleCount >= MAX_NEEDLES) {
      setHit(null)
      setShowFeedback(false)
      setShowSummary(true)
      return
    }
    setHit(null)
    setShowFeedback(false)
  }

  const resetTreatment = (nextPatient: PatientProfile) => {
    setHit(null)
    setTreatmentHits([])
    setNeedleCount(0)
    setPatientState(createInitialPatientState(nextPatient))
    setShowFeedback(false)
    setShowSummary(false)
    setSessionTargets(createTreatmentPlan())
  }

  const regeneratePatient = async () => {
    const requestId = patientRequestId.current + 1
    patientRequestId.current = requestId
    const fallbackPatient = createLocalPatient()
    setPatient(fallbackPatient)
    setPatientSource('local')
    setPatientLoading(true)
    resetTreatment(fallbackPatient)

    try {
      const generatedPatient = createPatientFromAi(await requestAiPatient())
      if (patientRequestId.current !== requestId || startedRef.current) return
      setPatient(generatedPatient)
      setPatientSource('ai')
      resetTreatment(generatedPatient)
    } catch (error) {
      console.warn('[Needle Roulette AI] patient fallback', error)
      // The locally generated patient is the intentional offline fallback.
    } finally {
      if (patientRequestId.current === requestId) setPatientLoading(false)
    }
  }

  const startTreatment = () => {
    startedRef.current = true
    patientRequestId.current += 1
    setPatientLoading(false)
    resetTreatment(patient)
    setStarted(true)
  }

  const restartTreatment = () => {
    startedRef.current = false
    setStarted(false)
    void regeneratePatient()
  }

  useEffect(() => {
    void regeneratePatient()
    // Generate once on mount; later requests are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const feedback = hit ? RESULT_COPY[hit.result] : null
  const activeDelta = hit ? getPatientImpact(hit.result, patient) : null
  const targetIndex = Math.min(
    hit ? Math.max(needleCount - 1, 0) : needleCount,
    MAX_NEEDLES - 1,
  )
  const activeTarget = sessionTargets[targetIndex]
  const activeEffect = hit?.result.toLowerCase() ?? ''

  if (!started) {
    return (
      <HomePage
        patient={patient}
        patientSource={patientSource}
        patientLoading={patientLoading}
        onRegenerate={regeneratePatient}
        onStart={startTreatment}
      />
    )
  }

  if (showSummary) {
    return (
      <TreatmentSummaryPage
        patient={patient}
        patientState={patientState}
        hits={treatmentHits}
        targets={sessionTargets}
        onRestart={restartTreatment}
      />
    )
  }

  return (
    <main className={`app-shell ${hit ? `result-${activeEffect}` : ''}`}>
      {hit && <div className="screen-effect" aria-hidden="true" />}
      <header className="topbar">
        <div>
          <p className="eyebrow">{patient.name} · {patient.personality}</p>
          <h1>一针见血？</h1>
        </div>
        <div className="needle-progress" aria-label={`第 ${Math.min(needleCount + 1, 5)} 针，共 5 针`}>
          <strong>{needleCount >= MAX_NEEDLES ? '完成' : `第 ${needleCount + 1} 针`}</strong>
          <span>/ 5</span>
        </div>
      </header>

      <PatientStatus state={patientState} />

      <section className="scene-card" aria-label="寻找穴位并下针的三维手部模型">
        <Canvas
          shadows
          camera={{ position: [0, 0.25, 6.1], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Scene
            onHit={handleHit}
            hit={hit}
            disabled={Boolean(hit)}
            target={activeTarget}
            treatmentHits={treatmentHits}
            vascularDifficulty={patient.vascularDifficulty}
          />
        </Canvas>

        <div className="scene-badge">
          <span>穴</span>
          目标：{activeTarget.code} · {activeTarget.name}
        </div>

        <div className="aim-tip">
          <i />
          {hit ? '正在进针…' : '轻触绿色光圈下针'}
        </div>

        {hit && !showFeedback && (
          <div
            className="insertion-status"
            style={{ '--result-color': RESULT_COPY[hit.result].accent } as React.CSSProperties}
          >
            <span>{RESULT_COPY[hit.result].icon}</span>
            针尖正在接触组织
          </div>
        )}

        <div className="gesture-guide" aria-hidden="true">
          <div><span className="gesture-icon">↔</span>拖动旋转</div>
          <div><span className="gesture-icon">↕</span>双指缩放</div>
          <div><span className="gesture-icon">●</span>轻触下针</div>
        </div>
      </section>

      <footer className="control-panel">
        <div className="target-copy">
          <p className="label">
            {activeTarget.surface === 'PALM' ? '手心穴位' : '手背穴位'} · {activeTarget.meridian}
          </p>
          <h2>{activeTarget.code} · {activeTarget.name}</h2>
          <p>
            {hit
              ? `落点：${hit.label}`
              : `快速找：${activeTarget.quickLocation}`}
          </p>
        </div>
        <div className="shot-dots" aria-label={`已完成 ${needleCount} 针`}>
          {Array.from({ length: MAX_NEEDLES }, (_, index) => (
            <span
              key={index}
              className={
                treatmentHits[index]
                  ? `done ${treatmentHits[index].result.toLowerCase()}`
                  : ''
              }
            />
          ))}
        </div>
      </footer>

      {showFeedback && feedback && hit && (
        <div className="feedback-backdrop" role="presentation">
          <section
            className="feedback-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            style={{ '--result-color': feedback.accent } as React.CSSProperties}
          >
            <div className="result-icon">{feedback.icon}</div>
            <p className="feedback-kicker">第 {hit.needleNumber} / {MAX_NEEDLES} 针</p>
            <h2 id="feedback-title">{feedback.title}</h2>
            <p>{feedback.message}</p>
            <div className="knowledge-card">
              <strong>{activeTarget.code} · {activeTarget.name}</strong>
              <em>{activeTarget.meridian}</em>
              <span><b>标准位置：</b>{activeTarget.location}</span>
              <span><b>快速找法：</b>{activeTarget.quickLocation}</span>
              <small>{activeTarget.traditionalUse}</small>
              <small className="source-note">
                定位参考 GB/T 12346-2021 与 WHO 标准 · 仅供游戏科普，不作为针刺指导
              </small>
            </div>
            <div className="event-zone-row">
              <span>触发区域</span>
              <strong>{feedback.zone}</strong>
            </div>
            <div className="distance-row">
              <span>{hit.correctSurface ? '落点误差' : '落点表面'}</span>
              <strong>{hit.correctSurface ? hit.distance.toFixed(1) : hit.surfaceIssue}</strong>
            </div>
            {activeDelta && (
              <div className="state-delta" aria-label="本针状态变化">
                {Object.entries(activeDelta)
                  .filter(([, value]) => value !== 0)
                  .map(([key, value]) => {
                    const labels: Record<string, string> = {
                      pain: '疼痛',
                      bruise: '青紫',
                      bleeding: '出血',
                      numb: '麻木',
                      trust: '信任',
                    }
                    const isHarm = key === 'trust' ? value < 0 : value > 0
                    return (
                      <span key={key} className={isHarm ? 'harm' : 'good'}>
                        {labels[key]} {value > 0 ? '+' : ''}{value}
                      </span>
                    )
                  })}
              </div>
            )}
            <p className="safety-note">{feedback.safety}</p>
            <button type="button" onClick={continueGame}>
              {needleCount >= MAX_NEEDLES ? '查看疗程报告' : '继续下一针'}
            </button>
            <p className="education-note">穴位定位参考 WHO 标准，仅作游戏科普，不构成医疗建议。</p>
          </section>
        </div>
      )}
    </main>
  )
}

useGLTF.preload('/models/hand.glb', false)
