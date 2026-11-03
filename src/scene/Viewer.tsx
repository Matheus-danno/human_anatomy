import { Canvas } from '@react-three/fiber'
import { Environment, GizmoHelper, GizmoViewport, Lightformer, OrbitControls } from '@react-three/drei'
import { Suspense, useCallback, useState } from 'react'
import type { Box3 } from 'three'
import { SYSTEM_IDS } from '../data/systems'
import { useAnatomyStore } from '../store/useAnatomyStore'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'
import { HoverController } from './HoverController'
import { LodController } from './LodController'
import { PerfProbe } from './PerfProbe'
import { SystemModel } from './SystemModel'

// Ambiente "HDRI" gerado na própria cena com painéis de luz: iluminação suave de estúdio sem baixar
// nenhum arquivo .hdr (o preset do drei buscaria a imagem num CDN externo). Ambiente mais fraco que a
// luz principal, para o relevo dos músculos aparecer.
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.75}>
      <Lightformer form="rect" intensity={2.5} position={[0, 4, 6]} scale={[10, 4, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[-6, 2, 0]} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[6, 2, 0]} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[0, 3, -6]} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={0.3} position={[0, -5, 0]} scale={[10, 10, 1]} />
    </Environment>
  )
}

export function Viewer() {
  const requested = useAnatomyStore((s) => s.requested)
  const quality = useAnatomyStore((s) => s.quality)
  const [bounds, setBounds] = useState<Box3 | null>(null)
  // Todos os sistemas ocupam o mesmo corpo: o primeiro que carregar define o enquadramento.
  const handleLoaded = useCallback((b: Box3) => {
    setBounds((prev) => {
      // Marca de desempenho: primeiro frame com o corpo na tela (ver pipeline/perf_report.mjs).
      if (!prev) requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('primeira-tela')))
      return prev ?? b
    })
  }, [])

  return (
    // Resolução controlada pelo AdaptiveResolution (Effects.tsx).
    <Canvas camera={{ position: [0, 0.9, 4], fov: 35, near: 0.01, far: 100 }} dpr={1}>
      <StudioEnvironment />
      {/* Luz principal (frente-direita, de cima) e luz de recorte fria por trás para destacar a silhueta. */}
      <directionalLight position={[2, 4, 3]} intensity={1.8} />
      <directionalLight position={[-3, 3, -4]} intensity={0.9} color="#d6e4ff" />
      <Effects />
      {SYSTEM_IDS.filter((id) => requested[id]).map((id) => (
        // Um Suspense por sistema: baixar um novo não desmonta os que já estão na tela.
        <Suspense key={id} fallback={null}>
          <SystemModel system={id} onLoaded={handleLoaded} />
        </Suspense>
      ))}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      {bounds && <CameraRig bounds={bounds} />}
      <HoverController />
      <LodController />
      <PerfProbe />
      {/* O Hud do gizmo com prioridade 1 desenha a cena principal sozinho. Na qualidade alta quem desenha é o
          EffectComposer (prioridade 1): com o gizmo também em 1 a cena saía duas vezes e o desenho direto
          sobrescrevia o pós-processamento. Ali o gizmo vai para 2 e só desenha o overlay por cima. */}
      <GizmoHelper alignment="bottom-right" margin={[64, 64]} renderPriority={quality === 'alta' ? 2 : 1}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  )
}
