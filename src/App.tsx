import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

type Hit = {
  point: THREE.Vector3
  label: string
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
      vertex
        .fromBufferAttribute(position, index.getX(i + corner))
        .applyMatrix4(mesh.matrixWorld)
      worldX += vertex.x / 3
    }

    // There is a clean empty band between the two source hands (x=1..3).
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

type HitRegion = {
  label: string
  position: [number, number, number]
  size: [number, number, number]
  rotation?: [number, number, number]
}

const hitRegions: HitRegion[] = [
  { label: '手腕', position: [-5.8, 3.2, 1.3], size: [6.8, 6.4, 7.8] },
  { label: '掌部 · 拇指侧', position: [-8.2, 10.5, 1.3], size: [3.1, 7.8, 7.8] },
  { label: '掌心中央', position: [-5.2, 10.5, 1.3], size: [3.1, 7.8, 7.8] },
  { label: '掌部 · 小指侧', position: [-2.2, 10.5, 1.3], size: [3.1, 7.8, 7.8] },
  {
    label: '拇指根部',
    position: [-9.7, 10.4, 1.3],
    size: [3.5, 3.1, 7.8],
    rotation: [0, 0, -0.72],
  },
  {
    label: '拇指 · 指节',
    position: [-11.1, 12.5, 1.3],
    size: [3.2, 2.8, 7.8],
    rotation: [0, 0, -0.72],
  },
  {
    label: '拇指 · 指尖',
    position: [-11.1, 14.8, 1.3],
    size: [3, 2.8, 7.8],
    rotation: [0, 0, -0.72],
  },
  { label: '食指 · 近节', position: [-8.5, 16.2, 1.3], size: [2.7, 3.1, 7.8] },
  { label: '食指 · 中节', position: [-8.5, 19.3, 1.3], size: [2.7, 3.1, 7.8] },
  { label: '食指 · 指尖', position: [-8.5, 22.2, 1.3], size: [2.7, 2.8, 7.8] },
  { label: '中指 · 近节', position: [-5.7, 16.4, 1.3], size: [2.7, 3.3, 7.8] },
  { label: '中指 · 中节', position: [-5.7, 20, 1.3], size: [2.7, 3.7, 7.8] },
  { label: '中指 · 指尖', position: [-5.7, 23.3, 1.3], size: [2.7, 3, 7.8] },
  { label: '无名指 · 近节', position: [-3.2, 16.3, 1.3], size: [2.5, 3.2, 7.8] },
  { label: '无名指 · 中节', position: [-3.2, 19.5, 1.3], size: [2.5, 3.2, 7.8] },
  { label: '无名指 · 指尖', position: [-3.2, 22.3, 1.3], size: [2.5, 2.7, 7.8] },
  { label: '小指 · 近节', position: [-0.9, 15.8, 1.3], size: [2.4, 2.8, 7.8] },
  { label: '小指 · 中节', position: [-0.9, 18.4, 1.3], size: [2.4, 2.6, 7.8] },
  { label: '小指 · 指尖', position: [-0.9, 20.6, 1.3], size: [2.4, 2.3, 7.8] },
]

function HandHitRegions({
  center,
  onHit,
}: {
  center: THREE.Vector3
  onHit: (hit: Hit) => void
}) {
  return (
    <group position={[-center.x, -center.y, -center.z]}>
      {hitRegions.map((region) => (
        <mesh
          key={region.label}
          position={region.position}
          rotation={region.rotation}
          onPointerDown={(event) => {
            event.stopPropagation()
            onHit({ point: event.point.clone(), label: region.label })
          }}
        >
          <boxGeometry args={region.size} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

function HitMarker({ hit }: { hit: Hit }) {
  const ring = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ring.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 6) * 0.14
    ring.current.scale.setScalar(pulse)
    ring.current.rotation.z += 0.008
  })

  return (
    <group position={hit.point}>
      <mesh ref={ring}>
        <torusGeometry args={[0.13, 0.022, 12, 32]} />
        <meshBasicMaterial color="#ff4d7d" toneMapped={false} />
      </mesh>
      <pointLight color="#ff466f" intensity={1.8} distance={1.6} />
    </group>
  )
}

function RealisticHand({ onHit }: { onHit: (hit: Hit) => void }) {
  const { scene } = useGLTF('/models/hand.glb')
  const { hand, center } = useMemo(() => {
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
    const bounds = new THREE.Box3().setFromObject(preparedHand)

    return {
      hand: preparedHand,
      center: bounds.getCenter(new THREE.Vector3()),
    }
  }, [scene])

  return (
    <group rotation={[-0.12, 0.08, -0.08]} scale={0.135}>
      <primitive object={hand} position={[-center.x, -center.y, -center.z]} />
      <HandHitRegions center={center} onHit={onHit} />
    </group>
  )
}

function Scene({ onHit, hit }: { onHit: (hit: Hit) => void; hit: Hit | null }) {
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
        <RealisticHand onHit={onHit} />
        <Environment preset="studio" environmentIntensity={0.45} />
      </Suspense>
      {hit && <HitMarker hit={hit} />}
      <ContactShadows position={[0, -2.05, 0]} opacity={0.42} scale={7} blur={2.8} far={5} />
      <OrbitControls
        makeDefault
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
  const [hitCount, setHitCount] = useState(0)

  const handleHit = (nextHit: Hit) => {
    setHit(nextHit)
    setHitCount((count) => count + 1)
    if ('vibrate' in navigator) navigator.vibrate(28)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">NEEDLE ROULETTE · PROTOTYPE 01</p>
          <h1>一针见血？</h1>
        </div>
        <div className="stage-pill">
          <span className="live-dot" />
          3D 场景
        </div>
      </header>

      <section className="scene-card" aria-label="可交互的三维手部模型">
        <Canvas
          shadows
          camera={{ position: [0, 0.25, 6.1], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => setHit(null)}
        >
          <Scene onHit={handleHit} hit={hit} />
        </Canvas>

        <div className="scene-badge">
          <span>01</span>
          单手游戏模型
        </div>

        <div className="gesture-guide" aria-hidden="true">
          <div>
            <span className="gesture-icon">↻</span>
            单指旋转
          </div>
          <div>
            <span className="gesture-icon">⌁</span>
            双指缩放
          </div>
          <div>
            <span className="gesture-icon">＋</span>
            点按测试
          </div>
        </div>
      </section>

      <footer className="control-panel">
        <div className="target-copy">
          <p className="label">交互测试</p>
          <h2>{hit ? `已命中 · ${hit.label}` : '触摸手部任意位置'}</h2>
          <p>{hit ? '点击检测工作正常，红色光圈标记了触点。' : '转动模型，找一个你想“下针”的位置。'}</p>
        </div>
        <div className="hit-counter" aria-label={`已测试 ${hitCount} 次`}>
          <strong>{String(hitCount).padStart(2, '0')}</strong>
          <span>触点</span>
        </div>
      </footer>
    </main>
  )
}

useGLTF.preload('/models/hand.glb')
