import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Raycaster, Sphere, Vector2, Vector3, type Intersection, type Mesh, type MeshStandardMaterial } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useAnatomyStore } from '../store/useAnatomyStore'
import { ensureBoundsTree, meshesBySystem } from './structureRegistry'

/** Estruturas com opacidade efetiva abaixo disso não recebem hover nem clique. */
const MIN_HOVER_OPACITY = 0.2
/** Deslocamento máximo entre pressionar e soltar para contar como clique (e não como arrasto da câmera). */
const CLICK_TOLERANCE_PX = 5

/** Tempo dos raycasts do hover (lido pelo relatório de desempenho via PerfProbe). */
export const hoverStats = { count: 0, totalMs: 0, maxMs: 0 }
const stats = hoverStats

function hoverCandidates(): Mesh[] {
  const { visible } = useAnatomyStore.getState()
  const candidates: Mesh[] = []
  for (const [system, meshes] of meshesBySystem) {
    if (!visible[system]) continue
    for (const mesh of meshes) {
      // userData.shown reflete estruturas ocultas, isolamento e camadas descascadas (a Mesh em si pode estar
      // invisível porque é desenhada no lote); a opacidade do material já é a efetiva, ver SystemModel.
      if (mesh.userData.shown && (mesh.material as MeshStandardMaterial).opacity >= MIN_HOVER_OPACITY) candidates.push(mesh)
    }
  }
  return candidates
}

/** Esfera envolvente em coordenadas de mundo; as malhas são estáticas, então é calculada uma vez. */
function worldSphere(mesh: Mesh): Sphere {
  let sphere: Sphere | undefined = mesh.userData.worldSphere
  if (!sphere) {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
    sphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld)
    mesh.userData.worldSphere = sphere
  }
  return sphere
}

const toCenter = new Vector3()
const hits: Intersection[] = []

/**
 * Raycast "do mais próximo para o mais distante": ordena as malhas pela distância em que o raio entra na
 * esfera envolvente de cada uma e para assim que a próxima esfera começa depois do acerto mais próximo.
 * Evita rodar o BVH das centenas de estruturas que ficam atrás da primeira (pele, músculos, ossos...).
 */
function pickNearest(raycaster: Raycaster, candidates: Mesh[]): Mesh | null {
  const { origin, direction } = raycaster.ray
  const entries: { mesh: Mesh; t: number }[] = []
  for (const mesh of candidates) {
    const { center, radius } = worldSphere(mesh)
    toCenter.subVectors(center, origin)
    const tca = toCenter.dot(direction)
    const d2 = toCenter.lengthSq() - tca * tca
    if (d2 > radius * radius) continue
    const thc = Math.sqrt(radius * radius - d2)
    if (tca + thc < 0) continue
    entries.push({ mesh, t: Math.max(tca - thc, 0) })
  }
  entries.sort((a, b) => a.t - b.t)

  let best: Mesh | null = null
  let bestDistance = Infinity
  for (const { mesh, t } of entries) {
    if (t > bestDistance) break
    hits.length = 0
    ensureBoundsTree(mesh) // o BVH em segundo plano pode ainda não ter chegado nesta malha
    mesh.raycast(raycaster, hits)
    for (const hit of hits) {
      if (hit.distance < bestDistance) {
        bestDistance = hit.distance
        best = mesh
      }
    }
  }
  return best
}

/**
 * Hover e seleção por raycast manual com BVH (three-mesh-bvh): no máximo um raycast por frame, só quando
 * o ponteiro ou a câmera se moveram, e só contra as malhas elegíveis — em vez do sistema de eventos do
 * R3F, que testaria todas as malhas a cada movimento.
 */
export function HoverController() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const raycaster = useMemo(() => {
    const r = new Raycaster()
    r.firstHitOnly = true
    return r
  }, [])
  const pointer = useRef({
    ndc: new Vector2(),
    inside: false,
    dirty: false,
    down: null as { x: number; y: number } | null,
  })

  const pick = useCallback((): string | null => {
    raycaster.setFromCamera(pointer.current.ndc, camera)
    const t0 = performance.now()
    const mesh = pickNearest(raycaster, hoverCandidates())
    const ms = performance.now() - t0
    stats.count += 1
    stats.totalMs += ms
    stats.maxMs = Math.max(stats.maxMs, ms)
    return mesh ? (mesh.userData.anatomyId as string) : null
  }, [camera, raycaster])

  useEffect(() => {
    const el = gl.domElement
    const p = pointer.current
    const { setHovered } = useAnatomyStore.getState()
    // Clique conforme a ferramenta ativa na barra: selecionar, ocultar ou tornar transparente.
    const clickStructure = (id: string | null) => {
      const { tool, selectStructure, setStructuresHidden, toggleTransparent } = useAnatomyStore.getState()
      if (tool === 'selecionar') selectStructure(id) // clique no vazio limpa a seleção
      else if (id && tool === 'ocultar') setStructuresHidden([id], true)
      else if (id && tool === 'transparente') toggleTransparent(new Set([id]))
    }
    const toNdc = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      p.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      toNdc(e)
      p.inside = true
      p.dirty = true
      // Arrastando a câmera: o destaque some até soltar o botão.
      if (p.down && Math.hypot(e.clientX - p.down.x, e.clientY - p.down.y) > CLICK_TOLERANCE_PX) setHovered(null)
    }
    const onLeave = () => {
      p.inside = false
      setHovered(null)
    }
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) p.down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      const down = p.down
      p.down = null
      p.dirty = true
      if (!down || e.button !== 0) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return
      toNdc(e)
      clickStructure(pick())
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [gl, pick])

  // Câmera em movimento (damping, "Resetar vista") muda o que está sob o cursor.
  useEffect(() => {
    if (!controls) return
    const markDirty = () => (pointer.current.dirty = true)
    controls.addEventListener('change', markDirty)
    return () => controls.removeEventListener('change', markDirty)
  }, [controls])

  useFrame(() => {
    const p = pointer.current
    if (!p.dirty || !p.inside || p.down) return
    p.dirty = false
    useAnatomyStore.getState().setHovered(pick())
  })

  return null
}
