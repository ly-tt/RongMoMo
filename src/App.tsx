import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

type NeedleResult = 'SUCCESS' | 'BLOOD' | 'NERVE' | 'BRUISE' | 'BONE'
type EventZone = 'ACUPOINT' | 'CAPILLARY' | 'NERVE_PATH' | 'SOFT_TISSUE' | 'HARD_TISSUE'

type Hit = {
  point: THREE.Vector3
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
  location: string
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

const PALM_PIVOT = new THREE.Vector3(-5.3, 11.5, 1.3)
const MAX_NEEDLES = 5
const ACUPOINTS: NeedleTarget[] = [
  {
    code: 'LI4',
    name: '合谷',
    surface: 'BACK',
    location: '手背，第 1、2 掌骨之间，偏第 2 掌骨中点桡侧',
    traditionalUse: '传统常用于头面部、牙齿及头部不适。',
    point: new THREE.Vector3(-3.2, 12.2, 1.66),
    normal: new THREE.Vector3(0.38, 0.36, -0.85).normalize(),
  },
  {
    code: 'PC8',
    name: '劳宫',
    surface: 'PALM',
    location: '掌心，第 2、3 掌骨之间，握拳时中指尖附近',
    traditionalUse: '传统常用于手心发热、紧张烦躁等。',
    point: new THREE.Vector3(-4.9, 13, 2.93),
    normal: new THREE.Vector3(-0.03, 0.69, 0.72).normalize(),
  },
  {
    code: 'HT8',
    name: '少府',
    surface: 'PALM',
    location: '掌心，第 4、5 掌骨之间，握拳时小指尖附近',
    traditionalUse: '传统常用于心烦、手掌发热等。',
    point: new THREE.Vector3(-9.4, 13, 3.06),
    normal: new THREE.Vector3(0.26, 0.33, 0.91).normalize(),
  },
  {
    code: 'LU10',
    name: '鱼际',
    surface: 'PALM',
    location: '拇指根部隆起处，第 1 掌骨中点桡侧',
    traditionalUse: '传统常用于咽喉、咳嗽等相关不适。',
    point: new THREE.Vector3(-2.4, 11.5, 3.54),
    normal: new THREE.Vector3(0.58, -0.08, 0.81).normalize(),
  },
  {
    code: 'SI3',
    name: '后溪',
    surface: 'BACK',
    location: '小指掌指关节后方，手掌尺侧横纹末端附近',
    traditionalUse: '传统常用于颈肩、后脑及腰背不适。',
    point: new THREE.Vector3(-11.2, 14.5, 1.18),
    normal: new THREE.Vector3(-0.69, 0.18, -0.7).normalize(),
  },
  {
    code: 'TE3',
    name: '中渚',
    surface: 'BACK',
    location: '手背，第 4、5 掌骨之间，掌指关节近端',
    traditionalUse: '传统常用于耳部、头部及手指不适。',
    point: new THREE.Vector3(-10, 14.2, 0.45),
    normal: new THREE.Vector3(-0.48, 0.03, -0.87).normalize(),
  },
  {
    code: 'TE4',
    name: '阳池',
    surface: 'BACK',
    location: '手背腕横纹，腕关节中央略偏小指侧',
    traditionalUse: '传统常用于手腕不适。',
    point: new THREE.Vector3(-8.3, 6.8, -0.31),
    normal: new THREE.Vector3(-0.01, 0.26, -0.97).normalize(),
  },
  {
    code: 'HT7',
    name: '神门',
    surface: 'PALM',
    location: '掌侧腕横纹，小指侧腕屈肌腱桡侧',
    traditionalUse: '传统常用于失眠、紧张及心神不宁。',
    point: new THREE.Vector3(-9.5, 6.8, 3.7),
    normal: new THREE.Vector3(-0.2, -0.42, 0.88).normalize(),
  },
  {
    code: 'PC7',
    name: '大陵',
    surface: 'PALM',
    location: '掌侧腕横纹中央，两条屈肌腱之间',
    traditionalUse: '传统常用于手腕不适、紧张等。',
    point: new THREE.Vector3(-7.5, 6.8, 4.07),
    normal: new THREE.Vector3(-0.04, -0.46, 0.89).normalize(),
  },
  {
    code: 'LU9',
    name: '太渊',
    surface: 'PALM',
    location: '掌侧腕横纹，大拇指一侧的凹陷处',
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

const RESULT_COPY: Record<
  NeedleResult,
  { icon: string; title: string; message: string; accent: string; zone: string }
> = {
  SUCCESS: {
    icon: '◎',
    title: '精准命中',
    message: '酸麻感轻轻扩散，这一针很漂亮。',
    accent: '#67edb0',
    zone: '目标穴位',
  },
  BLOOD: {
    icon: '●',
    title: '扎到血管',
    message: '红色液滴突然冒出，患者倒吸了一口凉气。',
    accent: '#ff365f',
    zone: '浅表血管区',
  },
  NERVE: {
    icon: 'ϟ',
    title: '神经刺激',
    message: '一阵麻麻的电流穿过手掌，手指都抖了一下。',
    accent: '#77a7ff',
    zone: '神经敏感区',
  },
  BRUISE: {
    icon: '◌',
    title: '出现青紫',
    message: '落点附近慢慢泛紫，这一针偏得有点微妙。',
    accent: '#a878ff',
    zone: '软组织区',
  },
  BONE: {
    icon: '◆',
    title: '碰到硬组织',
    message: '针尖“叮”地弹了一下，角度明显不对。',
    accent: '#f4dfb5',
    zone: '硬组织区',
  },
}

function classifyNeedleEvent({
  distance,
  dx,
  dy,
  correctSurface,
}: {
  distance: number
  dx: number
  dy: number
  correctSurface: boolean
}): { result: NeedleResult; eventZone: EventZone } {
  if (!correctSurface) return { result: 'BONE', eventZone: 'HARD_TISSUE' }
  if (distance <= 0.82) return { result: 'SUCCESS', eventZone: 'ACUPOINT' }
  if (distance <= 1.5) return { result: 'BRUISE', eventZone: 'SOFT_TISSUE' }

  const angle = Math.atan2(dy, dx)
  if (angle >= -Math.PI / 3 && angle < Math.PI / 3) {
    return { result: 'BLOOD', eventZone: 'CAPILLARY' }
  }
  if (angle >= Math.PI / 3) {
    return { result: 'NERVE', eventZone: 'NERVE_PATH' }
  }
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

function BloodEffect() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 9) * 0.08
    group.current.scale.setScalar(pulse)
    group.current.rotation.z += 0.006
  })
  return (
    <group ref={group}>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2 + (index % 3) * 0.18
        const radius = 0.12 + (index % 4) * 0.075
        return (
          <mesh
            key={index}
            position={[
              Math.cos(angle) * radius,
              Math.sin(angle) * radius,
              0.06 + (index % 3) * 0.055,
            ]}
            scale={[0.7, 0.7, 1.5]}
          >
            <sphereGeometry args={[0.045 - (index % 3) * 0.008, 10, 10]} />
            <meshPhysicalMaterial
              color="#c90f38"
              emissive="#6b0019"
              emissiveIntensity={0.55}
              roughness={0.2}
              clearcoat={0.8}
            />
          </mesh>
        )
      })}
      <pointLight color="#ff214d" intensity={3.5} distance={1.8} />
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
  useFrame(({ clock }) => {
    const cycle = Math.min((clock.elapsedTime % 4) / 1.2, 1)
    bruise.current?.scale.setScalar(0.3 + cycle * 1.35)
    if (material.current) material.current.opacity = 0.42 - cycle * 0.1
  })
  return (
    <mesh ref={bruise} position={[0, 0, 0.035]}>
      <circleGeometry args={[0.34, 48]} />
      <meshBasicMaterial
        ref={material}
        color="#673a91"
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.MultiplyBlending}
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
}: {
  onHit: (hit: Omit<Hit, 'needleNumber'>) => void
  disabled: boolean
  target: NeedleTarget
  activeResult: NeedleResult | null
}) {
  const { scene } = useGLTF('/models/hand.glb')
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
    })
    const markerPoint = event.point.clone().addScaledVector(normal, 0.025)
    const markerRotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    )

    onHit({
      point: markerPoint,
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
    </group>
  )
}

