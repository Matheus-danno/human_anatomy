import { ContactShadows, PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { SYSTEM_IDS } from '../data/systems'
import { useAnatomyStore } from '../store/useAnatomyStore'
import { PERF_ENABLED } from './PerfProbe'

/**
 * Fundo em gradiente radial desenhado na própria cena (as mesmas cores do fundo CSS). Com pós-processamento
 * o canvas deixa de ser transparente, então o fundo precisa estar dentro do frame.
 */
const GRADIENT_STOPS: [number, string][] = [
  [0, '#4b5563'],
  [0.55, '#1f2937'],
  [1, '#0b0f17'],
]

// Curva ACES do three (RRTAndODTFit com exposição /0,6). Para cores quase neutras, como as do fundo, as
// matrizes de entrada/saída do ACES se anulam e ela age por canal.
const acesChannel = (x: number) => {
  const v = x / 0.6
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
}
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/**
 * Na qualidade alta o fundo passa pelo tone mapping do pós-processamento e escurecia. A cor de cada parada é
 * pré-compensada (ACES invertido por bisseção) para que, depois do tone mapping, fique igual à da baixa.
 */
function precompensate(hex: string): string {
  const channels = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const inverted = channels.map((target) => {
    let lo = 0
    let hi = 8
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (acesChannel(mid) < target) lo = mid
      else hi = mid
    }
    return Math.round(Math.min(1, linearToSrgb((lo + hi) / 2)) * 255)
  })
  return `rgb(${inverted.join(',')})`
}

function GradientBackground({ toneMapped }: { toneMapped: boolean }) {
  const scene = useThree((s) => s.scene)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 362)
    for (const [offset, color] of GRADIENT_STOPS) gradient.addColorStop(offset, toneMapped ? precompensate(color) : color)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 512, 512)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [toneMapped])
  useEffect(() => {
    scene.background = texture
    return () => {
      scene.background = null
    }
  }, [scene, texture])
  return null
}

/**
 * Sombra de contato sob os pés (y = 0). Renderizada uma vez e refeita quando mudam os sistemas visíveis ou
 * carregados — redesenhar a cada frame dobraria o custo com milhões de triângulos.
 */
function FloorShadow() {
  const signature = useAnatomyStore((s) => SYSTEM_IDS.map((id) => `${+s.visible[id]}${+s.loaded[id]}`).join(''))
  return (
    <ContactShadows
      key={signature}
      frames={1}
      position={[0, -0.002, 0]}
      scale={1.6}
      far={0.45}
      blur={2.5}
      opacity={0.55}
      resolution={512}
      color="#05070b"
    />
  )
}

const PostProcessing = lazy(() => import('./PostProcessing'))

/** `?perf`: o que o monitor de desempenho viu (lido pelo relatório). */
const monitorLog: { fps: number; averages: number[] }[] = []
if (PERF_ENABLED) (window as unknown as { __monitor: typeof monitorLog }).__monitor = monitorLog

/** Resolução máxima e mínima na qualidade alta (a baixa usa 1). */
const MAX_DPR = 1.5
const MIN_DPR = 0.75
const DPR_STEP = 0.25
/** Espera após o último carregamento antes de medir o fps. */
const SETTLE_MS = 3000

/**
 * Resolução adaptativa. Medido na GPU integrada (Intel UHD): na qualidade alta o custo é por pixel
 * (sheen/clearcoat), e com 13 sistemas o frame passava de 16,7 ms em resolução cheia. Queda de fps:
 * primeiro reduz a resolução; já no mínimo, passa para a qualidade baixa (se o usuário não escolheu).
 */
function AdaptiveResolution({ quality }: { quality: 'alta' | 'baixa' }) {
  const setDpr = useThree((s) => s.setDpr)
  const degradeQuality = useAnatomyStore((s) => s.degradeQuality)
  const maxDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const dpr = useRef(maxDpr)

  useEffect(() => {
    dpr.current = quality === 'alta' ? maxDpr : 1
    setDpr(dpr.current)
  }, [quality, maxDpr, setDpr])

  const decline = () => {
    if (quality === 'alta' && dpr.current > MIN_DPR) {
      dpr.current = Math.max(MIN_DPR, dpr.current - DPR_STEP)
      setDpr(dpr.current)
    } else degradeQuality()
  }
  const incline = () => {
    if (quality !== 'alta' || dpr.current >= maxDpr) return
    dpr.current = Math.min(maxDpr, dpr.current + DPR_STEP)
    setDpr(dpr.current)
  }

  // Só mede com a cena estável: durante o carregamento (download, BVH, compilação de shaders) há travamentos
  // normais que fariam o monitor rebaixar a qualidade de uma máquina que aguenta a alta.
  const loading = useAnatomyStore((s) => SYSTEM_IDS.some((id) => s.requested[id] && !s.loaded[id]))
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    if (loading) return
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [loading])

  if (!settled) return null
  return (
    <PerformanceMonitor
      bounds={() => [50, 58]}
      flipflops={6}
      onDecline={decline}
      onIncline={incline}
      onChange={PERF_ENABLED ? (api) => monitorLog.push({ fps: Math.round(api.fps), averages: api.averages.map(Math.round) }) : undefined}
    />
  )
}

/** Qualidade alta: SSAO (N8AO), tone mapping ACES no pós-processamento e sombra de contato. */
export function Effects() {
  const quality = useAnatomyStore((s) => s.quality)

  return (
    <>
      <GradientBackground toneMapped={quality === 'alta'} />
      <AdaptiveResolution quality={quality} />
      {quality === 'alta' && (
        <>
          <FloorShadow />
          <Suspense fallback={null}>
            <PostProcessing />
          </Suspense>
        </>
      )}
    </>
  )
}
