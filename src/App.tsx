import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, RoundedBox } from '@react-three/drei'
import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'

type Hit = {
  point: THREE.Vector3
  label: string
}

function Finger({
  position,
  rotation = [0, 0, 0],
  length,
  radius,
  onHit,
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  length: number
  radius: number
  onHit: (event: ThreeEvent<MouseEvent>) => void
}) {
  return (
    <mesh position={position} rotation={rotation} onClick={onHit} castShadow receiveShadow>
      <capsuleGeometry args={[radius, length, 10, 20]} />
      <meshStandardMaterial color="#dba88d" roughness={0.58} metalness={0.02} />
    </mesh>
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

function Hand({ onHit, hit }: { onHit: (hit: Hit) => void; hit: Hit | null }) {
  const registerHit = (part: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const localPoint = event.point.clone()
    onHit({ point: localPoint, label: part })
  }

  return (
    <group rotation={[-0.25, 0.08, -0.1]} position={[0, -0.25, 0]}>
      <RoundedBox
        args={[1.72, 2.05, 0.48]}
        radius={0.3}
        smoothness={6}
        position={[0, -0.1, 0]}
        onClick={registerHit('掌心')}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#dda98f" roughness={0.62} />
      </RoundedBox>

      <Finger position={[-0.64, 1.45, 0]} length={1.05} radius={0.2} onHit={registerHit('小指')} />
      <Finger position={[-0.22, 1.67, 0]} length={1.38} radius={0.21} onHit={registerHit('无名指')} />
      <Finger position={[0.22, 1.74, 0]} length={1.52} radius={0.22} onHit={registerHit('中指')} />
      <Finger position={[0.64, 1.55, 0]} length={1.2} radius={0.21} onHit={registerHit('食指')} />
      <Finger
        position={[1.03, 0.18, 0]}
        rotation={[0, 0, -0.72]}
        length={0.95}
        radius={0.23}
        onHit={registerHit('拇指')}
      />

      <RoundedBox
        args={[1.15, 0.9, 0.43]}
        radius={0.22}
        smoothness={5}
        position={[0, -1.46, 0]}
        onClick={registerHit('手腕')}
        castShadow
      >
        <meshStandardMaterial color="#d9a187" roughness={0.66} />
      </RoundedBox>

      {hit && <HitMarker hit={hit} />}
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
        intensity={3}
        color="#fff0dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-4, 1, 2]} color="#5b6dff" intensity={18} distance={8} />
      <Suspense fallback={null}>
        <Hand onHit={onHit} hit={hit} />
        <Environment preset="studio" environmentIntensity={0.45} />
      </Suspense>
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
          临时手部模型
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