function Scene({
  onHit,
  hit,
  disabled,
  target,
}: {
  onHit: (hit: Omit<Hit, 'needleNumber'>) => void
  hit: Hit | null
  disabled: boolean
  target: NeedleTarget
}) {
  return (
    <>
      <color attach="background" args={['#080a12']} />
      <fog attach="fog" args={['#080a12', 7, 13]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[3, 5, 4]}
        intensity={3.3}
        color="#fff1df"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-4, 1, 2]} color="#5b6dff" intensity={18} distance={8} />
      <pointLight position={[3.2, -0.6, 2.6]} color="#ff7398" intensity={13} distance={7} />
      <Suspense fallback={null}>
        <RealisticHand
          onHit={onHit}
          disabled={disabled}
          target={target}
          activeResult={hit?.result ?? null}
        />
        <Environment preset="studio" environmentIntensity={0.45} />
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

export default function App() {
  const [hit, setHit] = useState<Hit | null>(null)
  const [needleCount, setNeedleCount] = useState(0)
  const [showFeedback, setShowFeedback] = useState(false)
  const [sessionTargets, setSessionTargets] = useState<NeedleTarget[]>(() =>
    createTreatmentPlan(),
  )

  const handleHit = (nextHit: Omit<Hit, 'needleNumber'>) => {
    if (hit || needleCount >= MAX_NEEDLES) return
    const nextCount = needleCount + 1
    setNeedleCount(nextCount)
    setHit({ ...nextHit, needleNumber: nextCount })
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
    const timer = window.setTimeout(() => setShowFeedback(true), 1350)
    return () => window.clearTimeout(timer)
  }, [hit, showFeedback])

  const continueGame = () => {
    if (needleCount >= MAX_NEEDLES) {
      setNeedleCount(0)
      setSessionTargets(createTreatmentPlan())
    }
    setHit(null)
    setShowFeedback(false)
  }

  const feedback = hit ? RESULT_COPY[hit.result] : null
  const targetIndex = Math.min(
    hit ? Math.max(needleCount - 1, 0) : needleCount,
    MAX_NEEDLES - 1,
  )
  const activeTarget = sessionTargets[targetIndex]
  const activeEffect = hit?.result.toLowerCase() ?? ''

  return (
    <main className={`app-shell ${hit ? `result-${activeEffect}` : ''}`}>
      {hit && <div className="screen-effect" aria-hidden="true" />}
      <header className="topbar">
        <div>
          <p className="eyebrow">NEEDLE ROULETTE · FIRST SESSION</p>
          <h1>一针见血？</h1>
        </div>
        <div className="needle-progress" aria-label={`第 ${Math.min(needleCount + 1, 5)} 针，共 5 针`}>
          <strong>{needleCount >= MAX_NEEDLES ? '完成' : `第 ${needleCount + 1} 针`}</strong>
          <span>/ 5</span>
        </div>
      </header>

      <section className="scene-card" aria-label="寻找穴位并下针的三维手部模型">
        <Canvas
          shadows
          camera={{ position: [0, 0.25, 6.1], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <Scene onHit={handleHit} hit={hit} disabled={Boolean(hit)} target={activeTarget} />
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
          <p className="label">{activeTarget.surface === 'PALM' ? '手心穴位' : '手背穴位'}</p>
          <h2>{activeTarget.location}</h2>
          <p>{hit ? `落点：${hit.label}` : '每局随机抽取五个真实穴位，旋转观察后轻触下针。'}</p>
        </div>
        <div className="shot-dots" aria-label={`已完成 ${needleCount} 针`}>
          {Array.from({ length: MAX_NEEDLES }, (_, index) => (
            <span key={index} className={index < needleCount ? 'done' : ''} />
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
              <span>{activeTarget.location}</span>
              <small>{activeTarget.traditionalUse}</small>
            </div>
            <div className="event-zone-row">
              <span>触发区域</span>
              <strong>{feedback.zone}</strong>
            </div>
            <div className="distance-row">
              <span>{hit.correctSurface ? '落点误差' : '落点表面'}</span>
              <strong>{hit.correctSurface ? hit.distance.toFixed(1) : hit.surfaceIssue}</strong>
            </div>
            <button type="button" onClick={continueGame}>
              {needleCount >= MAX_NEEDLES ? '再来一轮' : '继续下一针'}
            </button>
            <p className="education-note">穴位定位参考 WHO 标准，仅作游戏科普，不构成医疗建议。</p>
          </section>
        </div>
      )}
    </main>
  )
}

useGLTF.preload('/models/hand.glb')
